import { test, expect } from '@playwright/test';
import { readdirSync } from 'fs';
import { join } from 'path';
import { taskChoice, shelfVisible, requestedTaskKeys } from '../src/lib/homecare/taskChoice';

/**
 * Who may do a task, and when the gear shelf is allowed on screen.
 *
 * These two functions carry the whole slice. Before them the checklist had no
 * idea what a member INTENDED: `diy_or_pro` described the work, all 18 `diy`
 * tasks were `bookable = false` so there was no way to ask La Vaca to do one,
 * and the 16 `either` tasks showed the shelf and the add-to-request button at
 * the same time and committed to neither.
 *
 * The rendering that hangs off them is exercised in
 * home-care-diy-kit-shelf.spec.ts, which drives the real page. This file is the
 * part that must be true on every run, including CI, where that page cannot be
 * stood up.
 */

test.describe('which shape a task card takes', () => {
  test('a pro task never offers a DIY choice', () => {
    // Roofs, gas, panels. Not offering DIY is what makes the control's presence
    // on other cards mean "there is a genuine choice here".
    expect(taskChoice({ diy_or_pro: 'pro' })).toBe('pro_only');
    // Even if somebody sets the flag on a pro row by mistake, the safety call
    // wins - this is the ordering that keeps a gas line off a shopping list.
    expect(taskChoice({ diy_or_pro: 'pro', pro_optional: true })).toBe('pro_only');
  });

  test('an either task is always a choice', () => {
    expect(taskChoice({ diy_or_pro: 'either' })).toBe('choose');
  });

  test('a diy task becomes a choice only once it is marked pro_optional', () => {
    // The 13 the owner picked.
    expect(taskChoice({ diy_or_pro: 'diy', pro_optional: true })).toBe('choose');
    // The 5 left out: shut-off locators, the filter-size note, settling cracks.
    expect(taskChoice({ diy_or_pro: 'diy', pro_optional: false })).toBe('diy_only');
    // Absent, not false - the state every row is in before the migration runs.
    // It must read as "no Pro option", never as one.
    expect(taskChoice({ diy_or_pro: 'diy' })).toBe('diy_only');
  });
});

test.describe('when the DIY Kit shelf may render', () => {
  test('a choose task hides it until the member says they are doing it', () => {
    expect(shelfVisible('choose', undefined)).toBe(false);
    expect(shelfVisible('choose', 'pro')).toBe(false);
    expect(shelfVisible('choose', 'diy')).toBe(true);
  });

  test('a diy-only task shows it, because there is nothing to decide', () => {
    expect(shelfVisible('diy_only', undefined)).toBe(true);
    expect(shelfVisible('diy_only', 'diy')).toBe(true);
  });

  test('a pro task never shows it, whatever the stored mode says', () => {
    // Belt and braces: a mode row can outlive a catalog edit, and a task the
    // owner has since made pro-only must lose its shelf on the next render
    // rather than keep it because of what somebody picked last season.
    expect(shelfVisible('pro_only', undefined)).toBe(false);
    expect(shelfVisible('pro_only', 'diy')).toBe(false);
  });

  test('a member who asked us to do it is never handed the shopping list', () => {
    // The same staleness from the other end, and the reachable one. A member
    // picks Pro on a pro_optional task; the owner later un-marks the flag, or
    // fetchCatalog's degrade path defaults every row to pro_optional: false
    // because the migration has not been applied on this deploy yet. The task
    // re-resolves to diy_only, and a shopping list for a job we were asked to
    // do is the precise dishonesty this gating exists to prevent - so the
    // stored intent wins over whatever shape the catalog now gives the task.
    expect(shelfVisible('diy_only', 'pro')).toBe(false);
    expect(shelfVisible('choose', 'pro')).toBe(false);
    expect(shelfVisible('pro_only', 'pro')).toBe(false);
  });

  test('an undecided card is the quiet one', () => {
    // The whole height argument in one assertion: nothing extra is on screen
    // until the member has told us something.
    expect(shelfVisible('choose', undefined)).toBe(false);
  });
});

