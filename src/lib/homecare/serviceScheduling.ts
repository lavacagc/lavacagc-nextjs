/**
 * La Vaca Home Care - server-side scheduling for service visits.
 *
 * Scheduling creates a lightweight `homeowners` record for anyone who does not
 * already have one, so the visit, the address and the service history all live
 * in one table and every service customer becomes a Home Care member you can
 * invite later.
 *
 * THE GUARD THAT MATTERS: that record is created `status='pending'` with
 * `source='service_quote'`, and no verification email is sent. A customer who
 * booked a gutter clean did NOT opt in to a monthly marketing newsletter, and
 * Home Care is double opt-in. The newsletter cron selects `status=eq.active`,
 * so a pending row is structurally excluded from every send - the exclusion is
 * a property of the query, not a rule someone has to remember.
 *
 * Becoming a real member stays an explicit opt-in, via the post-job review
 * drip. If they take it, the normal double opt-in flips this same row.
 */
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { newToken, normalizeEmail } from '@/lib/homecare/homeowners';
import { isRowCurrent } from '@/lib/homecare/selection';
import { escapeLikePattern } from '@/lib/notify/cancelFollowUps';
import { VISIT_REMINDER_TYPE, reminderSendAt, visitKey, reminderIsStillUseful } from './visitSchedule';

export interface HomeownerLite {
  id: string;
  email: string;
  first_name: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  /**
   * Every Home Care email footer is built from this. It is NOT NULL on the
   * table, so it is always there to be read - but only if the select asks for
   * it, and a missing one renders an unsubscribe link that the unsubscribe
   * route rejects. Required here so no caller can forget.
   */
  unsubscribe_token: string;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
}

/**
 * Find or create the homeowner record for a scheduled service customer.
 *
 * `homeowners.email` is UNIQUE, so an existing member is always reused and
 * never duplicated - and an existing ACTIVE member is never downgraded to
 * pending by being scheduled.
 */
export async function ensureServiceHomeowner(args: {
  email: string;
  firstName?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
}): Promise<HomeownerLite | null> {
  const email = normalizeEmail(args.email);
  const existing = await supabaseRest<HomeownerLite[]>(
    'GET',
    `homeowners?select=id,email,first_name,phone,status,source,address,city,zip,unsubscribe_token&email=eq.${encodeURIComponent(email)}&limit=1`,
  );

  if (existing && existing.length > 0) {
    const row = existing[0];
    // Only fill blanks. Never overwrite what a real member told us themselves,
    // and never touch `status` - scheduling must not flip an active member.
    const patch: Record<string, string> = {};
    if (args.address && !row.address) patch.address = args.address;
    if (args.city && !row.city) patch.city = args.city;
    if (args.zip && !row.zip) patch.zip = args.zip;
    if (args.phone && !row.phone) patch.phone = args.phone;
    if (args.firstName && !row.first_name) patch.first_name = args.firstName;
    if (Object.keys(patch).length > 0) {
      await supabaseRest('PATCH', `homeowners?id=eq.${row.id}`, patch).catch(() => {});
      return { ...row, ...patch } as HomeownerLite;
    }
    return row;
  }

  const created = await supabaseRest<HomeownerLite[]>('POST', 'homeowners', [{
    email,
    first_name: args.firstName ?? null,
    phone: args.phone ?? null,
    address: args.address ?? null,
    city: args.city ?? null,
    zip: args.zip ?? null,
    // pending + service_quote = a business record, not a mailing-list entry.
    status: 'pending',
    source: 'service_quote',
    unsubscribe_token: newToken(),
  }]);
  return created?.[0] ?? null;
}

/**
 * One service on a visit, with the season its row is filed under.
 *
 * The season is per TASK, not per visit: it is reconciled against the task's own
 * catalog seasons (see `seasonForTaskVisit`), so one July window can legitimately
 * file a gutter clean under 'fall' and a deck seal under 'summer'.
 */
export interface VisitTask {
  taskKey: string;
  season: string;
}

export interface ScheduleArgs {
  homeownerId: string;
  tasks: VisitTask[];
  start: Date;
  end: Date;
  address: string;
}

