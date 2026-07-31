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
import { buildDispatchEmail, buildDispatchCancelledEmail } from '@/lib/homecare/dispatchEmail';
import { visitKey, visitDateLabel, visitTimeWindow, visitEndsAt } from '@/lib/homecare/visitSchedule';

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
  /** RFC 5545 SEQUENCE - how many calendar messages this visit has issued. */
  ics_sequence: number;
}

/** Every column of a dispatch row, named once so no reader can select a stale set. */
export const VISIT_DISPATCH_COLUMNS =
  'id,homeowner_id,visit_start,sub_name,dispatched_at,nudged_at,escalated_at,ics_sequence';

/** The same, for an assignment. Four readers select these; one spelling. */
export const DISPATCH_ASSIGNMENT_COLUMNS =
  'id,dispatch_id,recipient_id,email,name,confirm_token,status,confirmed_at,note';

/** Everyone this visit was sent to, whatever each of them has answered. */
export async function assignmentsForDispatch(dispatchId: string): Promise<DispatchAssignment[]> {
  return (await supabaseRest<DispatchAssignment[]>(
    'GET',
    `visit_dispatch_recipients?select=${DISPATCH_ASSIGNMENT_COLUMNS}&dispatch_id=eq.${dispatchId}`,
  )) ?? [];
}

/** What the admin needs to see about one visit: has anybody answered, and how. */
export interface VisitDispatchState {
  state: 'none' | 'awaiting' | 'confirmed' | 'flagged';
  confirmedBy: string[];
  flags: { by: string; note: string | null }[];
}

/**
 * The state of one visit's dispatch, read off its assignments.
 *
 * A FLAG OUTRANKS A CONFIRMATION. Somebody saying this visit has a problem is
 * the only state that needs a person to do something, and a colleague having
 * confirmed does not make the problem go away - it only silences the 5pm and 6pm
 * stages, which is exactly why the flag has to stay visible somewhere else.
 */
export function dispatchStateOf(assignments: DispatchAssignment[]): VisitDispatchState {
  const named = (a: DispatchAssignment) => a.name || a.email;
  const confirmedBy = assignments.filter((a) => a.status === 'confirmed').map(named);
  const flags = assignments
    .filter((a) => a.status === 'flagged')
    .map((a) => ({ by: named(a), note: a.note }));
  const state = assignments.length === 0
    ? 'none'
    : flags.length > 0
      ? 'flagged'
      : confirmedBy.length > 0 ? 'confirmed' : 'awaiting';
  return { state, confirmedBy, flags };
}

/**
 * The calendar UID for one person's copy of one visit.
 *
 * Derived, never stored: a retraction has to carry the SAME UID as the invite
 * it withdraws, and this is what makes that reconstructable from the dispatch
 * row and the recipient - as long as the row is read before it is deleted.
 */
export function crewIcsUid(dispatchId: string, recipientId: string): string {
  return `lavaca-crew-${dispatchId}-${recipientId}`;
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
    `visit_dispatch?select=${VISIT_DISPATCH_COLUMNS}` +
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
  const existing = await assignmentsForDispatch(dispatchId);
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
    // Through visitEndsAt, never a fallback written out here: the escalation
    // reads the same missing end through that helper, and the two describing
    // one visit as "8:00 - 10:00am" and "8:00 - 9:00am" is what it exists to
    // stop.
    end: new Date(visitEndsAt(key, endIso)),
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
    `visit_dispatch_recipients?select=${DISPATCH_ASSIGNMENT_COLUMNS}` +
      `&confirm_token=eq.${encodeURIComponent(token)}&limit=1`,
  )) ?? [];
  const assignment = assignments[0];
  if (!assignment) return null;

  const dispatches = (await supabaseRest<VisitDispatchRow[]>(
    'GET',
    `visit_dispatch?select=${VISIT_DISPATCH_COLUMNS}&id=eq.${assignment.dispatch_id}&limit=1`,
  )) ?? [];
  const dispatch = dispatches[0];
  if (!dispatch) return null;

  const visit = await visitContextFor(dispatch.homeowner_id, new Date(dispatch.visit_start)).catch(() => null);
  return { assignment, dispatch, visit };
}

/** Whether the crew was actually told the visit is off. */
export type RetractionOutcome = 'sent' | 'not_needed' | 'send_failed';

