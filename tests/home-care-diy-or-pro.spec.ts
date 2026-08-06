import { test, expect } from '@playwright/test';
import { taskChoice, shelfVisible } from '../src/lib/homecare/taskChoice';

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

  test('an undecided card is the quiet one', () => {
    // The whole height argument in one assertion: nothing extra is on screen
    // until the member has told us something.
    expect(shelfVisible('choose', undefined)).toBe(false);
  });
});
