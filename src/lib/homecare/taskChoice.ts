/**
 * Who may do a maintenance task, and when its gear shelf is allowed on screen.
 *
 * Pure and client-safe, extracted from the checklist component for the same
 * reason `shelfPosition` and `selection` were: the component is 900 lines with
 * a dozen pieces of state, and these two rules are the ones that decide what a
 * member is offered. They need to be assertable without standing up a page.
 *
 * WHAT THEY REPLACED. `diy_or_pro` describes the WORK. Nothing described the
 * homeowner's INTENT, and the checklist showed the consequences twice over: all
 * 18 tasks the catalog calls `diy` were `bookable = false`, so there was no way
 * at all to ask La Vaca to do one, and the 16 `either` tasks offered the gear
 * shelf and the add-to-request button simultaneously and committed to neither.
 */

/** The three shapes a task card can take. */
export type TaskChoice = 'choose' | 'diy_only' | 'pro_only';

export interface ChoosableTask {
  diy_or_pro: 'diy' | 'pro' | 'either';
  /**
   * A `diy` task La Vaca will also do on request (maintenance_catalog.
   * pro_optional). Optional because it only exists once 20260828000000 has been
   * hand-applied, and absent has to read as "no Pro option" rather than as one.
   */
  pro_optional?: boolean;
}

/**
 *  - `choose`   both ways are real, so the member picks. `either` tasks, plus
 *               the `diy` ones the owner marked pro_optional.
 *  - `diy_only` a DIY task nobody would dispatch a crew for - finding your own
 *               shut-off valve, watching for settling cracks. No control,
 *               because there is no choice, and the shelf simply shows as it
 *               always did.
 *  - `pro_only` roofs, gas, panels. Deliberately never offered as DIY: we
 *               should not hand someone a shopping list for a gas line, and
 *               keeping the control off these cards is what makes its presence
 *               elsewhere mean "there is a genuine choice here".
 *
 * The `pro` test comes FIRST so a stray `pro_optional` on a pro row cannot turn
 * a safety call into a choice.
 */
export function taskChoice(t: ChoosableTask): TaskChoice {
  if (t.diy_or_pro === 'pro') return 'pro_only';
  if (t.diy_or_pro === 'either' || t.pro_optional === true) return 'choose';
  return 'diy_only';
}

/**
 * Whether the DIY Kit shelf may render.
 *
 * On a `choose` task the shelf is the reward for saying you are doing the work
 * yourself: before that it is not on screen at all, which is both the biggest
 * height saving on the card and the honest thing to show someone who has just
 * asked us to do the job.
 *
 * `pro_only` returns false whatever the stored mode says. A mode row can outlive
 * a catalog edit, so a task the owner has since made pro-only loses its shelf on
 * the next render rather than keeping it because of what somebody picked last
 * season - the same "re-check the rule every render" instinct as readProductShelves.
 */
export function shelfVisible(choice: TaskChoice, mode: 'diy' | 'pro' | undefined): boolean {
  if (choice === 'pro_only') return false;
  if (choice === 'diy_only') return true;
  return mode === 'diy';
}
