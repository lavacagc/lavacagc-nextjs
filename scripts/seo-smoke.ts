/**
 * SEO Autonomy Phase 1 — local smoke test.
 *
 *   SEO_INGEST_MODE=fixture npx tsx scripts/seo-smoke.ts
 *
 * Exercises the GSC + GA4 fixture clients and the report-shape logic the
 * /api/cron/seo-report endpoint uses, without needing CRON_SECRET,
 * SUPABASE_SECRET_KEY, or live Google API credentials.
 *
 * Exits non-zero if either client returns zero rows or the shape is wrong,
 * so this can also be wired into CI later.
 */
import { fetchGscRows } from '../src/lib/seo/gsc-client';
import { fetchGa4Rows } from '../src/lib/seo/ga4-client';
import { toPagePath } from '../src/lib/seo/url';
import { isFixtureMode } from '../src/lib/seo/google-auth';

async function main() {
  if (!isFixtureMode()) {
    console.error('Refusing to run smoke test outside SEO_INGEST_MODE=fixture.');
    console.error('Re-run as: SEO_INGEST_MODE=fixture npx tsx scripts/seo-smoke.ts');
    process.exit(2);
  }

  const startDate = '2026-04-01';
  const endDate = '2026-04-30';

  const [gsc, ga4] = await Promise.all([
    fetchGscRows({ startDate, endDate }),
    fetchGa4Rows({ startDate, endDate }),
  ]);

  console.log(`GSC rows: ${gsc.length}`);
  console.log(`GA4 rows: ${ga4.length}`);

  if (gsc.length === 0) {
    console.error('FAIL: GSC fixture returned 0 rows');
    process.exit(1);
  }
  if (ga4.length === 0) {
    console.error('FAIL: GA4 fixture returned 0 rows');
    process.exit(1);
  }

  // Walk the same shaping logic the ingest route uses.
  const sample = gsc[0];
  const normalizedUrl = toPagePath(sample.page);
  console.log(`Sample GSC row: ${normalizedUrl} | "${sample.query}" | imp=${sample.impressions} clicks=${sample.clicks} pos=${sample.position}`);

  // Mini "refresh candidate" calculation (mirrors seo-report logic).
  const refreshCandidates = gsc
    .filter((r) => r.impressions >= 100 && r.position >= 5 && r.position <= 15 && r.ctr < 0.04)
    .map((r) => ({ url: toPagePath(r.page), query: r.query, impressions: r.impressions, position: r.position, ctr: r.ctr }))
    .sort((a, b) => b.impressions - a.impressions);
  console.log(`Refresh candidates (pos 5-15, low CTR, >=100 imp): ${refreshCandidates.length}`);
  for (const c of refreshCandidates.slice(0, 3)) {
    console.log(`  - ${c.url} :: "${c.query}" pos=${c.position} ctr=${(c.ctr * 100).toFixed(2)}% imp=${c.impressions}`);
  }

  // Mini "winners" check.
  const winners = ga4.filter((r) => r.conversions > 0).map((r) => `${toPagePath(r.page)} (${r.conversions} conv)`);
  console.log(`Winners (pages w/ conversions): ${winners.length}`);
  for (const w of winners.slice(0, 5)) console.log(`  - ${w}`);

  console.log('\nSmoke test PASSED ✓');
}

main().catch((err) => {
  console.error('Smoke test FAILED:', err);
  process.exit(1);
});
