/**
 * What Claude Code reads before it writes: per-page search performance from
 * `seo_metrics`, which pages are decaying, the report's refresh and new-article
 * candidates, and the open queue (GET /api/articles/seo-feedback, FB1 to FB4).
 *
 * buildSeoFeedback is pure so the shape is unit-tested from fixture rows; the
 * route only loads the rows, with every read capped.
 */
import { buildSeoReport, type SeoMetricRow } from '@/lib/seo/report';
import { proposeContentActions, type ExistingAction, type PostRef, type ProposedAction } from '@/lib/seo/scoring';
import { toPagePath } from '@/lib/seo/url';

/** At most this many page rows in one answer (FB4). */
export const FEEDBACK_MAX_PAGES = 200;
/** The trend compares the last 14 days of clicks with the 14 before (FB1). */
export const TREND_HALF_DAYS = 14;

export interface FeedbackPost {
  id: string;
  slug: string;
  title: string;
  published_at: string | null;
}

export interface FeedbackAction {
  id: string;
  action_type: 'refresh' | 'consolidate' | 'new';
  target_post_id: string | null;
  consolidate_into_id: string | null;
  target_query: string | null;
  rationale: Record<string, unknown> | null;
  status: string;
}

export interface FeedbackPage {
  path: string;
  impressions: number;
  clicks: number;
  /** clicks / impressions over the window, 4 decimals; null with no impressions. */
  ctr: number | null;
  /** Impression-weighted average position, 2 decimals; null when GSC gave none. */
  position: number | null;
  /** Clicks in the last 14 days minus clicks in the 14 days before. */
  trend_delta: number;
  decaying: boolean;
  post?: FeedbackPost;
}

export interface SeoFeedback {
  window: { days: number; startDate: string; endDate: string; trendSplitDate: string };
  pages: FeedbackPage[];
  /** Pages beyond the cap, so a caller can tell the estate from the cap. */
  pages_total: number;
  refresh_candidates: ReturnType<typeof buildSeoReport>['refresh_candidates'];
  new_article_candidates: ReturnType<typeof buildSeoReport>['new_article_candidates'];
  /** What the weekly scorer would queue now that is not already open. */
  suggested_actions: ProposedAction[];
  open_actions: Array<{
    id: string;
    kind: FeedbackAction['action_type'];
    status: string;
    target: { query: string | null; post?: FeedbackPost; consolidate_into?: FeedbackPost };
    rationale: Record<string, unknown> | null;
  }>;
  /** True when the metric read stopped at its row cap. */
  truncated: boolean;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBefore(now: Date, days: number): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return isoDate(d);
}

/** The dates the route reads: the larger of the window and the 28-day trend span. */
export function feedbackReadStart(now: Date, days: number): string {
  return daysBefore(now, Math.max(days, TREND_HALF_DAYS * 2));
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** `/blog/<slug>` -> slug, for the join to blog_posts (FB2). */
export function blogSlugOf(path: string): string | null {
  const m = /^\/blog\/([a-z0-9][a-z0-9-]*)\/?$/i.exec(path);
  return m && m[1] !== 'preview' ? m[1].toLowerCase() : null;
}

export function buildSeoFeedback(input: {
  rows: SeoMetricRow[];
  posts: FeedbackPost[];
  actions: FeedbackAction[];
  now: Date;
  days: number;
  truncated?: boolean;
}): SeoFeedback {
  const { now, days } = input;
  const startDate = daysBefore(now, days);
  const endDate = isoDate(now);
  const trendSplitDate = daysBefore(now, TREND_HALF_DAYS);
  const trendStart = daysBefore(now, TREND_HALF_DAYS * 2);

  const gsc = input.rows
    .filter((r) => r.source === 'gsc')
    .map((r) => ({ ...r, url: toPagePath(r.url) }));

  const byPath = new Map<string, { impressions: number; clicks: number; posWeight: number; posImpr: number; recent: number; prior: number }>();
  for (const r of gsc) {
    const cur = byPath.get(r.url) ?? { impressions: 0, clicks: 0, posWeight: 0, posImpr: 0, recent: 0, prior: 0 };
    const impressions = Number(r.impressions) || 0;
    const clicks = Number(r.clicks) || 0;
    if (r.date >= startDate && r.date <= endDate) {
      cur.impressions += impressions;
      cur.clicks += clicks;
      const pos = Number(r.position);
      if (r.position !== null && Number.isFinite(pos) && pos > 0) {
        cur.posWeight += pos * Math.max(impressions, 1);
        cur.posImpr += Math.max(impressions, 1);
      }
    }
    if (r.date >= trendSplitDate) cur.recent += clicks;
    else if (r.date >= trendStart) cur.prior += clicks;
    byPath.set(r.url, cur);
  }

  const postBySlug = new Map(input.posts.map((p) => [p.slug.toLowerCase(), p]));
  const postById = new Map(input.posts.map((p) => [p.id, p]));

  const allPages: FeedbackPage[] = [...byPath.entries()]
    .filter(([, v]) => v.impressions > 0 || v.clicks > 0 || v.recent !== v.prior)
    .map(([path, v]) => {
      const trend = v.recent - v.prior;
      const slug = blogSlugOf(path);
      const post = slug ? postBySlug.get(slug) : undefined;
      return {
        path,
        impressions: v.impressions,
        clicks: v.clicks,
        ctr: v.impressions > 0 ? round(v.clicks / v.impressions, 4) : null,
        position: v.posImpr > 0 ? round(v.posWeight / v.posImpr, 2) : null,
        trend_delta: trend,
        decaying: trend < 0,
        ...(post ? { post } : {}),
      };
    })
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || a.path.localeCompare(b.path));

  // The report and the scorer take their own 28-day window from `now`.
  const report = buildSeoReport(input.rows, now);
  const postRefs: PostRef[] = input.posts.map((p) => ({ id: p.id, slug: p.slug, url: `/blog/${p.slug}` }));
  const existing: ExistingAction[] = input.actions.map((a) => ({
    action_type: a.action_type,
    target_post_id: a.target_post_id,
    target_query: a.target_query,
    status: a.status,
  }));
  const suggested = proposeContentActions(input.rows, postRefs, existing, now);

  return {
    window: { days, startDate, endDate, trendSplitDate },
    pages: allPages.slice(0, FEEDBACK_MAX_PAGES),
    pages_total: allPages.length,
    refresh_candidates: report.refresh_candidates,
    new_article_candidates: report.new_article_candidates,
    suggested_actions: suggested,
    open_actions: input.actions.map((a) => {
      const post = a.target_post_id ? postById.get(a.target_post_id) : undefined;
      const into = a.consolidate_into_id ? postById.get(a.consolidate_into_id) : undefined;
      return {
        id: a.id,
        kind: a.action_type,
        status: a.status,
        target: { query: a.target_query, ...(post ? { post } : {}), ...(into ? { consolidate_into: into } : {}) },
        rationale: a.rationale,
      };
    }),
    truncated: !!input.truncated,
  };
}