/**
 * What is on the consolidated request.
 *
 * This is the feature's central promise - picking "La Vaca does it" IS adding
 * the task, one tap and not two - and it is a promise about two things
 * agreeing: the chip on the card, and the sticky pill that sends the request.
 * They agree because both read this, so the cases below are the ways they used
 * to be able to drift while the member was told otherwise.
 */
test.describe('what the member has asked us to do', () => {
  const HVAC = { key: 'replace_hvac_filter', diy_or_pro: 'diy' as const, pro_optional: true };
  const DECK = { key: 'seal_deck', diy_or_pro: 'either' as const };
  const CHIMNEY = { key: 'chimney_inspect', diy_or_pro: 'pro' as const };
  const CRACKS = { key: 'nc_settling_cracks', diy_or_pro: 'diy' as const, pro_optional: false };
  const TASKS = [HVAC, DECK, CHIMNEY, CRACKS];

  const request = (modes: Record<string, 'diy' | 'pro'>, picked: string[] = [], dismissed: string[] = []) =>
    [...requestedTaskKeys({ tasks: TASKS, modes, picked: new Set(picked), dismissed: new Set(dismissed) })];

  test('a Pro choice from a previous visit is still on the request', () => {
    // The bug this replaced: the request was seeded from the ?add= deep link
    // alone while the mode was rehydrated from the server, so after ANY reload
    // the card read "On your request" and the request held nothing - and with
    // no pill on screen the member had no way to send the job they had just
    // been told we were coming for.
    expect(request({ 'replace_hvac_filter|summer': 'pro' })).toEqual(['replace_hvac_filter']);
  });

  test('a choice in one season does not cancel one made in another', () => {
    // replace_hvac_filter runs all four seasons, so it is four cards writing to
    // one request entry. Saying "I'll do it" on the autumn card used to delete
    // that entry outright, silently dropping the summer Pro request while the
    // summer card still read "On your request".
    expect(request({ 'replace_hvac_filter|summer': 'pro', 'replace_hvac_filter|fall': 'diy' }))
      .toEqual(['replace_hvac_filter']);
    // And it comes off once no season still asks for us.
    expect(request({ 'replace_hvac_filter|fall': 'diy' })).toEqual([]);
    expect(request({})).toEqual([]);
  });

  test('the hand-made picks stand on their own', () => {
    // The ＋ circle on a pro-only card, and the ?add= deep link. Neither has a
    // stored counterpart, so they are the one thing not derived from modes.
    expect(request({}, ['chimney_inspect'])).toEqual(['chimney_inspect']);
    expect(request({ 'seal_deck|spring': 'pro' }, ['chimney_inspect']))
      .toEqual(['seal_deck', 'chimney_inspect']);
  });

  test('a deep-linked task stays on the request after the member picks DIY', () => {
    // Owner decision, 6 Aug 2026: the deep link wins until it is explicitly
    // taken off. Landing from the newsletter's "Add to plan" and then saying
    // "I'll do it" is not a withdrawal of the ask - plenty of members want a
    // quote for the job they are about to attempt.
    //
    // What this REQUIRES of the card is the other half, guarded in
    // home-care-consolidated-requests.spec.ts: a card in this state has to say
    // it is on the request, because "You've got this" alone does not, and it
    // has to offer the way off.
    expect(request({ 'seal_deck|spring': 'diy' }, ['seal_deck'])).toEqual(['seal_deck']);
  });

  test('removing a deep-linked task holds against the recompute', () => {
    // The removal control clears both inputs, so this is what it leaves behind.
    // Dropping the pick alone is not enough while a season still says pro: the
    // union would put the task straight back on the next render, which is the
    // whole reason removal clears the modes too.
    expect(request({ 'seal_deck|spring': 'diy' }, [])).toEqual([]);
    expect(request({ 'seal_deck|spring': 'pro' }, [])).toEqual(['seal_deck']);
    expect(request({}, [])).toEqual([]);
  });

  test('a task no card can explain is not silently on the request', () => {
    // A mode row outliving a catalog edit, both directions. Neither of these
    // tasks renders the chip that would say "On your request" or the toggle
    // that would take it back, so counting them would put a job on the request
    // that the member can neither see nor cancel.
    expect(request({ 'nc_settling_cracks|spring': 'pro' })).toEqual([]);
    expect(request({ 'chimney_inspect|winter': 'pro' })).toEqual([]);
    // A task the catalog no longer serves at all cannot hold a seat either.
    expect(request({ 'retired_task|summer': 'pro' })).toEqual([]);
  });

  test('hiding a task takes it off the request', () => {
    // "Not relevant to my home" removes the card, so it has to remove the ask.
    expect(request({ 'replace_hvac_filter|summer': 'pro' }, [], ['replace_hvac_filter'])).toEqual([]);
    expect(request({}, ['chimney_inspect'], ['chimney_inspect'])).toEqual([]);
  });
});

