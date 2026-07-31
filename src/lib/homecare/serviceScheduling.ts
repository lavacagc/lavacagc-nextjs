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
 */
export async function scheduleVisit(args: ScheduleArgs): Promise<void> {
  const { homeownerId, tasks, start, end, address } = args;
  if (tasks.length === 0) return;
  await supabaseRest('POST', 'homeowner_maintenance', tasks.map(({ taskKey, season }) => ({
    homeowner_id: homeownerId,
    task_key: taskKey,
    season,
    status: 'booked',
    // A booking is not a completion, so it clears both halves of one. Left in
    // place, a previous `completed_by='lavaca'` would label whoever ticks this
    // row next as work we did - the exact distinction completed_by exists for.
    completed_at: null,
    completed_by: 'homeowner',
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    service_address: address,
    updated_at: new Date().toISOString(),
  })), { onConflict: 'homeowner_id,task_key,season' });
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
 */
export async function bookedVisitRows(homeownerId: string): Promise<BookedVisitRow[]> {
  return (await supabaseRest<BookedVisitRow[]>(
    'GET',
    `homeowner_maintenance?select=task_key,season,scheduled_start&homeowner_id=eq.${homeownerId}` +
      '&scheduled_start=not.is.null',
  ).catch(() => [])) ?? [];
}

/**
 * The bookings this one replaces: every window these tasks are already holding
 * that is not the window being booked.
 *
 * ONE active booking per task is the whole model. `homeowner_maintenance` is
 * keyed on (homeowner, task, season) so a same-season reschedule is a plain
 * upsert in place, and this exists for the case the upsert cannot reach: the
 * season is derived from the visit date reconciled against the task's catalog
 * seasons, so moving a visit far enough lands it on a DIFFERENT row and the old
 * one would keep its window forever - a phantom visit on the portal and a live
 * "we're coming tomorrow" for a slot nobody attends.
 *
 * Two concurrently-booked visits of the same service are not a thing the
 * business does, so nothing here has to tell a move from a second booking - the
 * distinction that needed a caller-supplied handshake, and every bug that came
 * with it.
 *
 * Compared as INSTANTS, never as strings. PostgREST renders `timestamptz` the
 * way Postgres does - "2026-09-05T12:00:00+00:00" - and `Date#toISOString()`
 * gives "2026-09-05T12:00:00.000Z"; the same moment, spelled two ways, so a
 * string compare silently matches nothing in production.
 */
export function supersededBookings(args: {
  previous: BookedVisitRow[];
  taskKeys: string[];
  start: Date;
}): BookedVisitRow[] {
  const { previous, taskKeys, start } = args;
  const booking = new Set(taskKeys);
  const startMs = start.getTime();
  return previous.filter((row) => {
    if (!row.scheduled_start || !booking.has(row.task_key)) return false;
    const ms = new Date(row.scheduled_start).getTime();
    return Number.isFinite(ms) && ms !== startMs;
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
 * Clear the windows this booking supersedes.
 *
 * The upsert only reaches the (task, season) rows it writes. A visit that moves
 * across a season boundary - 5 Sep to 28 Aug, or a task whose reconciled season
 * changes with the date - lands on a DIFFERENT row, so without this the old one
 * keeps its window forever: a phantom visit on the portal and a live reminder
 * for a slot nobody is coming to.
 *
 * Scoped by window rather than by season, because one window's tasks can be
 * filed under different seasons. Runs BEFORE the upsert, so a failure leaves the
 * previous booking intact rather than half-moved.
 */
export async function clearSupersededBookings(args: {
  homeownerId: string;
  rows: BookedVisitRow[];
}): Promise<void> {
  const { homeownerId, rows } = args;
  const byStart = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.scheduled_start) continue;
    const keys = byStart.get(row.scheduled_start) ?? new Set<string>();
    keys.add(row.task_key);
    byStart.set(row.scheduled_start, keys);
  }

  for (const [startIso, keys] of byStart) {
    const updated_at = new Date().toISOString();
    const filter = `homeowner_maintenance?homeowner_id=eq.${homeownerId}` +
      `&scheduled_start=eq.${encodeURIComponent(startIso)}` +
      `&task_key=in.(${[...keys].map((k) => `"${k}"`).join(',')})`;
    // Only a row still sitting at 'booked' goes back to 'todo'. A member who
    // ticked this task off recorded THEIR completion on the same row, and
    // unbooking the visit is no reason to undo it.
    await supabaseRest('PATCH', `${filter}&status=eq.booked`, { status: 'todo', updated_at });
    await supabaseRest('PATCH', filter, { scheduled_start: null, scheduled_end: null, updated_at });
  }
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

  await cancelPendingVisitReminders(email, [start, ...supersedes]);

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
 */
export async function cancelVisitReminder(email: string, visitStart: Date): Promise<void> {
  await cancelPendingVisitReminders(email, [visitStart]);
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
 */
async function cancelPendingVisitReminders(email: string, visitStarts: Date[]): Promise<void> {
  const keys = [...new Set(visitStarts.map(visitKey))];
  if (keys.length === 0) return;

  const candidates = (await supabaseRest<{ id: string; lead_email: string }[]>(
    'GET',
    `follow_up_queue?select=id,lead_email&lead_email=ilike.${encodeURIComponent(escapeLikePattern(email))}` +
      `&follow_up_type=eq.${VISIT_REMINDER_TYPE}&status=eq.pending` +
      `&visit_start=in.(${keys.map((k) => `"${k}"`).join(',')})`,
  ).catch(() => [])) ?? [];

  const wanted = email.trim().toLowerCase();
  const ids = candidates
    .filter((row) => (row.lead_email ?? '').trim().toLowerCase() === wanted)
    .map((row) => row.id);
  if (ids.length === 0) return;

  // Re-asserts 'pending' so a row the cron claimed between the select and the
  // update is left as sent rather than clobbered back to cancelled.
  await supabaseRest('PATCH', `follow_up_queue?id=in.(${ids.join(',')})&status=eq.pending`, { status: 'cancelled' })
    .catch(() => {});
}
