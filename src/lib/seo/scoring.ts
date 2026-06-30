/**
 * SEO Autonomy — Phase 2 (Suggestor): scoring engine.
 *
 * Pure logic: reads raw seo_metrics rows + the existing blog posts + whatever is
 * already in the content_actions queue, and proposes new actions:
 *   - refresh:     a post ranking 5–15 with traffic but a CTR below what its
 *                  position should earn → rewrite title/meta/intro.
 *   - new:         a high-impression query no page owns → write a dedicated post.
 *   - consolidate: two+ posts competing for the same query (cannibalization) →
 *                  merge the weaker into the stronger.
 *
 * No I/O here so it is unit-testable without a database. The cron/route layer
 * fetches rows/posts/existing-actions, calls proposeContentActions(), and
 * upserts the results into public.content_actions for human review.
 *
 * Phase 2 only SUGGESTS. Nothing publishes — drafting happens on human approval,
 * auto-scheduling is Phase 3.
 */
import { buildSeoReport, type SeoMetricRow } from './report';

export interface PostRef {
  id: string;
  slug: string;
  /** Canonical pagePath, e.g. "/blog/kitchen-cost-guide". */
  url: string;
}

export interface ExistingAction {
  action_type: string;
  target_post_id: string | null;
  target_query: string | null;
  status: string;
}

export interface ProposedAction {
  action_type: 'refresh' | 'consolidate' | 'new';
  target_post_id: string | null;
  consolidate_into_id: string | null;
  target_query: string | null;
  rationale: Record<string, unknown>;
  expected_lift_clicks: number | null;
}

// Default caps so the queue stays reviewable, not a dumping ground.
export const SCORING_LIMITS = { refresh: 10, new: 5, consolidate: 5 } as const;

// An action already "in flight" — don't re-propose the same target.
const OPEN_STATUSES = new Set(['pending', 'approved', 'drafted']);

/**
 * Rough organic CTR-by-position baseline. Used to (a) estimate the CTR a page
 * *should* earn at its current rank, and (b) estimate clicks a brand-new page
 * could win if it reached page one. Intentionally conservative.
 */
export function ctrBaseline(position: number): number {
  if (position <= 1) return 0.28;
  if (position <= 2) return 0.15;
  if (position <= 3) return 0.1;
  if (position <= 4) return 0.07;
  if (position <= 5) return 0.05;
  if (position <= 6) return 0.04;
  if (position <= 7) return 0.035;
  if (position <= 8) return 0.03;
  if (position <= 9) return 0.025;
  if (position <= 10) return 0.022;
  if (position <= 15) return 0.018;
  return 0.01;
}

