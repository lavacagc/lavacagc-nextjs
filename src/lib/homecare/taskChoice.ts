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
 * A stored `pro` loses the shelf whatever shape the catalog now gives the task,
 * and `pro_only` loses it whatever the stored mode says. Those are one guard
 * from two ends, because a mode row can outlive a catalog edit in either
 * direction: a task the owner has since made pro-only drops its shelf on the
 * next render rather than keeping it because of what somebody picked last
 * season, and a member who asked us to do the job is not handed a shopping list
 * for it when the owner un-marks `pro_optional` - or when `fetchCatalog`'s
 * degrade path is defaulting every row to `pro_optional: false` because the
 * migration has not been applied yet. Same "re-check the rule every render"
 * instinct as readProductShelves.
 */
export function shelfVisible(choice: TaskChoice, mode: 'diy' | 'pro' | undefined): boolean {
  if (mode === 'pro') return false;
  if (choice === 'pro_only') return false;
  if (choice === 'diy_only') return true;
  return mode === 'diy';
}

/** A task as the request rule needs it: its shape, plus the key it goes on the request under. */
export interface RequestableTask extends ChoosableTask {
  key: string;
}

/**
 * Which tasks are on the consolidated request.
 *
 * DERIVED from what is stored, never accumulated alongside it. The checklist
 * used to keep a second Set of task keys next to `modes`, and holding the same
 * fact in two grains drifted three separate ways: the Set was seeded from the
 * `?add=` deep link alone, so after any reload a card read "On your request"
 * with nothing on the request and no pill to send it; `modes` is per (task,
 * season) while the request is per task, so picking "I'll do it" on the autumn
 * card of a four-season task silently cancelled the Pro request made on the
 * summer one; and the chip's reset dropped the local entry without touching
 * either the Set or the server. Deriving is what makes those unrepresentable.
 *
 * `picked` is the one thing that genuinely has no stored counterpart: the ＋
 * circle on a pro-only card, and the `?add=` deep link that pre-selects a task.
 * A pick WINS over a later `diy`, deliberately (owner, 6 Aug 2026): arriving
 * from "Add to plan" and then saying "I'll do it" is not a withdrawal of the
 * ask, so nothing here vetoes it. The card carries the matching obligation - it
 * must say the task is on the request and offer the way off, since the chip
 * alone reads as "you are handling this".
 *
 * Two exclusions, both about a card and the request never disagreeing:
 *  - a dismissed task is not on the page, so it is not on the request either;
 *  - a `pro` mode only counts while the task still renders the chip that says
 *    so. A mode row can outlive a catalog edit, and a task that has since
 *    become `diy_only` (or `pro_only`) must not keep a silent seat on the
 *    request that no card on screen can explain or take back.
 */
export function requestedTaskKeys({
  tasks,
  modes,
  picked,
  dismissed,
}: {
  tasks: readonly RequestableTask[];
  modes: Readonly<Record<string, 'diy' | 'pro'>>;
  picked: ReadonlySet<string>;
  dismissed: ReadonlySet<string>;
}): Set<string> {
  // `modes` is keyed `task_key|season`; the request is keyed by task alone, so
  // ANY season saying pro puts the task on it and clearing one season only
  // takes it off when no other season still does.
  const proKeys = new Set<string>();
  for (const [panelKey, mode] of Object.entries(modes)) {
    if (mode !== 'pro') continue;
    const cut = panelKey.lastIndexOf('|');
    if (cut > 0) proKeys.add(panelKey.slice(0, cut));
  }

  const out = new Set<string>();
  for (const t of tasks) {
    if (dismissed.has(t.key)) continue;
    if (picked.has(t.key) || (proKeys.has(t.key) && taskChoice(t) === 'choose')) out.add(t.key);
  }
  return out;
}
