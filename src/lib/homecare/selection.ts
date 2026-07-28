/**
 * La Vaca Home Care - "what should this member see this season?" (pure, testable).
 *
 * The checklist page and the monthly newsletter both have to answer this, and
 * they used to answer it separately. They drifted: the page gated on stage and
 * expired stale completions, the newsletter did neither, so members got
 * pre-listing tasks they'd never asked for and reminders for jobs they'd already
 * checked off. This module is the single answer both call.
 *
 * Three rules carry the subtlety:
 *
 *  - **Completion currency.** Seasonal work recurs, so "done" is not forever.
 *    A row counts until `completionCutoff(season)` passes, then expires and the
 *    task comes back. It expires off the row's own timestamp - `completed_at`
 *    when the status stamps one, otherwise `updated_at`, which is always
 *    written. One-time 'starter' work and rows with no timestamp at all are
 *    treated leniently (still in force).
 *  - **Suppression is per (task, season).** A row only speaks for the season it
 *    was recorded in. Nine catalog tasks are multi-season (`replace_hvac_filter`
 *    spans all four), so keying suppression on `task_key` alone would let a
 *    winter check-off silently drop the task from the summer send.
 *    `dismissed` is the exception: it is stored once with season 'all' and
 *    means "not relevant to my home" in every season.
 *  - **Suppression vs. display.** `dismissed`, `booked` (we're doing it) and
 *    `snoozed` (not now) all mean "don't put this in an email", but the page
 *    still renders done items with a checkmark. So this returns the sets and
 *    lets each caller decide - it does not pre-filter for everyone.
 */
import { completionCutoff, SEASONS, type Season } from './season';
import { filterTasksForProfile, type HomeSystems, type Stage } from './profile';

/** A homeowner_maintenance row, as both callers select it. */
export interface MaintenanceRow {
  task_key: string;
  season: string;
  status: string;
  completed_at?: string | null;
  /** Always populated by the writer; the expiry clock for statuses that stamp no `completed_at`. */
  updated_at?: string | null;
}

/** Statuses that mean "do not put this in an outbound email". */
const SUPPRESSING = new Set(['done', 'booked', 'snoozed', 'dismissed']);

/**
 * Is this row's status still in force, or has the seasonal reset expired it?
 *
 * Only rows of a real season expire - a row with an unrecognized season
 * ('starter', 'all') or no timestamp at all is counted leniently (still in
 * force) rather than silently resurfacing work the member believes they
 * handled. `booked` and `snoozed` stamp no `completed_at`, so they expire off
 * `updated_at`: both mean "not now", which is a statement about this season,
 * not a standing one.
 */
export function isRowCurrent(row: MaintenanceRow, now: Date = new Date()): boolean {
  // Dismissals are a standing preference, not a seasonal completion: "not
  // relevant to my home" stays true next year too.
  if (row.status === 'dismissed') return true;
  const stamp = row.completed_at ?? row.updated_at;
  if (!SEASONS.includes(row.season as Season) || !stamp) return true;
  return new Date(stamp).getTime() >= completionCutoff(row.season as Season, now).getTime();
}

/**
 * Does this row speak for the season being built? Dismissals are task-level
 * (one season='all' row) and apply everywhere; everything else is scoped to
 * the season it was recorded in, because multi-season tasks recur.
 */
function rowAppliesToSeason(row: MaintenanceRow, season: Season): boolean {
  return row.status === 'dismissed' || row.season === season;
}

export interface ResolveArgs<T> {
  catalog: T[];
  systems: HomeSystems | null | undefined;
  stage: Stage | null;
  rows: MaintenanceRow[];
  /** The season being built. Rows from other seasons do not suppress. */
  season: Season;
  now?: Date;
}

export interface ResolvedTasks<T> {
  /** Catalog tasks this member's home + stage qualifies for. */
  visible: T[];
  /** Of those, the ones with nothing suppressing them - what an email should lead with. */
  outstanding: T[];
  /** task_keys this member actually checked off this season (for checkmarks, and for telling "cleared it" from "hid it"). */
  doneKeys: Set<string>;
  /** task_keys the member hid as not relevant. */
  dismissedKeys: Set<string>;
}

export function resolveMemberTasks<T extends { key: string; applies_to: string[]; stages?: string[] }>(
  args: ResolveArgs<T>,
): ResolvedTasks<T> {
  const { catalog, systems, stage, rows, season, now = new Date() } = args;

  const current = rows.filter((r) => isRowCurrent(r, now) && rowAppliesToSeason(r, season));
  const doneKeys = new Set(current.filter((r) => r.status === 'done').map((r) => r.task_key));
  const dismissedKeys = new Set(current.filter((r) => r.status === 'dismissed').map((r) => r.task_key));
  const suppressed = new Set(current.filter((r) => SUPPRESSING.has(r.status)).map((r) => r.task_key));

  const visible = filterTasksForProfile(catalog, systems, stage);
  const outstanding = visible.filter((t) => !suppressed.has(t.key));

  return { visible, outstanding, doneKeys, dismissedKeys };
}

/**
 * Has this member earned the congratulatory "you're all caught up" email?
 *
 * Only if they emptied the list by DOING the work. A list emptied purely by
 * dismissals ("not relevant to my home"), bookings or snoozes means the
 * opposite - they told us not to nag them about it - so "you've cleared
 * everything, nice work" would be both untrue and unwelcome. Those members go
 * back to the silent skip.
 */
export function isCaughtUp<T>(resolved: ResolvedTasks<T>): boolean {
  return resolved.visible.length > 0 && resolved.outstanding.length === 0 && resolved.doneKeys.size > 0;
}