test('no two migrations claim the same version', () => {
  // This slice's migration was written as 20260828000000, which a sibling
  // branch had already spent on home_care_products. Supabase keys
  // supabase_migrations.schema_migrations on the leading timestamp ALONE and
  // never on the rest of the filename, so the Preview branch tried to insert
  // the second file onto the first one's primary key and failed the whole PR
  // with `duplicate key value violates unique constraint
  // "schema_migrations_pkey"`. Nothing in the repo caught it: both files are
  // valid SQL, both apply cleanly on their own, and lint, typecheck and build
  // never read this directory.
  //
  // Repo-wide on purpose, unlike the scoped check in proposal-pod-slice3.spec
  // that this file otherwise resembles. That one had to be narrowed because
  // "the newest migration is X" goes stale the moment any feature adds one.
  // This claim does not: two files may never share a version, today or after
  // any number of new ones, so a passing run stays passing without edits.
  const files = readdirSync(join(__dirname, '..', 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql'));
  const byVersion = new Map<string, string[]>();
  for (const f of files) {
    const version = f.slice(0, 14);
    byVersion.set(version, [...(byVersion.get(version) ?? []), f]);
  }
  const collisions = [...byVersion.entries()].filter(([, names]) => names.length > 1);
  expect(
    collisions.map(([version, names]) => `${version}: ${names.join(', ')}`),
    'rename the newer file to an unused version - Supabase rejects the push otherwise',
  ).toEqual([]);
});

test('the DIY Kit replay still sorts before the migration that needs it', () => {
  // The collision above did lasting damage before it was renamed away. The
  // Preview branch recorded version 20260828000000 for the diy_or_pro file,
  // which sorts first, and then rolled back the whole of home_care_products
  // when that file reached the same primary key. Preview branches are
  // PERSISTENT and run each version exactly once, so the products migration is
  // now unreachable there and the next one in line answered
  // `relation "public.home_care_products" does not exist`.
  //
  // 20260828120000 replays those objects under a version the branch has not
  // seen. What makes it work is only its POSITION: after the last version the
  // branch recorded, and before the first migration that reads the table.
  // Renumbering it outside that window puts the branch straight back where it
  // was, and no other check in this repo would notice.
  const files = readdirSync(join(__dirname, '..', 'supabase/migrations'));
  // Every version is 14 digits, so a string compare IS the chronological one.
  const versionOf = (name: string) => {
    const file = files.find((f) => f === `${name}.sql`);
    expect(file, `${name}.sql is gone - the Preview branch depends on it`).toBeTruthy();
    return file!.slice(0, 14);
  };
  const replay = versionOf('20260828120000_home_care_products_preview_fixup');
  expect(replay > versionOf('20260828000000_home_care_products')).toBe(true);
  expect(replay < versionOf('20260829000000_home_care_price_band_optional')).toBe(true);
});