export interface ClearDispatchResult {
  /** Whether the dispatch row itself came off. */
  status: 'cleared' | 'unavailable';
  retraction: RetractionOutcome;
  /** Who is still holding the visit on their calendar. Empty unless it failed. */
  unretracted: string[];
}

/**
 * Retire the dispatch record for a visit that is no longer happening, and take
 * the visit off the crew's calendar.
 *
 * Called when a visit is CANCELLED, COMPLETED, or moved off this window by a
 * reschedule. The row always goes: it is keyed on (homeowner, window), so
 * leaving it behind means a later booking of that same window reuses it - and
 * inherits `nudged_at`/`escalated_at`, which is precisely what tells the 5pm
 * stage it has already run. A re-booked visit would then never be chased, and
 * its confirm link would open already answered.
 *
 * `reason` decides whether the crew also gets a METHOD:CANCEL, and the two
 * answers are not interchangeable:
 *
 *  - **cancelled** - the visit is off, including a window a reschedule moved
 *    away from. Deleting the row does nothing to the event already sitting on
 *    somebody's phone, and that event carries the 7:00am "text the customer when
 *    the crew is on the way" alarm - the one thing in the system that produces
 *    that text. Without the retraction it fires anyway and a customer is texted
 *    about a job that is off; a reschedule leaves two events and two alarms.
 *    Only for a window STILL AHEAD, on the reasoning `crossSeasonBookings`
 *    already documents: a window already past has no alarm left to fire.
 *  - **completed** - the job HAPPENED. There is nothing to retract, and mailing
 *    "this visit is off, you are not going" about work somebody just finished
 *    would be a lie. The event stays on their calendar as the record it is.
 *
 * The recipients are read BEFORE the delete either way: the assignments cascade
 * with the row, taking the addresses and the UIDs with them.
 *
 * `visit` describes what is being retracted, for the email and the .ics. Pass it
 * from before the window was cleared where you can - once the tasks are unbooked
 * the services are no longer readable. What was actually sent is recorded in
 * email_log, which this does not touch, so the audit trail survives.
 *
 * Both halves are REPORTED, never assumed. A retraction that did not reach
 * somebody leaves them holding the visit and its 7:00am alarm - the precise
 * outcome the retraction exists to prevent - so it must never be handed back as
 * a clean cancel.
 */
export async function clearVisitDispatch(
  homeownerId: string,
  visitStart: Date,
  opts: { reason: 'cancelled' | 'completed'; visit?: VisitContext | null; now?: Date },
): Promise<ClearDispatchResult> {
  const { reason, visit, now = new Date() } = opts;
  let dispatch: VisitDispatchRow | null = null;
  let assignments: DispatchAssignment[] = [];
  try {
    const key = visitKey(visitStart);
    const rows = (await supabaseRest<VisitDispatchRow[]>(
      'GET',
      `visit_dispatch?select=${VISIT_DISPATCH_COLUMNS}` +
        `&homeowner_id=eq.${homeownerId}&visit_start=eq.${encodeURIComponent(key)}&limit=1`,
    )) ?? [];
    dispatch = rows[0] ?? null;

    if (dispatch) assignments = await assignmentsForDispatch(dispatch.id);

    await supabaseRest(
      'DELETE',
      `visit_dispatch?homeowner_id=eq.${homeownerId}&visit_start=eq.${encodeURIComponent(key)}`,
    );
  } catch (err) {
    console.error('crew dispatch could not be cleared:', err instanceof Error ? err.message : String(err));
    return { status: 'unavailable', retraction: 'not_needed', unretracted: [] };
  }

  // Only what actually went out is retracted, and only while there is still
  // something to take back. A dispatch that never sent left no event to remove;
  // a window ALREADY PAST announces nothing either - its 7:00am alarm has
  // fired or never will - so mailing "you are not going" about it is pure noise
  // on the one channel the crew has to keep trusting.
  let retraction: RetractionOutcome = 'not_needed';
  let unretracted: string[] = [];
  if (reason === 'cancelled' && dispatch?.dispatched_at && assignments.length > 0
      && visitStart.getTime() > now.getTime()) {
    unretracted = await sendDispatchRetraction({ homeownerId, visitStart, dispatch, assignments, visit })
      .catch((err) => {
        console.error(
          'crew dispatch retraction failed - the crew may still be holding the visit:',
          err instanceof Error ? err.message : String(err),
        );
        return assignments.map((a) => a.email);
      });
    retraction = unretracted.length > 0 ? 'send_failed' : 'sent';
  }

  return { status: 'cleared', retraction, unretracted };
}

