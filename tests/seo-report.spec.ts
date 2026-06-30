import { test, expect } from '@playwright/test';
import { buildSeoReport, reportWindow, type SeoMetricRow } from '../src/lib/seo/report';
import { renderSeoReportEmail } from '../src/lib/seo/reportEmail';

/**
 * Unit tests for the SEO Observer report builder + email renderer.
 * Pure logic — no server, no Supabase, no Google creds — so this runs in CI.
 *
 * Acceptance criteria:
 *  1. buildSeoReport flags a pos 5–15 / low-CTR page as a refresh candidate.
 *  2. It flags a high-impression / low-CTR query with no owning page as a new-article idea.
 *  3. GA4 conversions surface as "winners".
 *  4. 14d-vs-prior-14d click swings surface in trend.
 *  5. The email renderer produces a subject + HTML (with sections) + plain-text fallback.
 */

const NOW = new Date('2026-06-30T00:00:00Z');
// window(NOW): start 2026-06-02, split 2026-06-16, end 2026-06-30.
const RECENT = '2026-06-20'; // >= split → counts as "recent"
const PRIOR = '2026-06-10'; //  < split → counts as "prior"

function gsc(partial: Partial<SeoMetricRow> & { url: string; date: string }): SeoMetricRow {
  return {
    source: 'gsc', query: null, impressions: 0, clicks: 0, position: null, ctr: null,
    users: 0, engaged_sessions: 0, conversions: 0, ...partial,
  };
}
function ga4(partial: Partial<SeoMetricRow> & { url: string; date: string }): SeoMetricRow {
  return {
    source: 'ga4', query: null, impressions: 0, clicks: 0, position: null, ctr: null,
    users: 0, engaged_sessions: 0, conversions: 0, ...partial,
  };
}

const ROWS: SeoMetricRow[] = [
  // Kitchen page: recent + prior. Pos 11 / ~2% CTR / >100 impr → refresh candidate.
  // Recent clicks (22) >> prior clicks (5) → positive trend.
  gsc({ url: '/services/kitchen-remodeling', query: 'kitchen remodel cost nj', date: RECENT, impressions: 880, clicks: 22, position: 11.4 }),
  gsc({ url: '/services/kitchen-remodeling', query: 'kitchen remodel cost nj', date: PRIOR, impressions: 400, clicks: 5, position: 11 }),
  // High-impression query, ~1% CTR, ranking deep (pos 18, outside refresh band) → new-article idea only.
  gsc({ url: '/blog/some-old-post', query: 'basement remodel nj', date: RECENT, impressions: 300, clicks: 3, position: 18 }),
  // GA4 conversion winner.
  ga4({ url: '/free-estimate', date: RECENT, users: 140, engaged_sessions: 90, conversions: 12 }),
];

test('reportWindow spans 28 days split at 14', () => {
  const w = reportWindow(NOW);
  expect(w.startDate).toBe('2026-06-02');
  expect(w.splitDate).toBe('2026-06-16');
  expect(w.endDate).toBe('2026-06-30');
});

test('buildSeoReport surfaces refresh / new-article / winners / trend', () => {
  const r = buildSeoReport(ROWS, NOW);

  const refresh = r.refresh_candidates.find((c) => c.url === '/services/kitchen-remodeling');
  expect(refresh, 'kitchen page should be a refresh candidate').toBeTruthy();
  expect(refresh!.impressions).toBe(1280);
  expect(refresh!.ctr!).toBeLessThan(0.04);

  const idea = r.new_article_candidates.find((c) => c.query === 'basement remodel nj');
  expect(idea, 'low-CTR query should be a new-article idea').toBeTruthy();

  const winner = r.winners.find((w) => w.url === '/free-estimate');
  expect(winner?.conversions).toBe(12);

  const move = r.trend.find((t) => t.url === '/services/kitchen-remodeling');
  expect(move, 'kitchen page should appear in trend').toBeTruthy();
  expect(move!.delta).toBe(17); // 22 recent − 5 prior

  expect(r.totals.clicks_total).toBe(30); // 22 + 5 + 3
  expect(r.totals.conversions_total).toBe(12);
});

test('renderSeoReportEmail produces subject, html sections, and text fallback', () => {
  const r = buildSeoReport(ROWS, NOW);
  const { subject, html, text } = renderSeoReportEmail(r);

  expect(subject).toContain('SEO weekly');
  expect(html).toContain('Refresh candidates');
  expect(html).toContain('/services/kitchen-remodeling');
  expect(html).toContain('free-estimate');
  expect(html).toContain('New-article ideas');
  expect(text).toContain('REFRESH CANDIDATES');
  expect(text).toContain('basement remodel nj');
});

test('empty input yields an empty-but-valid report', () => {
  const r = buildSeoReport([], NOW);
  expect(r.refresh_candidates).toEqual([]);
  expect(r.winners).toEqual([]);
  expect(r.totals.clicks_total).toBe(0);
  // Renderer must not throw on empty data.
  const { html } = renderSeoReportEmail(r);
  expect(html).toContain('Weekly Search Report');
});
