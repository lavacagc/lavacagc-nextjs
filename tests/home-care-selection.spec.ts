import { test, expect } from '@playwright/test';
import { resolveMemberTasks, isRowCurrent, type MaintenanceRow } from '../src/lib/homecare/selection';
import { filterTasksForProfile } from '../src/lib/homecare/profile';
import { buildNewsletter, type NewsletterTask } from '../src/lib/homecare/newsletter';

/**
 * Regression suite for the two personalization holes in the monthly newsletter:
 * pre-listing tasks reaching every member, and already-completed tasks being
 * re-nagged. Both were correct on the checklist page and wrong in the cron.
 */
type Task = NewsletterTask & { stages?: string[] };

const CATALOG: Task[] = [
  { key: 'clean_gutters', title: 'Clean the gutters', blurb: 'Before the leaves drop.', bookable: true, diy_or_pro: 'pro', priority: 10, applies_to: ['all'], stages: ['all'] },
  { key: 'test_smoke_co', title: 'Test detectors', blurb: 'Press test.', bookable: false, diy_or_pro: 'diy', priority: 9, applies_to: ['all'], stages: ['all'] },
  { key: 'sell_pre_inspection', title: 'Consider a pre-listing inspection', blurb: 'No surprises.', bookable: true, diy_or_pro: 'pro', priority: 8, applies_to: ['all'], stages: ['selling'] },
  { key: 'nc_settling_cracks', title: 'Watch for settling cracks', blurb: 'Builder warranty.', bookable: false, diy_or_pro: 'diy', priority: 7, applies_to: ['all'], stages: ['new_construction'] },
  { key: 'pool_close', title: 'Winterize the pool', blurb: 'Before the freeze.', bookable: true, diy_or_pro: 'either', priority: 6, applies_to: ['pool'], stages: ['all'] },
];
const keys = (t: { key: string }[]) => t.map((x) => x.key).sort();

test('stage gate: a non-selling member never sees pre-listing tasks', () => {
  const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows: [] });
  expect(keys(r.visible)).not.toContain('sell_pre_inspection');
  expect(keys(r.visible)).not.toContain('nc_settling_cracks');
  expect(keys(r.visible)).toEqual(['clean_gutters', 'test_smoke_co']);
});

test('stage gate: a selling member sees pre-listing but not new-construction', () => {
  const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'selling', rows: [] });
  expect(keys(r.visible)).toContain('sell_pre_inspection');
  expect(keys(r.visible)).not.toContain('nc_settling_cracks');
});

test('stage gate FAILS CLOSED: no stage set hides stage-specific tasks', () => {
  // Previously a null stage skipped the gate entirely, so anyone who had not
  // finished the questionnaire was told to prep their house for sale.
  const r = resolveMemberTasks({ catalog: CATALOG, systems: null, stage: null, rows: [] });
  expect(keys(r.visible)).not.toContain('sell_pre_inspection');
  expect(keys(r.visible)).not.toContain('nc_settling_cracks');
  // Universal tasks still come through even with no profile at all.
  expect(keys(r.visible)).toContain('clean_gutters');
});

test('systems gate still applies: no pool means no pool task', () => {
  const withPool = resolveMemberTasks({ catalog: CATALOG, systems: { pool: true }, stage: 'established', rows: [] });
  const without = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows: [] });
  expect(keys(withPool.visible)).toContain('pool_close');
  expect(keys(without.visible)).not.toContain('pool_close');
});

test('completed, booked, snoozed and dismissed tasks drop out of outstanding', () => {
  const now = new Date(Date.UTC(2026, 9, 15)); // mid-fall
  const rows: MaintenanceRow[] = [
    { task_key: 'clean_gutters', season: 'fall', status: 'done', completed_at: new Date(Date.UTC(2026, 9, 1)).toISOString() },
    { task_key: 'test_smoke_co', season: 'fall', status: 'booked', completed_at: null },
  ];
  const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows, now });
  expect(keys(r.visible)).toEqual(['clean_gutters', 'test_smoke_co']); // still "theirs"
  expect(keys(r.outstanding)).toEqual([]); // but nothing to nag about
  expect(r.doneKeys.has('clean_gutters')).toBe(true);
});

