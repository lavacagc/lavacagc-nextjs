import { test, expect } from '@playwright/test';
import { resolveMemberTasks, isCaughtUp, isRowCurrent, type MaintenanceRow } from '../src/lib/homecare/selection';
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
  const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows: [], season: 'fall' });
  expect(keys(r.visible)).not.toContain('sell_pre_inspection');
  expect(keys(r.visible)).not.toContain('nc_settling_cracks');
  expect(keys(r.visible)).toEqual(['clean_gutters', 'test_smoke_co']);
});

test('stage gate: a selling member sees pre-listing but not new-construction', () => {
  const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'selling', rows: [], season: 'fall' });
  expect(keys(r.visible)).toContain('sell_pre_inspection');
  expect(keys(r.visible)).not.toContain('nc_settling_cracks');
});

test('stage gate FAILS CLOSED: no stage set hides stage-specific tasks', () => {
  // Previously a null stage skipped the gate entirely, so anyone who had not
  // finished the questionnaire was told to prep their house for sale.
  const r = resolveMemberTasks({ catalog: CATALOG, systems: null, stage: null, rows: [], season: 'fall' });
  expect(keys(r.visible)).not.toContain('sell_pre_inspection');
  expect(keys(r.visible)).not.toContain('nc_settling_cracks');
  // Universal tasks still come through even with no profile at all.
  expect(keys(r.visible)).toContain('clean_gutters');
});

test('systems gate still applies: no pool means no pool task', () => {
  const withPool = resolveMemberTasks({ catalog: CATALOG, systems: { pool: true }, stage: 'established', rows: [], season: 'fall' });
  const without = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows: [], season: 'fall' });
  expect(keys(withPool.visible)).toContain('pool_close');
  expect(keys(without.visible)).not.toContain('pool_close');
});

test('completed, booked, snoozed and dismissed tasks drop out of outstanding', () => {
  const now = new Date(Date.UTC(2026, 9, 15)); // mid-fall
  const rows: MaintenanceRow[] = [
    { task_key: 'clean_gutters', season: 'fall', status: 'done', completed_at: new Date(Date.UTC(2026, 9, 1)).toISOString() },
    { task_key: 'test_smoke_co', season: 'fall', status: 'booked', completed_at: null, updated_at: new Date(Date.UTC(2026, 9, 2)).toISOString() },
  ];
  const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows, now, season: 'fall' });
  expect(keys(r.visible)).toEqual(['clean_gutters', 'test_smoke_co']); // still "theirs"
  expect(keys(r.outstanding)).toEqual([]); // but nothing to nag about
  expect(r.doneKeys.has('clean_gutters')).toBe(true);
});

test('seasonal reset: last year\'s completion expires and the task returns', () => {
  const stale: MaintenanceRow = { task_key: 'clean_gutters', season: 'fall', status: 'done', completed_at: '2024-10-01T00:00:00.000Z' };
  const now = new Date(Date.UTC(2026, 9, 15));
  expect(isRowCurrent(stale, now)).toBe(false);
  const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows: [stale], now, season: 'fall' });
  expect(keys(r.outstanding)).toContain('clean_gutters');
});

test('a dismissal is a standing preference and does not expire with the season', () => {
  const old: MaintenanceRow = { task_key: 'clean_gutters', season: 'all', status: 'dismissed', completed_at: null, updated_at: '2023-01-01T00:00:00.000Z' };
  const now = new Date(Date.UTC(2026, 9, 15));
  expect(isRowCurrent(old, now)).toBe(true);
  const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows: [old], now, season: 'fall' });
  expect(keys(r.outstanding)).not.toContain('clean_gutters');
});

test('booked and snoozed suppress for their season only, not forever', () => {
  // Neither status stamps completed_at, so keyed off that they suppressed the
  // task for good. They expire off updated_at like any other seasonal row.
  const now = new Date(Date.UTC(2026, 9, 15)); // mid-fall 2026
  const lastYear = (status: string): MaintenanceRow => ({
    task_key: 'clean_gutters', season: 'fall', status, completed_at: null, updated_at: '2024-10-01T00:00:00.000Z',
  });
  for (const status of ['booked', 'snoozed']) {
    expect(isRowCurrent(lastYear(status), now)).toBe(false);
    const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows: [lastYear(status)], now, season: 'fall' });
    expect(keys(r.outstanding)).toContain('clean_gutters');
  }
  // This season's booking still suppresses.
  const fresh: MaintenanceRow = { task_key: 'clean_gutters', season: 'fall', status: 'booked', completed_at: null, updated_at: '2026-10-01T00:00:00.000Z' };
  const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: false }, stage: 'established', rows: [fresh], now, season: 'fall' });
  expect(keys(r.outstanding)).not.toContain('clean_gutters');
});

