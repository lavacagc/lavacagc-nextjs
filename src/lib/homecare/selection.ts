/**
 * La Vaca Home Care - "what should this member see this season?" (pure, testable).
 *
 * The checklist page and the monthly newsletter both have to answer this, and
 * they used to answer it separately. They drifted: the page gated on stage and
 * expired stale completions, the newsletter did neither, so members got
 * pre-listing tasks they'd never asked for and reminders for jobs they'd already
 * checked off. This module is the single answer both call.
 *
 * Two rules carry the subtlety:
 *
 *  - **Completion currency.** Seasonal work recurs, so "done" is not forever.
 *    A completion counts until `completionCutoff(season)` passes, then expires
 *    and the task comes back. One-time 'starter' work and rows with no
 *    timestamp are treated leniently (still done).
 *  - **Suppression vs. display.** `dismissed` ("not relevant to my home"),
 *    `booked` (we're doing it) and `snoozed` (not now) all mean "don't put this
 *    in an email", but the page still renders done items with a checkmark. So
 *    this returns the sets and lets each caller decide - it does not pre-filter
 *    for everyone.
 */
import { completionCutoff, SEASONS, type Season } from './season';
import { filterTasksForProfile, type HomeSystems, type Stage } from './profile';

/** A homeowner_maintenance row, as both callers select it. */
export interface MaintenanceRow {
  task_key: string;
  season: string;
  status: string;
  completed_at?: string | null;
}

/** Statuses that mean "do not put this in an outbound email". */
const SUPPRESSING = new Set(['done', 'booked', 'snoozed', 'dismissed']);

/**
 * Is this row's status still in force, or has the seasonal reset expired it?
 *
 * Only completions of a real season expire - a row with an unrecognized season
 * or no `completed_at` is counted leniently (still in force) rather than
 * silently resurfacing work the member believes they finished.
 */
export function isRowCurrent(row: MaintenanceRow, now: Date = new Date()): boolean {
  // Dismissals are a standing preference, not a seasonal completion: "not
  // relevant to my home" stays true next year too.
  if (row.status === 'dismissed') return true;
  if (!SEASONS.includes(row.season as Season) || !row.completed_at) return true;
  return new Date(row.completed_at).getTime() >= completionCutoff(row.season as Season, now).getTime();
}

export interface ResolveArgs<T> {
  catalog: T[];
  systems: HomeSystems | null | undefined;
  stage: Stage | null;
  rows: MaintenanceRow[];
  now?: Date;
}

export interface ResolvedTasks<T> {
  /** Catalog tasks this member's home + stage qualifies for. */
  visible: T[];
  /** Of those, the ones with nothing suppressing them - what an email should lead with. */
  outstanding: T[];
  /** task_keys currently counted as done (for rendering checkmarks). */
  doneKeys: Set<string>;
  /** task_keys the member hid as not relevant. */
  dismissedKeys: Set<string>;
}

export function resolveMemberTasks<T extends { key: string; applies_to: string[]; stages?: string[] }>(
  args: ResolveArgs<T>,
): ResolvedTasks<T> {
  const { catalog, systems, stage, rows, now = new Date() } = args;

  const current = rows.filter((r) => isRowCurrent(r, now));
  const doneKeys = new Set(current.filter((r) => r.status === 'done').map((r) => r.task_key));
  const dismissedKeys = new Set(current.filter((r) => r.status === 'dismissed').map((r) => r.task_key));
  const suppressed = new Set(current.filter((r) => SUPPRESSING.has(r.status)).map((r) => r.task_key));

  const visible = filterTasksForProfile(catalog, systems, stage);
  const outstanding = visible.filter((t) => !suppressed.has(t.key));

  return { visible, outstanding, doneKeys, dismissedKeys };
}
