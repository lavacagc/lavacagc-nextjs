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

export interface ScheduleArgs {
  homeownerId: string;
  taskKeys: string[];
  season: string;
  start: Date;
  end: Date;
  address: string;
}

/**
 * Write the schedule onto each task, marking them `booked`.
 *
 * Upsert on the table's natural key (homeowner, task, season) so rescheduling
 * updates in place rather than accumulating rows.
 */
export async function scheduleVisit(args: ScheduleArgs): Promise<void> {
  const { homeownerId, taskKeys, season, start, end, address } = args;
  if (taskKeys.length === 0) return;
  await supabaseRest('POST', 'homeowner_maintenance', taskKeys.map((task_key) => ({
    homeowner_id: homeownerId,
    task_key,
    season,
    status: 'booked',
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    service_address: address,
    updated_at: new Date().toISOString(),
  })), { onConflict: 'homeowner_id,task_key,season' });
}

/**
 * The distinct start times currently booked for these tasks.
 *
 * Read BEFORE the upsert overwrites them: these are the visits a new booking
 * supersedes, and the only way to pull exactly their reminders.
 */
export async function bookedVisitStarts(args: {
  homeownerId: string;
  taskKeys: string[];
  season: string;
}): Promise<Date[]> {
  const { homeownerId, taskKeys, season } = args;
  if (taskKeys.length === 0) return [];
  const rows = (await supabaseRest<{ scheduled_start: string | null }[]>(
    'GET',
    `homeowner_maintenance?select=scheduled_start&homeowner_id=eq.${homeownerId}&season=eq.${encodeURIComponent(season)}` +
      `&task_key=in.(${taskKeys.map((k) => `"${k}"`).join(',')})&status=eq.booked`,
  ).catch(() => [])) ?? [];
  return [...new Set(rows.map((r) => r.scheduled_start).filter((s): s is string => !!s))]
    .map((iso) => new Date(iso));
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
export async function requeueVisitReminder(args: {
  email: string;
  name: string;
  start: Date;
  subject: string;
  html: string;
  supersedes?: Date[];
  now?: Date;
}): Promise<'queued' | 'skipped'> {
  const { email, name, start, subject, html, supersedes = [], now = new Date() } = args;

  await cancelPendingVisitReminders(email, [start, ...supersedes]);

  if (!reminderIsStillUseful(start, now)) return 'skipped';

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
