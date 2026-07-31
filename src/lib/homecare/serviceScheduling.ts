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
 * Every visit currently on the books for these tasks, in ANY season.
 *
 * Read BEFORE the upsert overwrites them: these are the visits a new booking
 * may supersede, and the only way to pull exactly their reminders.
 *
 * A visit is a row carrying a `scheduled_start`, NOT a row whose status happens
 * to read 'booked'. `status` is shared with the member's own checkbox, which
 * writes 'done'/'todo' onto the same (homeowner, task, season) row - so a
 * status-scoped read goes blind the moment a member ticks a task La Vaca has
 * booked, and the visit would neither move with a reschedule nor lose its
 * reminder.
 *
 * Deliberately NOT scoped to the season the new booking lands in either. The
 * season is derived from the visit date reconciled against the task's catalog
 * seasons, so moving a visit can move its row.
 */
export async function bookedVisitRows(args: {
  homeownerId: string;
  taskKeys: string[];
}): Promise<BookedVisitRow[]> {
  const { homeownerId, taskKeys } = args;
  if (taskKeys.length === 0) return [];
  return (await supabaseRest<BookedVisitRow[]>(
    'GET',
    `homeowner_maintenance?select=task_key,season,scheduled_start&homeowner_id=eq.${homeownerId}` +
      `&task_key=in.(${taskKeys.map((k) => `"${k}"`).join(',')})&scheduled_start=not.is.null`,
  ).catch(() => [])) ?? [];
}

/** The distinct windows a set of booked rows stands for. */
export function visitStartsOf(rows: BookedVisitRow[]): Date[] {
  return [...new Set(rows.map((r) => r.scheduled_start).filter((s): s is string => !!s))]
    .map((iso) => new Date(iso));
}

/**
 * The visits this booking supersedes - the ones it overwrites, plus the one the
 * caller says it is replacing.
 *
 * A row on a (task, season) this booking writes is superseded by definition:
 * the upsert lands on it, so its window is gone whatever we do and its reminder
 * has to go with it.
 *
 * Any OTHER booked row is ambiguous, and guessing there loses a real visit.
 * `clean_gutters` is `['fall','spring']`, so booking 10 Oct and then 15 Apr is
 * two visits a customer asked for, not a reschedule - yet both are the same
 * task for the same homeowner. Treating every other-season booking as
 * superseded unbooks the October visit and cancels its reminder while the
 * owner's calendar still holds it. So the caller has to NAME the window it is
 * moving from (`replaces`), and anything it does not name is left alone.
 */
export function supersededBookings(args: {
  previous: BookedVisitRow[];
  tasks: VisitTask[];
  start: Date;
  replaces?: Date | null;
}): BookedVisitRow[] {
  const { previous, tasks, start, replaces } = args;
  const overwritten = new Set(tasks.map((t) => `${t.taskKey}|${t.season}`));
  const startIso = start.toISOString();
  const replacedIso = replaces ? replaces.toISOString() : null;
  return previous.filter((row) => {
    if (!row.scheduled_start || row.scheduled_start === startIso) return false;
    return overwritten.has(`${row.task_key}|${row.season}`) || row.scheduled_start === replacedIso;
  });
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
