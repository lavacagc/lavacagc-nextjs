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
import { VISIT_REMINDER_TYPE, reminderSendAt, reminderIsStillUseful } from './visitSchedule';

export interface HomeownerLite {
  id: string;
  email: string;
  first_name: string | null;
  phone: string | null;
  status: string;
  source: string | null;
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
    `homeowners?select=id,email,first_name,phone,status,source,address,city,zip&email=eq.${encodeURIComponent(email)}&limit=1`,
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
 * Cancel any pending reminder for this homeowner, then queue a fresh one.
 *
 * Rescheduling MUST cancel first: a reminder announcing a visit that moved is
 * worse than no reminder at all.
 */
export async function requeueVisitReminder(args: {
  email: string;
  name: string;
  start: Date;
  subject: string;
  html: string;
  now?: Date;
}): Promise<'queued' | 'skipped'> {
  const { email, name, start, subject, html, now = new Date() } = args;

  await supabaseRest(
    'PATCH',
    `follow_up_queue?lead_email=ilike.${encodeURIComponent(escapeLike(email))}&follow_up_type=eq.${VISIT_REMINDER_TYPE}&status=eq.pending`,
    { status: 'cancelled' },
  ).catch(() => {});

  if (!reminderIsStillUseful(start, now)) return 'skipped';

  // follow_up_queue has no email_text column - the cron renders text from the
  // stored HTML, same as the nurture and review sequences.
  await supabaseRest('POST', 'follow_up_queue', [{
    lead_email: email,
    lead_name: name,
    follow_up_type: VISIT_REMINDER_TYPE,
    scheduled_at: reminderSendAt(start).toISOString(),
    status: 'pending',
    email_subject: subject,
    email_body: html,
  }]);
  return 'queued';
}

/** Cancel a visit's pending reminder without queueing a replacement. */
export async function cancelVisitReminder(email: string): Promise<void> {
  await supabaseRest(
    'PATCH',
    `follow_up_queue?lead_email=ilike.${encodeURIComponent(escapeLike(email))}&follow_up_type=eq.${VISIT_REMINDER_TYPE}&status=eq.pending`,
    { status: 'cancelled' },
  ).catch(() => {});
}

/** The queue stores raw addresses, so match case-insensitively with LIKE metacharacters neutralised. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
