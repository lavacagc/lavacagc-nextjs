/**
 * SEO Autonomy — Phase 1 (Observer): pure report-shaping logic.
 *
 * Extracted from the /api/cron/seo-report route so it can be unit-tested
 * without a database and reused by the email renderer. Takes raw seo_metrics
 * rows + a reference date and returns the structured insight report.
 *
 * Phase 1 takes NO action — this only describes opportunities. Phase 2 reads
 * the same signals to enqueue content_actions for human review.
 */

export interface SeoMetricRow {
  source: 'gsc' | 'ga4';
  url: string;
  query: string | null;
  date: string;
  impressions: number;
  clicks: number;
  position: number | null;
  ctr: number | null;
  users: number;
  engaged_sessions: number;
  conversions: number;
}

export interface RefreshCandidate {
  url: string;
  query: string | null;
  impressions: number;
  clicks: number;
  avg_position: number | null;
  ctr: number | null;
}

export interface Winner {
  url: string;
  conversions: number;
  users: number;
}

export interface NewArticleCandidate {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number;
  ranking_urls: string[];
}

export interface TrendItem {
  url: string;
  recent_clicks: number;
  prior_clicks: number;
  delta: number;
}

export interface SeoReport {
  window: { startDate: string; endDate: string; splitDate: string };
  totals: {
    gsc_rows: number;
    ga4_rows: number;
    clicks_total: number;
    impressions_total: number;
    conversions_total: number;
  };
  refresh_candidates: RefreshCandidate[];
  winners: Winner[];
  new_article_candidates: NewArticleCandidate[];
  trend: TrendItem[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sumBy<T>(items: T[], pick: (x: T) => number): number {
  let s = 0;
  for (const x of items) s += pick(x) || 0;
  return s;
}

function avg(nums: number[]): number | null {
  const valid = nums.filter((n) => Number.isFinite(n));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Inclusive 28-day window ending at `now`, split into recent/prior 14-day halves. */
export function reportWindow(now: Date): { startDate: string; endDate: string; splitDate: string } {
  const lookbackStart = new Date(now);
  lookbackStart.setUTCDate(lookbackStart.getUTCDate() - 28);
  const halfway = new Date(now);
  halfway.setUTCDate(halfway.getUTCDate() - 14);
  return { startDate: isoDate(lookbackStart), endDate: isoDate(now), splitDate: isoDate(halfway) };
}

/**
 * Build the insight report from raw metric rows. Pure — no I/O.
 * `rows` should already be filtered to the desired date window.
 */
export function buildSeoReport(rows: SeoMetricRow[], now: Date): SeoReport {
  const { startDate, endDate, splitDate } = reportWindow(now);

  const all = rows ?? [];
  const gsc = all.filter((r) => r.source === 'gsc');
  const ga4 = all.filter((r) => r.source === 'ga4');

  // ─── refresh_candidates ──────────────────────────────────────────────────
  // Pages ranking 5–15 with high impressions but a CTR below the
  // position-implied baseline = "rewrite the title/meta/intro to win clicks".
  const byUrlQuery = new Map<string, SeoMetricRow[]>();
  for (const r of gsc) {
    const key = `${r.url}\x00${r.query ?? ''}`;
    const list = byUrlQuery.get(key) ?? [];
    list.push(r);
    byUrlQuery.set(key, list);
  }

  const refreshCandidates: RefreshCandidate[] = [];
  for (const [key, list] of byUrlQuery) {
    const [url, queryRaw] = key.split('\x00');
    const query = queryRaw || null;
    const impressions = sumBy(list, (x) => x.impressions);
    const clicks = sumBy(list, (x) => x.clicks);
    const avgPos = avg(list.map((x) => Number(x.position)).filter(Boolean));
    const ctr = impressions > 0 ? clicks / impressions : null;
    // Floors tuned for a low-volume site: page-1/2 (pos 5–20) with even a
    // handful of impressions and soft CTR. Counts are capped downstream, so low
    // floors won't flood a higher-volume site.
    if (impressions >= 15 && avgPos !== null && avgPos >= 5 && avgPos <= 20 && (ctr === null || ctr < 0.05)) {
      refreshCandidates.push({ url, query, impressions, clicks, avg_position: avgPos, ctr });
    }
  }
  refreshCandidates.sort((a, b) => b.impressions - a.impressions);

  // ─── winners (don't break these) ───────────────────────────────────────────
  const winnersByUrl = new Map<string, { conversions: number; users: number }>();
  for (const r of ga4) {
    const cur = winnersByUrl.get(r.url) ?? { conversions: 0, users: 0 };
    cur.conversions += r.conversions || 0;
    cur.users += r.users || 0;
    winnersByUrl.set(r.url, cur);
  }
  const winners: Winner[] = [...winnersByUrl.entries()]
    .filter(([, v]) => v.conversions > 0)
    .map(([url, v]) => ({ url, conversions: v.conversions, users: v.users }))
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 25);

  // ─── new_article_candidates ────────────────────────────────────────────────
  // Queries with meaningful impressions that no single URL owns well.
  const byQuery = new Map<string, { impressions: number; clicks: number; urls: Set<string> }>();
  for (const r of gsc) {
    if (!r.query) continue;
    const cur = byQuery.get(r.query) ?? { impressions: 0, clicks: 0, urls: new Set<string>() };
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    cur.urls.add(r.url);
    byQuery.set(r.query, cur);
  }
  const newArticleCandidates: NewArticleCandidate[] = [...byQuery.entries()]
    .filter(([, v]) => v.impressions >= 25 && v.clicks / Math.max(v.impressions, 1) < 0.03)
    .map(([query, v]) => ({
      query,
      impressions: v.impressions,
      clicks: v.clicks,
      ctr: v.clicks / v.impressions,
      ranking_urls: [...v.urls],
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);

  // ─── trend (recent 14d vs prior 14d clicks per page) ────────────────────────
  const trendByUrl = new Map<string, { recent: number; prior: number }>();
  for (const r of gsc) {
    const cur = trendByUrl.get(r.url) ?? { recent: 0, prior: 0 };
    if (r.date >= splitDate) cur.recent += r.clicks;
    else cur.prior += r.clicks;
    trendByUrl.set(r.url, cur);
  }
  const trend: TrendItem[] = [...trendByUrl.entries()]
    .map(([url, v]) => ({ url, recent_clicks: v.recent, prior_clicks: v.prior, delta: v.recent - v.prior }))
    .filter((x) => Math.abs(x.delta) >= 2)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 25);

  return {
    window: { startDate, endDate, splitDate },
    totals: {
      gsc_rows: gsc.length,
      ga4_rows: ga4.length,
      clicks_total: sumBy(gsc, (x) => x.clicks),
      impressions_total: sumBy(gsc, (x) => x.impressions),
      conversions_total: sumBy(ga4, (x) => x.conversions),
    },
    refresh_candidates: refreshCandidates.slice(0, 25),
    winners,
    new_article_candidates: newArticleCandidates,
    trend,
  };
}