function normalize(path: string): string {
  if (!path) return '/';
  let p = path;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * Propose content actions from the current metrics window.
 * `now` anchors the report window (28 days). Returns at most SCORING_LIMITS of
 * each type, sorted by expected click-lift, excluding anything already queued.
 */
export function proposeContentActions(
  rows: SeoMetricRow[],
  posts: PostRef[],
  existing: ExistingAction[],
  now: Date,
): ProposedAction[] {
  const report = buildSeoReport(rows, now);
  const byUrl = new Map<string, PostRef>(posts.map((p) => [normalize(p.url), p]));

  // What's already in flight, so we don't duplicate.
  const openRefreshPosts = new Set<string>();
  const openNewQueries = new Set<string>();
  const openConsolidatePosts = new Set<string>();
  for (const a of existing) {
    if (!OPEN_STATUSES.has(a.status)) continue;
    if (a.action_type === 'refresh' && a.target_post_id) openRefreshPosts.add(a.target_post_id);
    if (a.action_type === 'new' && a.target_query) openNewQueries.add(a.target_query.toLowerCase());
    if (a.action_type === 'consolidate' && a.target_post_id) openConsolidatePosts.add(a.target_post_id);
  }

  const out: ProposedAction[] = [];

  // Map each query → the owned posts ranking for it (used by both consolidate
  // and to keep "new" from suggesting a page for a query we already own).
  const gscOwned = rows.filter((r) => r.source === 'gsc' && r.query);
  const byQuery = new Map<string, Map<string, number>>(); // query -> postId -> impressions
  for (const r of gscOwned) {
    const post = byUrl.get(normalize(r.url));
    if (!post) continue;
    const q = (r.query as string).toLowerCase();
    const m = byQuery.get(q) ?? new Map<string, number>();
    m.set(post.id, (m.get(post.id) ?? 0) + r.impressions);
    byQuery.set(q, m);
  }
  const ownedQueries = new Set<string>();
  for (const [q, m] of byQuery) {
    if ([...m.values()].some((imp) => imp >= 50)) ownedQueries.add(q);
  }

  // ─── refresh ────────────────────────────────────────────────────────────────
  const refresh: ProposedAction[] = [];
  for (const c of report.refresh_candidates) {
    const post = byUrl.get(normalize(c.url));
    if (!post || openRefreshPosts.has(post.id)) continue; // only posts we own + not already queued
    const pos = c.avg_position ?? 12;
    const currentCtr = c.ctr ?? 0;
    const target = ctrBaseline(pos);
    const lift = Math.max(0, Math.round(c.impressions * (target - currentCtr)));
    if (lift <= 0) continue;
    refresh.push({
      action_type: 'refresh',
      target_post_id: post.id,
      consolidate_into_id: null,
      target_query: c.query,
      rationale: {
        reason: 'Ranks on the cusp but under-earns clicks for its position.',
        url: c.url,
        query: c.query,
        impressions: c.impressions,
        avg_position: c.avg_position,
        current_ctr: currentCtr,
        target_ctr: target,
      },
      expected_lift_clicks: lift,
    });
  }
  refresh.sort((a, b) => (b.expected_lift_clicks ?? 0) - (a.expected_lift_clicks ?? 0));
  out.push(...refresh.slice(0, SCORING_LIMITS.refresh));

  // ─── new ──────────────────────────────────────────────────────────────────────
  const fresh: ProposedAction[] = [];
  for (const c of report.new_article_candidates) {
    const ql = c.query.toLowerCase();
    if (openNewQueries.has(ql)) continue;
    if (ownedQueries.has(ql)) continue; // we already have a page ranking for this — see consolidate/refresh
    // Conservative: a focused new page could plausibly reach ~position 8.
    const lift = Math.max(0, Math.round(c.impressions * ctrBaseline(8)));
    fresh.push({
      action_type: 'new',
      target_post_id: null,
      consolidate_into_id: null,
      target_query: c.query,
      rationale: {
        reason: 'High impressions with no page that owns this query.',
        query: c.query,
        impressions: c.impressions,
        current_ctr: c.ctr,
        ranking_urls: c.ranking_urls,
      },
      expected_lift_clicks: lift,
    });
  }
  fresh.sort((a, b) => (b.expected_lift_clicks ?? 0) - (a.expected_lift_clicks ?? 0));
  out.push(...fresh.slice(0, SCORING_LIMITS.new));

  // ─── consolidate (keyword cannibalization) ───────────────────────────────────
  // 2+ owned posts on the same query means they split authority; merge the
  // weaker into the stronger. Reuses the byQuery map built above.
  const postById = new Map(posts.map((p) => [p.id, p]));
  const consolidate: ProposedAction[] = [];
  for (const [query, m] of byQuery) {
    const owners = [...m.entries()].filter(([, imp]) => imp >= 50).sort((a, b) => b[1] - a[1]);
    if (owners.length < 2) continue;
    const [winnerId, winnerImp] = owners[0];
    const [loserId, loserImp] = owners[1];
    if (openConsolidatePosts.has(loserId)) continue;
    consolidate.push({
      action_type: 'consolidate',
      target_post_id: loserId, // the weaker page to fold in
      consolidate_into_id: winnerId, // the page to keep
      target_query: query,
      rationale: {
        reason: 'Two posts compete for the same query (cannibalization).',
        query,
        keep: postById.get(winnerId)?.url,
        keep_impressions: winnerImp,
        fold_in: postById.get(loserId)?.url,
        fold_in_impressions: loserImp,
      },
      expected_lift_clicks: Math.round((winnerImp + loserImp) * 0.01),
    });
  }
  consolidate.sort((a, b) => (b.expected_lift_clicks ?? 0) - (a.expected_lift_clicks ?? 0));
  out.push(...consolidate.slice(0, SCORING_LIMITS.consolidate));

  return out;
}
