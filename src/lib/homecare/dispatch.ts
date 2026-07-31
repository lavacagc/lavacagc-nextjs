/**
 * La Vaca Home Care - crew dispatch: who is going, and whether they confirmed.
 *
 * A visit is (homeowner, scheduled_start) - the same key the reminder ledger and
 * the portal card use. There is no visits table; a visit is the set of
 * homeowner_maintenance rows sharing a window, so `visit_dispatch` names the
 * window rather than pointing at one task row of several.
 *
 * Every write here is BEST-EFFORT relative to the booking. The booking is the
 * customer's commitment and is already written by the time dispatch runs; if the
 * dispatch email cannot go out, the right answer is to tell the admin so they
 * call the crew themselves - not to fail a booking that succeeded. Which is why
 * every function reports its outcome instead of throwing, and why the schedule
 * route surfaces it in the toast.
 */
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { newToken } from '@/lib/homecare/homeowners';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { HOME_CARE_FROM } from '@/lib/notify/sendHomeCareEmails';
import { SERVICE_REPLY_TO } from '@/lib/homecare/serviceEmails';
import { buildIcs, googleCalendarUrl } from '@/lib/homecare/ics';
import { buildDispatchEmail } from '@/lib/homecare/dispatchEmail';
import { visitKey } from '@/lib/homecare/visitSchedule';