test('seasonal reset: last year\'s completion expires and the task returns', () => {
  const stale: MaintenanceRow = { task_key: 'clean_gutters', season: 'fall', status: 'done', completed_at: '2024-10-01T00:00:00.000Z' };
  const now = new Date(Date.UTC(2026, 9, 15));
  expect(isRowCurrent(stale, now)).toBe(false);
  const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows: [stale], now });
  expect(keys(r.outstanding)).toContain('clean_gutters');
});

test('a dismissal is a standing preference and does not expire with the season', () => {
  const old: MaintenanceRow = { task_key: 'clean_gutters', season: 'fall', status: 'dismissed', completed_at: '2023-01-01T00:00:00.000Z' };
  const now = new Date(Date.UTC(2026, 9, 15));
  expect(isRowCurrent(old, now)).toBe(true);
  const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows: [old], now });
  expect(keys(r.outstanding)).not.toContain('clean_gutters');
});

test('resolveMemberTasks agrees with filterTasksForProfile so page and cron cannot drift', () => {
  for (const stage of ['just_bought', 'established', 'new_construction', 'selling', null] as const) {
    const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: true }, stage, rows: [] });
    expect(keys(r.visible)).toEqual(keys(filterTasksForProfile(CATALOG, { pool: true }, stage)));
  }
});

test('the teaser count shrinks as the member checks things off across the season', () => {
  // 12 applicable fall jobs. Each month's send recomputes from what is still
  // outstanding, so the "+N more" hook tracks their real progress instead of
  // repeating a stale number all season.
  const fall = Array.from({ length: 12 }, (_, i) => ({
    key: `f${i}`, title: `Fall job ${i}`, blurb: 'Do it.', bookable: false,
    diy_or_pro: 'diy' as const, priority: 12 - i, applies_to: ['all'], stages: ['all'],
  }));
  const done = (n: number, at: string): MaintenanceRow[] =>
    fall.slice(0, n).map((t) => ({ task_key: t.key, season: 'fall', status: 'done', completed_at: at }));

  const teaserFor = (doneCount: number, now: Date) => {
    const { outstanding } = resolveMemberTasks({
      catalog: fall, systems: null, stage: 'established',
      rows: done(doneCount, new Date(now.getTime() - 86400000).toISOString()), now,
    });
    const n = buildNewsletter({
      firstName: 'Marcus', season: 'fall', tasks: outstanding, isSeasonal: false,
      monthLabel: 'October', year: 2026, baseUrl: 'https://x', unsubscribeUrl: 'https://x/u',
      caughtUp: outstanding.length === 0,
    });
    const m = n.html.match(/\+ (\d+) more jobs? on your fall list/);
    return { count: m ? Number(m[1]) : 0, outstanding: outstanding.length, subject: n.subject };
  };

  const sep = new Date(Date.UTC(2026, 8, 1));
  const oct = new Date(Date.UTC(2026, 9, 1));
  const nov = new Date(Date.UTC(2026, 10, 1));

  expect(teaserFor(0, sep).count).toBe(9); // 12 outstanding, 3 shown
  expect(teaserFor(4, oct).count).toBe(5); // 8 outstanding, 3 shown
  expect(teaserFor(9, nov).count).toBe(0); // 3 outstanding, all shown, teaser gone
  // Everything done -> no teaser at all, the caught-up note instead.
  const all = teaserFor(12, nov);
  expect(all.outstanding).toBe(0);
  expect(all.subject).toContain('all caught up');
});

test('caught-up email drops the task panel but keeps the CTA and unsubscribe', () => {
  const n = buildNewsletter({
    firstName: 'Alex', season: 'fall', tasks: [], isSeasonal: false, monthLabel: 'October', year: 2026,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u?token=abc',
    caughtUp: true,
  });
  expect(n.subject).toBe("You're all caught up, Alex");
  expect(n.html).toContain('all caught up.');
  expect(n.html).not.toContain('Add to plan'); // nothing to nag about
  expect(n.html).not.toMatch(/>01</); // no numbered rows
  expect(n.html).toContain('Review My Fall List'); // CTA survives
  expect(n.html).toContain('Rather we handled it?'); // booking path survives
  expect(n.html).toContain('u?token=abc'); // compliance survives
  expect(n.text).not.toContain('01.');
});