test('MULTI-SEASON: a completion in one season does not suppress the task in another', () => {
  // replace_hvac_filter is quarterly - it appears in all four seasons. Keyed on
  // task_key alone, a winter check-off silently dropped it from the summer
  // send, and if it was the only visible task the member was wrongly told they
  // were all caught up.
  const multi = [
    { key: 'replace_hvac_filter', title: 'Replace the HVAC filter', blurb: 'Every few months.', bookable: false, diy_or_pro: 'diy' as const, priority: 6, applies_to: ['all'], stages: ['all'] },
  ];
  const now = new Date(Date.UTC(2026, 7, 1)); // Aug 1 send, summer
  const winterDone: MaintenanceRow = {
    task_key: 'replace_hvac_filter', season: 'winter', status: 'done', completed_at: '2026-01-15T00:00:00.000Z',
  };
  expect(isRowCurrent(winterDone, now)).toBe(true); // still current as a WINTER row

  const summer = resolveMemberTasks({ catalog: multi, systems: null, stage: 'established', rows: [winterDone], now, season: 'summer' });
  expect(keys(summer.outstanding)).toEqual(['replace_hvac_filter']); // summer's turn is still owed
  expect(summer.doneKeys.has('replace_hvac_filter')).toBe(false);

  // ...and the same row does still suppress the winter send.
  const winter = resolveMemberTasks({ catalog: multi, systems: null, stage: 'established', rows: [winterDone], now, season: 'winter' });
  expect(keys(winter.outstanding)).toEqual([]);
  expect(winter.doneKeys.has('replace_hvac_filter')).toBe(true);
});