export interface DispatchRecipient {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

export interface DispatchAssignment {
  id: string;
  dispatch_id: string;
  recipient_id: string;
  email: string;
  name: string | null;
  confirm_token: string;
  status: 'sent' | 'confirmed' | 'flagged';
  confirmed_at: string | null;
  note: string | null;
}

export interface VisitDispatchRow {
  id: string;
  homeowner_id: string;
  visit_start: string;
  sub_name: string | null;
  dispatched_at: string | null;
  nudged_at: string | null;
  escalated_at: string | null;
}

/** 'sent' means the email went out; the rest are why it did not. */
export type DispatchOutcome = 'sent' | 'no_recipients' | 'unavailable' | 'send_failed';

/**
 * The recipients this visit should go to.
 *
 * An explicit selection wins; with none, every ACTIVE recipient is used. The
 * default is deliberately "everybody" rather than "nobody": a booking made
 * without touching the picker must still reach the crew, because a dispatch
 * nobody receives is indistinguishable from the gap this feature was built to
 * close.
 *
 * Inactive recipients are dropped even when explicitly named - deactivating
 * someone has to actually stop their mail, or the checkbox is the only thing
 * keeping a former crew member on the list.
 */
export async function resolveRecipients(ids?: string[] | null): Promise<DispatchRecipient[]> {
  const all = (await supabaseRest<DispatchRecipient[]>(
    'GET',
    'dispatch_recipients?select=id,name,email,active&active=is.true&order=name.asc',
  )) ?? [];
  if (!ids || ids.length === 0) return all;
  const wanted = new Set(ids);
  return all.filter((r) => wanted.has(r.id));
}

/**
 * The dispatch row for this visit, created if it does not exist.
 *
 * Upserts on (homeowner_id, visit_start) so re-dispatching a visit - a
 * reschedule, or an admin adding a second person - reuses the row and keeps the
 * escalation stamps that already fired. Creating a second row would reset them
 * and re-nudge for a visit somebody already confirmed.
 */
export async function ensureVisitDispatch(args: {
  homeownerId: string;
  visitStart: Date;
  subName?: string | null;
}): Promise<VisitDispatchRow | null> {
  const key = visitKey(args.visitStart);
  const existing = (await supabaseRest<VisitDispatchRow[]>(
    'GET',
    `visit_dispatch?select=id,homeowner_id,visit_start,sub_name,dispatched_at,nudged_at,escalated_at` +
      `&homeowner_id=eq.${args.homeownerId}&visit_start=eq.${encodeURIComponent(key)}&limit=1`,
  )) ?? [];

  if (existing[0]) {
    // Only fill the sub in - never blank one an admin already typed by
    // re-booking without it.
    if (args.subName && args.subName !== existing[0].sub_name) {
      await supabaseRest('PATCH', `visit_dispatch?id=eq.${existing[0].id}`, {
        sub_name: args.subName, updated_at: new Date().toISOString(),
      }).catch(() => {});
      return { ...existing[0], sub_name: args.subName };
    }
    return existing[0];
  }

  const created = await supabaseRest<VisitDispatchRow[]>('POST', 'visit_dispatch', [{
    homeowner_id: args.homeownerId,
    visit_start: key,
    sub_name: args.subName ?? null,
  }]);
  return created?.[0] ?? null;
}

/**
 * Give each recipient a row and a token for this dispatch, reusing any they
 * already have.
 *
 * The token is per (dispatch, recipient) so a confirm link names exactly one
 * person on exactly one visit. Reusing an existing row keeps a confirmation that
 * already happened: re-sending the dispatch must not silently un-confirm a visit
 * the crew already signed off.
 *
 * The email and name are stored AS SENT rather than read back through the
 * recipient row, so the record of what happened does not rewrite itself when
 * somebody is renamed or deactivated later.
 */
export async function ensureAssignments(
  dispatchId: string,
  recipients: DispatchRecipient[],
): Promise<DispatchAssignment[]> {
  const existing = (await supabaseRest<DispatchAssignment[]>(
    'GET',
    `visit_dispatch_recipients?select=id,dispatch_id,recipient_id,email,name,confirm_token,status,confirmed_at,note` +
      `&dispatch_id=eq.${dispatchId}`,
  )) ?? [];
  const byRecipient = new Map(existing.map((a) => [a.recipient_id, a]));

  const missing = recipients.filter((r) => !byRecipient.has(r.id));
  if (missing.length > 0) {
    const created = await supabaseRest<DispatchAssignment[]>('POST', 'visit_dispatch_recipients',
      missing.map((r) => ({
        dispatch_id: dispatchId,
        recipient_id: r.id,
        email: r.email,
        name: r.name,
        confirm_token: newToken(),
      })));
    for (const row of created ?? []) byRecipient.set(row.recipient_id, row);
  }

  return recipients.map((r) => byRecipient.get(r.id)).filter((a): a is DispatchAssignment => Boolean(a));
}

export interface VisitContext {
  customerName: string;
  customerPhone: string | null;
  address: string;
  services: string[];
  start: Date;
  end: Date;
  /**
   * False when the window has been cleared - the visit was cancelled or closed
   * out. A dispatch row can outlive its visit by a few seconds either way, and
   * a confirm page that did not say so would let someone confirm a job that is
   * off.
   */
  stillBooked: boolean;
}

/**
 * Everything needed to describe a visit to a human: what, where, for whom.
 *
 * Read from `homeowner_maintenance` rather than from the dispatch row, because
 * the dispatch stores none of it - the visit is the set of task rows sharing a
 * window, and those rows are what a reschedule or a cancellation actually
 * changes. Reading them here is what keeps the confirm page honest about a
 * visit that moved after the email went out.
 */
export async function visitContextFor(
  homeownerId: string,
  visitStart: Date,
): Promise<VisitContext | null> {
  const key = visitKey(visitStart);
  const [rows, owners] = await Promise.all([
    supabaseRest<{ task_key: string; scheduled_start: string | null; scheduled_end: string | null; service_address: string | null }[]>(
      'GET',
      `homeowner_maintenance?select=task_key,scheduled_start,scheduled_end,service_address` +
        `&homeowner_id=eq.${homeownerId}&scheduled_start=eq.${encodeURIComponent(key)}`,
    ),
    supabaseRest<{ first_name: string | null; email: string; phone: string | null; address: string | null }[]>(
      'GET',
      `homeowners?select=first_name,email,phone,address&id=eq.${homeownerId}&limit=1`,
    ),
  ]);

  const owner = owners?.[0];
  if (!owner) return null;

  const booked = rows ?? [];
  const titles = booked.length > 0
    ? (await supabaseRest<{ key: string; title: string }[]>(
        'GET',
        `maintenance_catalog?select=key,title&key=in.(${[...new Set(booked.map((r) => `"${r.task_key}"`))].join(',')})`,
      )) ?? []
    : [];
  const titleFor = new Map(titles.map((t) => [t.key, t.title]));

  const start = new Date(key);
  const endIso = booked[0]?.scheduled_end;
  return {
    customerName: owner.first_name || owner.email,
    customerPhone: owner.phone,
    address: booked[0]?.service_address ?? owner.address ?? '',
    services: booked.map((r) => titleFor.get(r.task_key) ?? r.task_key),
    start,
    // A visit with no stored end is an hour long, matching visitEndsAt.
    end: endIso ? new Date(endIso) : new Date(start.getTime() + 3600_000),
    stillBooked: booked.length > 0,
  };
}

/** An assignment plus the visit it belongs to, resolved from a confirm token. */
export interface TokenLookup {
  assignment: DispatchAssignment;
  dispatch: VisitDispatchRow;
  visit: VisitContext | null;
}

/**
 * Resolve a confirm token to the person and the visit it names.
 *
 * READ ONLY, always. It backs the confirm page, which is a GET - and a GET that
 * changed anything would be tripped by every mail scanner and link-preview bot
 * that fetches URLs out of an inbox. The mutation lives behind POST
 * /api/crew/confirm.
 */
export async function lookupByToken(token: string): Promise<TokenLookup | null> {
  const assignments = (await supabaseRest<DispatchAssignment[]>(
    'GET',
    `visit_dispatch_recipients?select=id,dispatch_id,recipient_id,email,name,confirm_token,status,confirmed_at,note` +
      `&confirm_token=eq.${encodeURIComponent(token)}&limit=1`,
  )) ?? [];
  const assignment = assignments[0];
  if (!assignment) return null;

  const dispatches = (await supabaseRest<VisitDispatchRow[]>(
    'GET',
    `visit_dispatch?select=id,homeowner_id,visit_start,sub_name,dispatched_at,nudged_at,escalated_at` +
      `&id=eq.${assignment.dispatch_id}&limit=1`,
  )) ?? [];
  const dispatch = dispatches[0];
  if (!dispatch) return null;

  const visit = await visitContextFor(dispatch.homeowner_id, new Date(dispatch.visit_start)).catch(() => null);
  return { assignment, dispatch, visit };
}

/**
 * Retire the dispatch record for a visit that is no longer happening.
 *
 * Called when a visit is CANCELLED. The row is keyed on (homeowner, window), so
 * leaving it behind means a later booking of that same window reuses it - and
 * inherits `nudged_at`/`escalated_at`, which is precisely what tells the 5pm
 * stage it has already run. A re-booked visit would then never be chased.
 *
 * The assignments cascade with it. What was actually sent is recorded in
 * email_log, which this does not touch, so the audit trail survives.
 */
export async function clearVisitDispatch(
  homeownerId: string,
  visitStart: Date,
): Promise<'cleared' | 'unavailable'> {
  try {
    await supabaseRest(
      'DELETE',
      `visit_dispatch?homeowner_id=eq.${homeownerId}&visit_start=eq.${encodeURIComponent(visitKey(visitStart))}`,
    );
    return 'cleared';
  } catch (err) {
    console.error('crew dispatch could not be cleared:', err instanceof Error ? err.message : String(err));
    return 'unavailable';
  }
}

export interface SendDispatchArgs {
  siteUrl: string;
  homeownerId: string;
  visitStart: Date;
  visitEnd: Date;
  customerName: string;
  customerPhone?: string | null;
  address: string;
  services: string[];
  visitDateLabel: string;
  timeWindow: string;
  subName?: string | null;
  recipientIds?: string[] | null;
}

export interface SendDispatchResult {
  outcome: DispatchOutcome;
  /** Addresses the dispatch actually reached, for the admin's toast. */
  sentTo: string[];
  error?: string;
}

/**
 * Tell the crew about a visit.
 *
 * One email PER RECIPIENT, not one to all of them. The confirm link is
 * per-person - it is how we know who signed off - so a single message to both
 * addresses would hand Veronica a link that confirms as Alex, and whoever
 * clicked first would be recorded as whoever the link belonged to.
 *
 * The calendar file is attached rather than linked. Gmail renders its own "Add
 * to calendar" control for a METHOD:REQUEST attachment, which is one tap and
 * never leaves the inbox; a bare link to a hosted .ics downloads a file on
 * desktop that the recipient then has to find and import. The Google Calendar
 * template link in the body covers the same ground from the other direction.
 */
export async function sendVisitDispatch(args: SendDispatchArgs): Promise<SendDispatchResult> {
  const {
    siteUrl, homeownerId, visitStart, visitEnd, customerName, customerPhone,
    address, services, visitDateLabel, timeWindow, subName, recipientIds,
  } = args;

  let recipients: DispatchRecipient[];
  let dispatch: VisitDispatchRow | null;
  let assignments: DispatchAssignment[];
  try {
    recipients = await resolveRecipients(recipientIds);
    if (recipients.length === 0) return { outcome: 'no_recipients', sentTo: [] };

    dispatch = await ensureVisitDispatch({ homeownerId, visitStart, subName });
    if (!dispatch) return { outcome: 'unavailable', sentTo: [], error: 'could not create the dispatch row' };

    assignments = await ensureAssignments(dispatch.id, recipients);
    if (assignments.length === 0) {
      return { outcome: 'unavailable', sentTo: [], error: 'could not create the assignment rows' };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('crew dispatch could not be recorded:', error);
    return { outcome: 'unavailable', sentTo: [], error };
  }

  const calendarUrl = googleCalendarUrl({
    title: `La Vaca: ${services.join(', ')} - ${customerName}`,
    start: visitStart,
    end: visitEnd,
    details: [
      `Services: ${services.join(', ')}`,
      `Customer: ${customerName}${customerPhone ? ` - ${customerPhone}` : ''}`,
      'Text the customer when the crew is on the way.',
    ].join('\n'),
    location: address,
  });

  const sentTo: string[] = [];
  let anyFailed = false;

  for (const assignment of assignments) {
    // Per recipient, so the ATTENDEE line names the person who received it.
    const ics = buildIcs({
      uid: `lavaca-crew-${dispatch.id}-${assignment.recipient_id}`,
      start: visitStart,
      end: visitEnd,
      services,
      address,
      customerName,
      customerPhone,
      variant: 'crew',
      attendees: [{ name: assignment.name, email: assignment.email }],
    });

    const { subject, html, text } = buildDispatchEmail({
      recipientName: assignment.name,
      customerName,
      customerPhone,
      address,
      services,
      visitDateLabel,
      timeWindow,
      subName: dispatch.sub_name,
      confirmUrl: `${siteUrl}/crew/confirm/${assignment.confirm_token}`,
      calendarUrl,
    });

    // No preferenceStream: a marketing opt-out must never be able to suppress
    // the email that tells someone where to be tomorrow.
    const res = await sendTrackedEmail({
      from: HOME_CARE_FROM,
      to: assignment.email,
      replyTo: SERVICE_REPLY_TO.join(', '),
      subject,
      html,
      text,
      category: 'crew_dispatch',
      toName: assignment.name,
      homeownerId,
      campaign: { visit_start: visitKey(visitStart), dispatch_id: dispatch.id },
      attachments: [{ filename: 'visit.ics', content: ics }],
    });

    if (res.status === 'sent') sentTo.push(assignment.email);
    else {
      anyFailed = true;
      console.error(
        `crew dispatch FAILED for ${assignment.email} - ${visitDateLabel} ${timeWindow}: ` +
          `${res.status}${res.error ? ` - ${res.error}` : ''}. Call them.`,
      );
    }
  }

  // Stamped only when at least one dispatch actually landed. `dispatched_at` is
  // what the escalation reads to tell "nobody has confirmed" from "nobody was
  // ever told", and those want different messages.
  if (sentTo.length > 0) {
    await supabaseRest('PATCH', `visit_dispatch?id=eq.${dispatch.id}`, {
      dispatched_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).catch(() => {});
  }

  if (sentTo.length === 0) return { outcome: 'send_failed', sentTo: [] };
  return { outcome: anyFailed ? 'send_failed' : 'sent', sentTo };
}