/**
 * Tell everyone who was sent this visit that it is off, and answer with the
 * addresses that could NOT be told.
 *
 * SEQUENCE counts up from the row's own value: a client applies a CANCEL to the
 * event it holds only when the number is higher than the one it stored, so a
 * retraction reusing the invite's number can be discarded as a duplicate and
 * leave the event - and its 7:00am alarm - exactly where it was.
 */
async function sendDispatchRetraction(args: {
  homeownerId: string;
  visitStart: Date;
  dispatch: VisitDispatchRow;
  assignments: DispatchAssignment[];
  visit?: VisitContext | null;
}): Promise<string[]> {
  const { homeownerId, visitStart, dispatch, assignments } = args;

  // Read only as a fallback: by the time a cancel gets here the window is
  // usually already cleared, so this recovers the customer and the address but
  // not the services. Callers that still hold the visit pass it in.
  const visit = args.visit
    ?? await visitContextFor(homeownerId, visitStart).catch(() => null);

  // Same helper the escalation and the confirm page read a missing end through,
  // so a retraction cannot describe a different window than the chase did.
  const end = visit?.end ?? new Date(visitEndsAt(visitKey(visitStart), null));
  const customerName = visit?.customerName ?? 'the customer';
  const address = visit?.address ?? '';
  const services = visit?.services ?? [];
  const sequence = (dispatch.ics_sequence ?? 0) + 1;
  const unretracted: string[] = [];

  for (const assignment of assignments) {
    const { subject, html, text } = buildDispatchCancelledEmail({
      recipientName: assignment.name,
      customerName,
      address,
      services,
      visitDateLabel: visitDateLabel(visitStart),
      timeWindow: visitTimeWindow(visitStart, end),
    });

    // Same UID as that person's invite, or a client files this as a second,
    // cancelled event and leaves the live one alone.
    const ics = buildIcs({
      uid: crewIcsUid(dispatch.id, assignment.recipient_id),
      start: visitStart,
      end,
      services,
      address,
      customerName,
      variant: 'crew',
      cancel: true,
      sequence,
      attendees: [{ name: assignment.name, email: assignment.email }],
    });

    const res = await sendTrackedEmail({
      from: HOME_CARE_FROM,
      to: assignment.email,
      replyTo: SERVICE_REPLY_TO.join(', '),
      subject,
      html,
      text,
      category: 'crew_dispatch_cancelled',
      toName: assignment.name,
      homeownerId,
      campaign: { visit_start: visitKey(visitStart), dispatch_id: dispatch.id },
      attachments: [{ filename: 'visit.ics', content: ics }],
    });

    if (res.status !== 'sent') {
      unretracted.push(assignment.email);
      console.error(
        `crew dispatch retraction FAILED for ${assignment.email} - ${visitDateLabel(visitStart)}: ` +
          `${res.status}${res.error ? ` - ${res.error}` : ''}. They still have the visit on their calendar.`,
      );
    }
  }

  return unretracted;
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

  // Counted up only when an invite has already gone out for this visit. A
  // calendar applies a re-send to the event it holds only when SEQUENCE is
  // HIGHER than the one it stored, so re-dispatching a moved or amended visit
  // at the same number lands as a duplicate the client is entitled to discard.
  // A row that never sent is still on its first message and stays where it is.
  const sequence = dispatch.dispatched_at ? (dispatch.ics_sequence ?? 0) + 1 : (dispatch.ics_sequence ?? 0);

  for (const assignment of assignments) {
    // Per recipient, so the ATTENDEE line names the person who received it.
    const ics = buildIcs({
      uid: crewIcsUid(dispatch.id, assignment.recipient_id),
      start: visitStart,
      end: visitEnd,
      services,
      address,
      customerName,
      customerPhone,
      variant: 'crew',
      sequence,
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
    // The sequence is persisted with the stamp, and only when something landed:
    // a number stored for a send that never happened would let the next real
    // invite tie with a copy nobody holds, or skip past one they do.
    await supabaseRest('PATCH', `visit_dispatch?id=eq.${dispatch.id}`, {
      dispatched_at: new Date().toISOString(),
      ics_sequence: sequence,
      updated_at: new Date().toISOString(),
    }).catch(() => {});
  }

  if (sentTo.length === 0) return { outcome: 'send_failed', sentTo: [] };
  return { outcome: anyFailed ? 'send_failed' : 'sent', sentTo };
}