test('resolveMemberTasks agrees with filterTasksForProfile so page and cron cannot drift', () => {
  for (const stage of ['just_bought', 'established', 'new_construction', 'selling', null] as const) {
    const r = resolveMemberTasks({ catalog: CATALOG, systems: { pool: true }, stage, rows: [], season: 'fall' });
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
    const resolved = resolveMemberTasks({
      catalog: fall, systems: null, stage: 'established', season: 'fall',
      rows: done(doneCount, new Date(now.getTime() - 86400000).toISOString()), now,
    });
    const { outstanding } = resolved;
    const n = buildNewsletter({
      firstName: 'Marcus', season: 'fall', tasks: outstanding, isSeasonal: false,
      monthLabel: 'October', year: 2026, baseUrl: 'https://x', unsubscribeUrl: 'https://x/u',
      caughtUp: isCaughtUp(resolved),
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

test('CAUGHT-UP GATE: only a member who actually did the work gets congratulated', () => {
  const now = new Date(Date.UTC(2026, 9, 15)); // mid-fall
  const visibleToAll = { catalog: CATALOG, systems: { pool: false }, stage: 'established' as const, season: 'fall' as const, now };
  const at = '2026-10-01T00:00:00.000Z';

  // Hid both applicable tasks as "not relevant to my home". Their list is empty,
  // but telling them they "cleared everything - nice work" is false, and it
  // restarts monthly mail to someone who signalled they don't want it.
  const dismissedAll = resolveMemberTasks({
    ...visibleToAll,
    rows: [
      { task_key: 'clean_gutters', season: 'all', status: 'dismissed', completed_at: null, updated_at: at },
      { task_key: 'test_smoke_co', season: 'all', status: 'dismissed', completed_at: null, updated_at: at },
    ],
  });
  expect(dismissedAll.outstanding).toEqual([]);
  expect(isCaughtUp(dismissedAll)).toBe(false);

  // Same for a list emptied by "not now" - booked and snoozed are not wins.
  const notNow = resolveMemberTasks({
    ...visibleToAll,
    rows: [
      { task_key: 'clean_gutters', season: 'fall', status: 'booked', completed_at: null, updated_at: at },
      { task_key: 'test_smoke_co', season: 'fall', status: 'snoozed', completed_at: null, updated_at: at },
    ],
  });
  expect(notNow.outstanding).toEqual([]);
  expect(isCaughtUp(notNow)).toBe(false);

  // Checked one off and hid the other: they did do some of the work, so the
  // congratulations are earned.
  const mixed = resolveMemberTasks({
    ...visibleToAll,
    rows: [
      { task_key: 'clean_gutters', season: 'fall', status: 'done', completed_at: at },
      { task_key: 'test_smoke_co', season: 'all', status: 'dismissed', completed_at: null, updated_at: at },
    ],
  });
  expect(mixed.outstanding).toEqual([]);
  expect(isCaughtUp(mixed)).toBe(true);

  // Nothing in the catalog applies at all — no email either way.
  const nothingApplies = resolveMemberTasks({ catalog: [], systems: null, stage: 'established', season: 'fall', rows: [], now });
  expect(isCaughtUp(nothingApplies)).toBe(false);

  // And a completion from a DIFFERENT season doesn't earn it: the fall list is
  // untouched, so there is still real work to send.
  const winterOnly = resolveMemberTasks({
    ...visibleToAll,
    rows: [{ task_key: 'clean_gutters', season: 'winter', status: 'done', completed_at: at }],
  });
  expect(keys(winterOnly.outstanding)).toEqual(['clean_gutters', 'test_smoke_co']);
  expect(isCaughtUp(winterOnly)).toBe(false);
});

test('CAUGHT-UP GATE: the completion has to be of a task they can still see', () => {
  // A done row outlives the profile edit that drops its task off the list. Here
  // the member checked off the pool close, then told us they have no pool, then
  // hid the two tasks that were left. Nothing outstanding and one done row - but
  // the only thing they finished is no longer on their list, so "you've cleared
  // everything" is the same false congratulation the gate exists to prevent.
  const now = new Date(Date.UTC(2026, 9, 15));
  const at = '2026-10-01T00:00:00.000Z';
  const rows: MaintenanceRow[] = [
    { task_key: 'pool_close', season: 'fall', status: 'done', completed_at: at },
    { task_key: 'clean_gutters', season: 'all', status: 'dismissed', completed_at: null, updated_at: at },
    { task_key: 'test_smoke_co', season: 'all', status: 'dismissed', completed_at: null, updated_at: at },
  ];
  const soldThePool = resolveMemberTasks({
    catalog: CATALOG, systems: { pool: false }, stage: 'established', season: 'fall', rows, now,
  });
  expect(keys(soldThePool.visible)).not.toContain('pool_close');
  expect(soldThePool.outstanding).toEqual([]);
  expect(soldThePool.doneKeys.has('pool_close')).toBe(true);
  expect(isCaughtUp(soldThePool)).toBe(false);

  // Still has the pool, so the same completion does earn it.
  const stillHasIt = resolveMemberTasks({
    catalog: CATALOG, systems: { pool: true }, stage: 'established', season: 'fall', rows, now,
  });
  expect(keys(stillHasIt.visible)).toContain('pool_close');
  expect(isCaughtUp(stillHasIt)).toBe(true);
});

test('caught-up email drops the task panel but keeps the CTA and unsubscribe', () => {
  const n = buildNewsletter({
    firstName: 'Alex', season: 'fall', tasks: [], isSeasonal: false, monthLabel: 'October', year: 2026,
    baseUrl: 'https://www.lavacagc.com', unsubscribeUrl: 'https://www.lavacagc.com/u?token=abc',
    caughtUp: true,
  });
  expect(n.subject).toBe("October: you're all caught up, Alex");
  expect(n.html).toContain('all caught up.');
  expect(n.html).not.toContain('Add to plan'); // nothing to nag about
  expect(n.html).not.toMatch(/>01</); // no numbered rows
  expect(n.html).toContain('Review My Fall List'); // CTA survives
  expect(n.html).toContain('Rather we handled it?'); // booking path survives
  expect(n.html).toContain('u?token=abc'); // compliance survives
  expect(n.text).not.toContain('01.');
});
