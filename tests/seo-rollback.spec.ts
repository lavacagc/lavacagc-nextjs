import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { join } from 'path';
import { assessRollback, windowMetrics } from '../src/lib/seo/rollback';

/**
 * Phase 3 guardrail: 14-day CTR rollback decision logic. Pure — runs in CI.
 *
 * Acceptance criteria:
 *  1. A refresh whose CTR fell >20% below baseline (with enough impressions) → revert.
 *  2. A refresh whose CTR held → keep.
 *  3. Too few impressions → insufficient_data (never revert on noise).
 *  4. A new post (no baseline) is NEVER reverted — reported only.
 *  5. windowMetrics aggregates clicks/impressions/CTR.
 *  6. The cron route is wired.
 */

test('refresh with >20% CTR drop and enough signal → revert', () => {
  const a = assessRollback({ hasBaseline: true, baselineCtr: 0.05, currentCtr: 0.03, impressions: 200 });
  expect(a.verdict).toBe('revert');
});

test('refresh whose CTR held → keep', () => {
  const a = assessRollback({ hasBaseline: true, baselineCtr: 0.05, currentCtr: 0.048, impressions: 200 });
  expect(a.verdict).toBe('keep');
});

test('not enough impressions → insufficient_data (no revert on noise)', () => {
  const a = assessRollback({ hasBaseline: true, baselineCtr: 0.05, currentCtr: 0.0, impressions: 5 });
  expect(a.verdict).toBe('insufficient_data');
});

test('new post (no baseline) is never reverted', () => {
  const a = assessRollback({ hasBaseline: false, baselineCtr: null, currentCtr: 0.0, impressions: 500 });
  expect(a.verdict).toBe('insufficient_data');
});

test('windowMetrics aggregates correctly', () => {
  const m = windowMetrics([
    { clicks: 2, impressions: 100, position: 8 },
    { clicks: 1, impressions: 50, position: 12 },
  ]);
  expect(m.clicks).toBe(3);
  expect(m.impressions).toBe(150);
  expect(m.ctr).toBeCloseTo(0.02, 5);
  expect(m.avg_position).toBeCloseTo(10, 5);
});

test('rollback cron route is wired', () => {
  expect(existsSync(join(process.cwd(), 'src/app/api/cron/seo-rollback/route.ts'))).toBe(true);
});
