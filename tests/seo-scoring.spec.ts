import { test, expect } from '@playwright/test';
import { proposeContentActions, ctrBaseline, type PostRef, type ExistingAction } from '../src/lib/seo/scoring';
import type { SeoMetricRow } from '../src/lib/seo/report';

/**
 * Unit tests for the Phase 2 scoring engine. Pure logic — no DB, runs in CI.
 *
 * Acceptance criteria:
 *  1. An owned post ranking 5–15 that under-earns its position → a `refresh`
 *     action with positive expected lift.
 *  2. A high-impression query no page owns → a `new` action.
 *  3. Two owned posts on the same query → a `consolidate` action (weaker folds
 *     into stronger).
 *  4. A query we already own is NOT proposed as a `new` article.
 *  5. Targets already in the queue (open) are not re-proposed.
 */

const NOW = new Date('2026-06-30T00:00:00Z');
const D = '2026-06-20';

function gsc(p: Partial<SeoMetricRow> & { url: string }): SeoMetricRow {
  return {
    source: 'gsc', query: null, date: D, impressions: 0, clicks: 0, position: null, ctr: null,
    users: 0, engaged_sessions: 0, conversions: 0, ...p,
  };
}

const POSTS: PostRef[] = [
  { id: 'p1', slug: 'kitchen-cost-guide', url: '/blog/kitchen-cost-guide' },
  { id: 'p2', slug: 'bath-a', url: '/blog/bath-a' },
  { id: 'p3', slug: 'bath-b', url: '/blog/bath-b' },
];

const ROWS: SeoMetricRow[] = [
  // refresh: owned post, pos ~7, CTR (0.0205) below the position baseline.
  gsc({ url: '/blog/kitchen-cost-guide', query: 'kitchen remodel cost nj', impressions: 880, clicks: 18, position: 7.2 }),
  // new: high-impression query on a page we DON'T own (orphan).
  gsc({ url: '/blog/orphan-not-ours', query: 'basement remodel nj', impressions: 300, clicks: 3, position: 18 }),
  // consolidate: two owned posts competing for the same query.
  gsc({ url: '/blog/bath-a', query: 'bathroom remodel nj', impressions: 200, clicks: 4, position: 9 }),
  gsc({ url: '/blog/bath-b', query: 'bathroom remodel nj', impressions: 150, clicks: 2, position: 12 }),
];

test('ctrBaseline decreases with worse position', () => {
  expect(ctrBaseline(1)).toBeGreaterThan(ctrBaseline(8));
  expect(ctrBaseline(8)).toBeGreaterThan(ctrBaseline(20));
});

test('proposes refresh / new / consolidate from real signals', () => {
  const actions = proposeContentActions(ROWS, POSTS, [], NOW);

  const refresh = actions.find((a) => a.action_type === 'refresh' && a.target_post_id === 'p1');
  expect(refresh, 'refresh for the owned kitchen post').toBeTruthy();
  expect(refresh!.expected_lift_clicks!).toBeGreaterThan(0);

  const fresh = actions.find((a) => a.action_type === 'new' && a.target_query?.toLowerCase() === 'basement remodel nj');
  expect(fresh, 'new article for the unowned query').toBeTruthy();

  const consolidate = actions.find((a) => a.action_type === 'consolidate');
  expect(consolidate, 'consolidate for the cannibalized query').toBeTruthy();
  expect(consolidate!.target_post_id).toBe('p3'); // weaker (150 impr) folds in
  expect(consolidate!.consolidate_into_id).toBe('p2'); // stronger (200 impr) kept
});

test('does not propose a NEW article for a query we already own', () => {
  const actions = proposeContentActions(ROWS, POSTS, [], NOW);
  const ownedAsNew = actions.find(
    (a) => a.action_type === 'new' && a.target_query?.toLowerCase() === 'bathroom remodel nj',
  );
  expect(ownedAsNew, 'owned query must not be a new-article suggestion').toBeFalsy();
});

test('does not re-propose targets already in the queue', () => {
  const existing: ExistingAction[] = [
    { action_type: 'refresh', target_post_id: 'p1', target_query: null, status: 'pending' },
    { action_type: 'new', target_post_id: null, target_query: 'basement remodel nj', status: 'approved' },
  ];
  const actions = proposeContentActions(ROWS, POSTS, existing, NOW);
  expect(actions.find((a) => a.action_type === 'refresh' && a.target_post_id === 'p1')).toBeFalsy();
  expect(actions.find((a) => a.action_type === 'new' && a.target_query?.toLowerCase() === 'basement remodel nj')).toBeFalsy();
});

test('rejected actions do NOT block re-proposing (only open statuses dedupe)', () => {
  const existing: ExistingAction[] = [
    { action_type: 'refresh', target_post_id: 'p1', target_query: null, status: 'rejected' },
  ];
  const actions = proposeContentActions(ROWS, POSTS, existing, NOW);
  // rejected ≠ open, so p1 can be proposed again on a later run
  expect(actions.find((a) => a.action_type === 'refresh' && a.target_post_id === 'p1')).toBeTruthy();
});
