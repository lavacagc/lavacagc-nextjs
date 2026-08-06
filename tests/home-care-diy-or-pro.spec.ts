import { test, expect } from '@playwright/test';
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