/** A row's completion state, as the pre-booking read selects it. */
interface CompletionState {
  task_key: string;
  season: string;
  status: string;
  completed_by: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

/**
 * The (task, season) rows already carrying a completion the MEMBER recorded and
 * that is still in force.
 *
 * These are the rows a booking must not write its STATUS over. A member who
 * sees the visit card and ticks "Clean gutters" owns that row's `status`,
 * `completed_at` and `completed_by` - `/api/home-care/task` deliberately writes
 * nothing else so the booking survives their tick, and this is the same rule
 * from the other side.
 *
 * Only the status is at stake here. A booking never writes either completion
 * column on any row, so nothing this misses can cost a member their record -
 * see `scheduleVisit`.
 *
 * A status LA VACA set is retaken: booking the same service into the same season
 * is a new job, and a row left reading 'done' by us would label whoever ticks it
 * next as our work and make "mark completed" treat the new visit as already
 * handled, leaving its window on the books forever.
 *
 * An EXPIRED completion is retaken too. `isRowCurrent` is the seasonal reset the
 * portal and the newsletter share: past it the task has already come back on
 * both, so the row is showing as outstanding anyway and 'booked' is the truer
 * label.
 *
 * Read, never swallowed: if this fails we do not know what the row holds, and
 * guessing "nothing" is what destroys the tick.
 */
async function memberCompletionsInForce(homeownerId: string, tasks: VisitTask[]): Promise<Set<string>> {
  const keys = [...new Set(tasks.map((t) => t.taskKey))].map((k) => `"${k}"`).join(',');
  const seasons = [...new Set(tasks.map((t) => t.season))].map((s) => `"${s}"`).join(',');
  const rows = (await supabaseRest<CompletionState[]>(
    'GET',
    `homeowner_maintenance?select=task_key,season,status,completed_by,completed_at,updated_at` +
      `&homeowner_id=eq.${homeownerId}&task_key=in.(${keys})&season=in.(${seasons})&status=eq.done`,
  )) ?? [];
  return new Set(
    rows.filter((r) => r.completed_by !== 'lavaca' && isRowCurrent(r))
      .map((r) => `${r.task_key}|${r.season}`),
  );
}

/**
 * Write the schedule onto each task, marking them `booked`.
 *
 * Upsert on the table's natural key (homeowner, task, season) so rescheduling
 * updates in place rather than accumulating rows.
 *
 * `status` is only the label the portal shows: it is shared with the member's
 * own checkbox, so it can legitimately read 'done' or 'todo' on a row that
 * still has a visit coming. The WINDOW is what says a visit is on the books -
 * see `bookedVisitRows`.
 *
 * Which is why a booking writes the window onto every row and the status onto
 * only some. Stamping 'booked' over a member's own completion erased their tick
 * with no notice - a reschedule two days after they ticked the task, and it was
 * gone - the same narrowing the DELETE handler makes with `status=eq.booked`
 * when it unbooks a cancelled visit. Whoever did the work keeps the credit; the
 * booking is separate state on the same row.
 *
 * And it writes NEITHER completion column, on any row. A booking is a statement
 * about the future; `completed_at` and `completed_by` are the record of a job
 * that already happened, which is the service history this whole feature exists
 * to accumulate and what the next quote reads to say "last done Oct 2026 by La
 * Vaca" (IN4). Clearing them here retired an invoiced visit the moment a return
 * one was booked - and worse on the path CP10 opened: a member who unticks our
 * work leaves the row 'todo' with our completion standing, which no
 * `status=eq.done` read can see, so the redo they asked for was exactly what
 * erased the job. Cancel that redo and the DELETE handler restores no
 * timestamp, so it was gone for good. `/complete` writes the record for the new
 * visit when the new visit happens; until then the old one stands.
 */
export async function scheduleVisit(args: ScheduleArgs): Promise<void> {
  const { homeownerId, tasks, start, end, address } = args;
  if (tasks.length === 0) return;

  const booking = {
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    service_address: address,
    updated_at: new Date().toISOString(),
  };
  const identity = ({ taskKey, season }: VisitTask) => ({
    homeowner_id: homeownerId,
    task_key: taskKey,
    season,
  });

  const theirs = await memberCompletionsInForce(homeownerId, tasks);
  const held = tasks.filter((t) => theirs.has(`${t.taskKey}|${t.season}`));
  const open = tasks.filter((t) => !theirs.has(`${t.taskKey}|${t.season}`));

  const upsert = (rows: Record<string, unknown>[]) =>
    supabaseRest('POST', 'homeowner_maintenance', rows, { onConflict: 'homeowner_id,task_key,season' });

  // Two writes, not one: PostgREST rejects a bulk insert whose objects carry
  // different keys, and the whole point is that these two carry different keys.
  // Neither carries a completion column, so the merge-duplicates upsert leaves
  // whatever record the row already held exactly as it was.
  if (open.length > 0) {
    await upsert(open.map((t) => ({ ...identity(t), status: 'booked', ...booking })));
  }
  if (held.length > 0) {
    await upsert(held.map((t) => ({ ...identity(t), ...booking })));
  }
}

export interface BookedVisitRow {
  task_key: string;
  season: string;
  scheduled_start: string | null;
}

/**
 * Every visit currently on the books for this customer, in any season.
 *
 * Read BEFORE the upsert overwrites anything: these are the visits a new
 * booking may supersede, and the only way to pull exactly their reminders.
 *
 * A visit is a row carrying a `scheduled_start`, NOT a row whose status happens
 * to read 'booked'. `status` is shared with the member's own checkbox, which
 * writes 'done'/'todo' onto the same (homeowner, task, season) row - so a
 * status-scoped read goes blind the moment a member ticks a task La Vaca has
 * booked, and the visit would neither move with a reschedule nor lose its
 * reminder.
 *
 * Every task, not just the ones being booked: a window one task gives up may
 * still be held by another, and that window's reminder has to survive.
 *
 * THROWS rather than degrading to `[]`. Everything the supersede path decides is
 * computed from this list, and an empty one does not mean "no read" - it means
 * "this customer holds no bookings", which is the one answer that makes the
 * caller cancel nothing. A failed read would then move the visit and leave the
 * window it vacated still holding a pending reminder, and answer 200: "we're
 * coming tomorrow" for a slot nobody attends, with no log line to find it by.
 * Refusing the booking is the only honest answer when the truth is unknown, and
 * it costs nothing pre-migration - `scheduleVisit` writes the same column two
 * statements later and would fail the request anyway.
 */
export async function bookedVisitRows(homeownerId: string): Promise<BookedVisitRow[]> {
  return (await supabaseRest<BookedVisitRow[]>(
    'GET',
    `homeowner_maintenance?select=task_key,season,scheduled_start&homeowner_id=eq.${homeownerId}` +
      '&scheduled_start=not.is.null',
  )) ?? [];
}

/**
 * The windows this booking moves off: the ones these exact (task, season) rows
 * are already holding, other than the window being booked.
 *
 * ONE active booking per (homeowner, task, SEASON) is the model, which is
 * precisely what the table's unique key already guarantees - so a reschedule is
 * a plain upsert in place and the only thing left to work out is which window it
 * vacated, so that window's reminder can be pulled.
 *
 * Matched on (task, SEASON), never on the task alone. `clean_gutters` is a fall
 * AND a spring task, and a customer holding both halves of the year is normal
 * rather than a conflict to resolve; keyed on the task alone, booking the spring
 * clean silently unbooked the October one and cancelled its reminder while the
 * toast still read "Visit scheduled".
 *
 * Which makes a visit that moves far enough to change its reconciled season a
 * NEW booking rather than an inferred move - deliberately. Guessing at that
 * intent is unrepresentable here, and both bookings are visible on "On the
 * books", so retiring the one left behind is the explicit Cancel visit action.
 *
 * Compared as INSTANTS, never as strings. PostgREST renders `timestamptz` the
 * way Postgres does - "2026-09-05T12:00:00+00:00" - and `Date#toISOString()`
 * gives "2026-09-05T12:00:00.000Z"; the same moment, spelled two ways, so a
 * string compare silently matches nothing in production.
 */
export function supersededBookings(args: {
  previous: BookedVisitRow[];
  tasks: VisitTask[];
  start: Date;
}): BookedVisitRow[] {
  const { previous, tasks, start } = args;
  const booking = new Set(tasks.map((t) => `${t.taskKey}|${t.season}`));
  const startMs = start.getTime();
  return previous.filter((row) => {
    if (!row.scheduled_start || !booking.has(`${row.task_key}|${row.season}`)) return false;
    const ms = new Date(row.scheduled_start).getTime();
    return Number.isFinite(ms) && ms !== startMs;
  });
}

/**
 * Bookings this customer STILL HAS COMING for one of these services, filed
 * under a different season from the one this visit would file it under.
 *
 * A booking is keyed on (task, season), so two bookings of the same service in
 * different seasons are two rows and the second never disturbs the first. That
 * is right for the case it was written for - `clean_gutters` is a fall AND a
 * spring task, and a customer holding both halves of the year is normal - but
 * the season is reconciled from the visit date, and for a two-season service it
 * flips on 1 Jun and 1 Dec. So a SEVEN-DAY slip from 25 Nov to 3 Dec files a
 * second row under spring while the fall row keeps 25 Nov: the customer is told
 * "we're coming tomorrow" on 24 Nov for a visit that moved, and the portal shows
 * it until it passes. Nothing distinguished that from a deliberate second
 * booking, and inferring which one it was is exactly the guessing the `replaces`
 * handshake was removed for.
 *
 * So it is refused instead, and the admin decides: the message names the visit
 * already on the books, and Cancel visit is one click away on the same screen.
 * A booking that cannot be silently duplicated cannot silently strand a
 * reminder.
 *
 * Scoped to windows still AHEAD. A window already past announces nothing - the
 * reminder run for it has fired and the portal card filters to the future - so
 * blocking on one only means a visit nobody closed out can never be re-booked.
 */
export function crossSeasonBookings(args: {
  previous: BookedVisitRow[];
  tasks: VisitTask[];
  now?: Date;
}): BookedVisitRow[] {
  const { previous, tasks, now = new Date() } = args;
  const seasonFor = new Map(tasks.map((t) => [t.taskKey, t.season]));
  const nowMs = now.getTime();
  return previous.filter((row) => {
    const season = seasonFor.get(row.task_key);
    if (!season || season === row.season || !row.scheduled_start) return false;
    const ms = new Date(row.scheduled_start).getTime();
    return Number.isFinite(ms) && ms > nowMs;
  });
}

/**
 * The windows left with no booking at all once these rows are cleared - the
 * only ones whose reminder should be pulled.
 *
 * A window is shared by every task booked into it. Move the gutters off a 5 Aug
 * visit that also carries a dryer vent and the 5 Aug window is still happening,
 * so cancelling its reminder on the strength of the gutters row alone would
 * leave the customer with an unannounced visit.
 */
export function orphanedVisitStarts(args: {
  previous: BookedVisitRow[];
  superseded: BookedVisitRow[];
}): Date[] {
  const { previous, superseded } = args;
  const cleared = new Set(superseded.map((r) => `${r.task_key}|${r.season}`));
  const stillHeld = new Set<number>();
  for (const row of previous) {
    if (!row.scheduled_start || cleared.has(`${row.task_key}|${row.season}`)) continue;
    stillHeld.add(new Date(row.scheduled_start).getTime());
  }
  const orphaned = new Map<number, Date>();
  for (const row of superseded) {
    const ms = new Date(row.scheduled_start!).getTime();
    if (Number.isFinite(ms) && !stillHeld.has(ms)) orphaned.set(ms, new Date(ms));
  }
  return [...orphaned.values()];
}

/**
 * Cancel the pending reminder for the visit(s) this booking replaces, then
 * queue a fresh one.
 *
 * Rescheduling MUST cancel first: a reminder announcing a visit that moved is
 * worse than no reminder at all.
 *
 * Cancellation is scoped to the VISIT, never to the address and never to the
 * day. A customer with gutters at 8am and a dryer vent at 1pm on the same date
 * has two pending reminders; moving one must not pull the other. `supersedes`
 * carries the start times this booking is replacing (the caller reads them off
 * the rows it is about to overwrite), and the new start is cleared too so
 * re-submitting the same window replaces its row rather than stacking a second.
 */
export type ReminderOutcome = 'queued' | 'skipped' | 'unavailable';

/** Whether a cancel actually reached the queue, or could not be carried out. */
export type ReminderCancelOutcome = 'cancelled' | 'unavailable';

export async function requeueVisitReminder(args: {
  email: string;
  name: string;
  start: Date;
  subject: string;
  html: string;
  supersedes?: Date[];
  now?: Date;
}): Promise<ReminderOutcome> {
  const { email, name, start, subject, html, supersedes = [], now = new Date() } = args;

  // Nothing is queued on top of a cancel that did not land. The old row is
  // still pending for a window this visit has left, so adding a second would
  // announce both - the moved visit and the real one - and the admin would be
  // told a reminder was on its way. `unavailable` tells them to text instead.
  if (await cancelPendingVisitReminders(email, [start, ...supersedes]) === 'unavailable') return 'unavailable';

  if (!reminderIsStillUseful(start, now)) return 'skipped';

  try {
    // follow_up_queue has no email_text column - the cron renders text from the
    // stored HTML, same as the nurture and review sequences.
    await supabaseRest('POST', 'follow_up_queue', [{
      lead_email: email,
      lead_name: name,
      follow_up_type: VISIT_REMINDER_TYPE,
      scheduled_at: reminderSendAt(start).toISOString(),
      visit_start: visitKey(start),
      status: 'pending',
      email_subject: subject,
      email_body: html,
    }]);
  } catch (err) {
    // The booking itself is already written and correct - the reminder is a
    // best-effort side effect on a shared table whose schema is hand-applied in
    // this repo. Until `visit_reminder_1d` is in the follow_up_type CHECK
    // (20260816) and `visit_start` exists (20260817), this insert 400s, and
    // turning that into a 500 would tell the admin a booking failed that in fact
    // succeeded. Report it instead, so they know to text the customer.
    console.error('visit reminder could not be queued:', err instanceof Error ? err.message : String(err));
    return 'unavailable';
  }
  return 'queued';
}

/**
 * Cancel ONE visit's pending reminder without queueing a replacement.
 *
 * `visitStart` is required so a cancel can never reach past the visit it names -
 * completing this morning's job must leave this afternoon's reminder alone.
 *
 * The outcome is returned, not swallowed: the caller has just told the customer
 * their visit is off, and whether the reminder went with it is the one thing
 * they need to know.
 */
export async function cancelVisitReminder(email: string, visitStart: Date): Promise<ReminderCancelOutcome> {
  return cancelPendingVisitReminders(email, [visitStart]);
}

/**
 * Cancel the still-pending reminders for exactly these visits, at exactly this
 * address.
 *
 * Select-then-patch-by-id rather than a PATCH straight off the pattern, for the
 * reason cancelFollowUps spells out: PostgREST reads `*` as an alias for `%` and
 * offers no way to escape it, so an ilike alone can reach a different customer.
 * The escaped prefilter narrows the candidates and a JS equality check keeps only
 * the exact case-insensitive matches, which no wildcard can slip past.
 *
 * Reports `unavailable` rather than swallowing a failure. Both halves used to
 * `.catch()` into silence, so a cancel that pulled nothing was indistinguishable
 * from one with nothing to pull - and the route answered "cancelled" and the
 * toast read "the reminder is pulled" while the "we're coming tomorrow" was
 * still queued. That is the worst thing this feature can emit, and every other
 * step in the reminder pipeline already fails closed: the booking read throws,
 * the cron sends nothing when its ledger read 400s, an ambiguous slot counts as
 * closed, and a ledger row that cannot be written skips the recipient.
 */
async function cancelPendingVisitReminders(email: string, visitStarts: Date[]): Promise<ReminderCancelOutcome> {
  const keys = [...new Set(visitStarts.map(visitKey))];
  if (keys.length === 0) return 'cancelled';

  let candidates: { id: string; lead_email: string }[];
  try {
    candidates = (await supabaseRest<{ id: string; lead_email: string }[]>(
      'GET',
      `follow_up_queue?select=id,lead_email&lead_email=ilike.${encodeURIComponent(escapeLikePattern(email))}` +
        `&follow_up_type=eq.${VISIT_REMINDER_TYPE}&status=eq.pending` +
        `&visit_start=in.(${keys.map((k) => `"${k}"`).join(',')})`,
    )) ?? [];
  } catch (err) {
    console.error('visit reminder cancel could not read the queue:', err instanceof Error ? err.message : String(err));
    return 'unavailable';
  }

  const wanted = email.trim().toLowerCase();
  const ids = candidates
    .filter((row) => (row.lead_email ?? '').trim().toLowerCase() === wanted)
    .map((row) => row.id);
  if (ids.length === 0) return 'cancelled';

  try {
    // Re-asserts 'pending' so a row the cron claimed between the select and the
    // update is left as sent rather than clobbered back to cancelled.
    await supabaseRest('PATCH', `follow_up_queue?id=in.(${ids.join(',')})&status=eq.pending`, { status: 'cancelled' });
  } catch (err) {
    console.error('visit reminder could not be cancelled:', err instanceof Error ? err.message : String(err));
    return 'unavailable';
  }
  return 'cancelled';
}
