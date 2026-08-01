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
import { buildIcs, googleCalendarUrl, icsContentType } from '@/lib/homecare/ics';
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
  /**
   * `retired` means this person was taken OFF the visit - un-ticked on the
   * picker and the window re-dispatched. Their row survives as the record that
   * they were once sent it, but it counts for nothing: the token stops working
   * and the escalation neither waits on them nor accepts their answer.
   */
  status: 'sent' | 'confirmed' | 'flagged' | 'retired';
  confirmed_at: string | null;
  note: string | null;
  /**
   * When the office was actually TOLD about the flag this row currently
   * carries - a Telegram that genuinely returned 'sent', never an attempt.
   *
   * Null covers both "nothing to tell" and "we tried and it did not get
   * through", and those are the same thing to everybody downstream: nobody has
   * read it. It is what lets the repeat-tap guard suppress a second alert only
   * when the first one landed, and what lets the confirm page say which of the
   * two happened when the link is re-opened later.
   */
  notified_at: string | null;
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
  'id,dispatch_id,recipient_id,email,name,confirm_token,status,confirmed_at,note,notified_at';

/**
 * The dispatch row for one visit, or null if it has none.
 *
 * (homeowner, window) is the key that identifies a visit everywhere in this
 * feature, and it is precisely the value that must not drift between readers:
 * the `visitKey` normalisation and the URL encoding both have to be right in
 * every one of them, and a reader that got either wrong would quietly find no
 * row and report the visit as never dispatched. So it is spelled once, the same
 * rule `assignmentsForDispatch` and `DISPATCH_ASSIGNMENT_COLUMNS` already hold
 * the sibling read to.
 */
export async function dispatchForVisit(
  homeownerId: string,
  visitStart: Date,
): Promise<VisitDispatchRow | null> {
  const rows = (await supabaseRest<VisitDispatchRow[]>(
    'GET',
    `visit_dispatch?select=${VISIT_DISPATCH_COLUMNS}` +
      `&homeowner_id=eq.${homeownerId}&visit_start=eq.${encodeURIComponent(visitKey(visitStart))}&limit=1`,
  )) ?? [];
  return rows[0] ?? null;
}

/** Everyone this visit was sent to, whatever each of them has answered. */
export async function assignmentsForDispatch(dispatchId: string): Promise<DispatchAssignment[]> {
  return (await supabaseRest<DispatchAssignment[]>(
    'GET',
    `visit_dispatch_recipients?select=${DISPATCH_ASSIGNMENT_COLUMNS}&dispatch_id=eq.${dispatchId}`,
  )) ?? [];
}

/**
 * Everybody still ON this visit.
 *
 * A retired assignment is somebody who was dropped from the selection: their
 * confirmation is not an answer, their flag is not an open problem, and their
 * silence is not something to chase. Every reader that asks "what has the crew
 * said" goes through here, so no reader can forget.
 */
export function liveAssignments(assignments: DispatchAssignment[]): DispatchAssignment[] {
  return assignments.filter((a) => a.status !== 'retired');
}

/** What the admin needs to see about one visit: has anybody answered, and how. */
export interface VisitDispatchState {
  /** `unknown` is a READ that failed - never the same answer as "none". */
  state: 'unknown' | 'none' | 'awaiting' | 'confirmed' | 'flagged';
  confirmedBy: string[];
  flags: { by: string; note: string | null }[];
}

/** What a visit's state reads as when the dispatch tables could not be read. */
export const UNKNOWN_DISPATCH_STATE: VisitDispatchState = {
  state: 'unknown', confirmedBy: [], flags: [],
};

/**
 * The sub recorded on one visit, for the screen that can overwrite it.
 *
 * The Sub box is authoritative on every save and an empty one is a clear, so
 * the admin has to be shown what is stored BEFORE they save - a blank box over
 * a stored sub deletes a name nobody was ever shown. That makes `read` part of
 * the answer rather than a detail: a sub that could not be read is not the
 * absence of one, and the box cannot quietly present it as such.
 */
export interface VisitSubState {
  /** `unavailable` is a READ that failed - never the same answer as "no sub". */
  read: 'ok' | 'unavailable';
  name: string | null;
}

/** What a visit's sub reads as when the dispatch row could not be read. */
export const UNKNOWN_VISIT_SUB: VisitSubState = { read: 'unavailable', name: null };

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
  const live = liveAssignments(assignments);
  const confirmedBy = live.filter((a) => a.status === 'confirmed').map(named);
  const flags = live
    .filter((a) => a.status === 'flagged')
    .map((a) => ({ by: named(a), note: a.note }));
  const state = live.length === 0
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

/**
 * 'sent' means the email went out AND everything around it was recorded; the
 * rest are why it did not.
 *
 * `sent_degraded` is the one that needs saying out loud: the crew were mailed,
 * but part of the record did not land - somebody dropped from the visit whose
 * link is still live, somebody ticked who was never written to, a send that is
 * not on the dispatch row, or a sub the email names and the row does not. Each
 * of those is something the admin has to act on, so none of them may be handed
 * back as a clean 'sent'.
 */
export type DispatchOutcome =
  'sent' | 'sent_degraded' | 'no_recipients' | 'unavailable' | 'send_failed';

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

/** The dispatch row for a visit, and whether everything about it was stored. */
export interface EnsureDispatchResult {
  row: VisitDispatchRow | null;
  /**
   * Whether the sub the admin typed reached the row. `unavailable` means what
   * was mailed and what is stored have DIVERGED, in whichever direction: a sub
   * the email names and the row does not, or one the email leaves off and the
   * row still carries. Either way the confirm page and a later flag alert read
   * the row, so only the toast can say so.
   */
  subRecorded: 'ok' | 'unavailable';
}

/**
 * The dispatch row for this visit, created if it does not exist.
 *
 * A READ-THEN-INSERT, not an upsert - `on_conflict` would switch the Prefer
 * header to `return=minimal` (supabase-rest.ts), leaving every first dispatch
 * with no row to hand back and reporting `unavailable`. So the conflict is
 * recovered where it happens instead: two callers that both miss the row - a
 * cron retry overlapping a booking, the same window saved from two tabs - race,
 * the loser's insert violates `idx_visit_dispatch_visit`, and it reads the
 * winner's row rather than failing a booking over a race it lost - then applies
 * its own sub to it, because the row it recovered was written by somebody else.
 *
 * An EXISTING row is reused either way - a reschedule, or an admin adding a
 * second person - so the escalation stamps that already fired survive. Creating
 * a second row would reset them and re-nudge a visit somebody already confirmed.
 *
 * WHATEVER IS IN THE SUB BOX WINS. A name replaces the one stored, and an EMPTY
 * box clears it: the admin is the sole author of that field, so the "only fill
 * blanks" rule `ensureServiceHomeowner` follows - which is right where the
 * CUSTOMER owns the data - made a sub write-once per window, re-mailing a sub
 * who fell through with no way to correct it short of cancelling the visit.
 * ABSENT is the one thing that leaves the stored value alone, which is what
 * keeps the escalation cron - it passes no sub at all - from wiping one as a
 * side effect of chasing a visit.
 *
 * The sub write is best-effort but REPORTED, like every other write here. What
 * was mailed and what was stored diverging is the whole of the harm, and it is
 * invisible from anywhere else: the email is right because it is built from the
 * value handed back, so nothing downstream can tell that the row is not.
 */
export async function ensureVisitDispatch(args: {
  homeownerId: string;
  visitStart: Date;
  subName?: string | null;
}): Promise<EnsureDispatchResult> {
  const key = visitKey(args.visitStart);
  // Empty is a CLEAR, undefined is "not my field to touch". They are different
  // answers here and must not be flattened into one.
  const sub = args.subName === undefined ? undefined : args.subName || null;

  /**
   * The box applied to whichever row this call ended up with - the one that was
   * already there, or the one a concurrent caller won the race with.
   *
   * The recovered row goes through here too rather than being handed straight
   * back: the likeliest racer is precisely the caller with no sub to contribute
   * - the escalation cron creating tomorrow's row - so returning the winner's
   * row as-is dropped the sub the admin had just typed, and reported it as
   * stored.
   */
  const withSub = async (existing: VisitDispatchRow): Promise<EnsureDispatchResult> => {
    if (sub !== undefined && sub !== existing.sub_name) {
      const subRecorded = await supabaseRest('PATCH', `visit_dispatch?id=eq.${existing.id}`, {
        sub_name: sub, updated_at: new Date().toISOString(),
      }).then(() => 'ok' as const).catch((err) => {
        console.error(
          sub
            ? `crew dispatch could not store the sub "${sub}" - this send still names them, `
              + 'but the confirm page and a later flag alert will not:'
            : `crew dispatch could not clear the sub "${existing.sub_name}" - this send leaves them `
              + 'off, but the confirm page and a later flag alert still name them:',
          err instanceof Error ? err.message : String(err),
        );
        return 'unavailable' as const;
      });
      // What the admin typed, whether or not it was stored: this value is what
      // goes in the email, and a failed write is a reason to report, not a
      // reason to tell the crew a different sub's name.
      return { row: { ...existing, sub_name: sub }, subRecorded };
    }
    return { row: existing, subRecorded: 'ok' };
  };

  const existing = await dispatchForVisit(args.homeownerId, args.visitStart);

  if (existing) {
    return withSub(existing);
  }

  const created = await supabaseRest<VisitDispatchRow[]>('POST', 'visit_dispatch', [{
    homeowner_id: args.homeownerId,
    visit_start: key,
    sub_name: sub ?? null,
  }]).catch((err) => {
    console.error(
      'crew dispatch row could not be created - re-reading in case a concurrent caller won the race:',
      err instanceof Error ? err.message : String(err),
    );
    return null;
  });
  // The insert carried the sub, so a row it created needs nothing further.
  if (created?.[0]) return { row: created[0], subRecorded: 'ok' };

  const won = await dispatchForVisit(args.homeownerId, args.visitStart).catch(() => null);
  // A row that could not be created carries no sub either, but that is the row
  // failing rather than the sub - reported as `unavailable` by the caller, where
  // it stops the send outright.
  if (!won) return { row: null, subRecorded: 'ok' };
  return withSub(won);
}

/** Who this dispatch can go to, and what could not be done to the rest. */
export interface EnsureAssignmentsResult {
  /** The people this send should actually reach. */
  assignments: DispatchAssignment[];
  /**
   * Dropped recipients whose retirement did NOT land. Their confirm link still
   * works, so a tap from them still answers for a visit they are not on.
   */
  stillLive: string[];
  /**
   * Ticked recipients left without a usable row, so nothing was mailed to them.
   */
  notMailed: string[];
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
 *
 * ANYBODY DROPPED FROM THE SELECTION IS RETIRED. Un-ticking somebody and
 * re-dispatching the same window is how a mis-addressed visit is corrected -
 * and re-booking the same window is a re-dispatch, not a supersede, so nothing
 * else would ever clean their row up. Left alone it keeps a live confirm token,
 * and a tap from somebody who is not on the visit satisfies the escalation's
 * "somebody confirmed" - silencing the 5pm and 6pm chases for a visit the
 * people actually going have never answered. Their calendar event is
 * deliberately NOT retracted (owner decision): the confirm page tells them they
 * are off it, which is where anybody acting on the stale 7:00am alarm lands.
 *
 * BOTH FAILURES ARE REPORTED, never swallowed. A retirement that did not land
 * is the worst failure in this module: it does not lose information, it disables
 * the safety net - the dropped person keeps a live token, and one tap from them
 * satisfies the escalation's "somebody confirmed" for a visit the people
 * actually going have never answered. A revival that did not land is the milder
 * twin, and silently drops somebody the admin ticked out of the send.
 */
export async function ensureAssignments(
  dispatchId: string,
  recipients: DispatchRecipient[],
): Promise<EnsureAssignmentsResult> {
  const existing = await assignmentsForDispatch(dispatchId);
  const byRecipient = new Map(existing.map((a) => [a.recipient_id, a]));
  const wanted = new Set(recipients.map((r) => r.id));
  const stamp = new Date().toISOString();
  const stillLive: string[] = [];

  const dropped = existing.filter((a) => !wanted.has(a.recipient_id) && a.status !== 'retired');
  if (dropped.length > 0) {
    await supabaseRest('PATCH',
      `visit_dispatch_recipients?id=in.(${dropped.map((a) => a.id).join(',')})`,
      { status: 'retired', updated_at: stamp },
    ).catch((err) => {
      // Handed back, not just logged. This failure DISABLES the safety net
      // rather than losing information, and only the admin can undo it.
      stillLive.push(...dropped.map((a) => a.email));
      console.error(
        `crew dispatch could not retire ${dropped.map((a) => a.email).join(', ')} - ` +
          'their confirm link still works and can silence the escalation:',
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  // Back on the visit after being dropped. Their answer went with the
  // retirement, so they are asked again rather than counted as having confirmed
  // a visit they were not on. Only what the database actually accepted is
  // treated as revived - a failed PATCH would otherwise mail somebody a link
  // that is still dead.
  const returning = existing.filter((a) => wanted.has(a.recipient_id) && a.status === 'retired');
  if (returning.length > 0) {
    const revived = (await supabaseRest<DispatchAssignment[]>('PATCH',
      `visit_dispatch_recipients?id=in.(${returning.map((a) => a.id).join(',')})` +
        `&select=${DISPATCH_ASSIGNMENT_COLUMNS}`,
      // `notified_at` goes with the note it belonged to. Left standing it would
      // tell the flag guard that an alert for this row's (now cleared) note
      // already landed, and suppress the first real one.
      { status: 'sent', confirmed_at: null, note: null, notified_at: null, updated_at: stamp },
    ).catch((err) => {
      console.error(
        'crew dispatch could not put a returning recipient back on the visit:',
        err instanceof Error ? err.message : String(err),
      );
      return [] as DispatchAssignment[];
    })) ?? [];
    for (const row of revived) byRecipient.set(row.recipient_id, row);
  }

  // Caught like every other write here rather than thrown. This insert and the
  // retire PATCH above hit the SAME table, so whatever breaks one - a revoked
  // grant, RLS without the service key, a 5xx window - breaks both, which makes
  // a combined failure the most likely way to get here rather than the least.
  // Throwing would take the retirement verdict computed moments ago with it,
  // and that verdict is the one thing only the admin can act on: somebody off
  // the visit whose single tap still satisfies "the crew confirmed". Answering
  // with nothing instead drops these recipients through to `notMailed` below,
  // so both failures are named.
  const missing = recipients.filter((r) => !byRecipient.has(r.id));
  if (missing.length > 0) {
    const created = await supabaseRest<DispatchAssignment[]>('POST', 'visit_dispatch_recipients',
      missing.map((r) => ({
        dispatch_id: dispatchId,
        recipient_id: r.id,
        email: r.email,
        name: r.name,
        confirm_token: newToken(),
      }))).catch((err) => {
      console.error(
        `crew dispatch could not create a record for ${missing.map((r) => r.email).join(', ')} - ` +
          'nothing was mailed to them:',
        err instanceof Error ? err.message : String(err),
      );
      return [] as DispatchAssignment[];
    });
    for (const row of created ?? []) byRecipient.set(row.recipient_id, row);
  }

  // Still retired here means the revive above did not land, and no row at all
  // means the insert answered with nothing. Either way that person is SKIPPED
  // rather than mailed - the confirm link in their email would open "you are no
  // longer on this visit", which is worse than not writing to them - and named
  // rather than silently dropped, because the only other clue the admin would
  // get is a `dispatchedTo` listing fewer people than they ticked.
  const assignments: DispatchAssignment[] = [];
  const notMailed: string[] = [];
  for (const r of recipients) {
    const row = byRecipient.get(r.id);
    if (row && row.status !== 'retired') assignments.push(row);
    else notMailed.push(r.email);
  }

  return { assignments, stillLive, notMailed };
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

/**
 * What a visit read produced, or why it produced nothing.
 *
 * `none` is an ANSWER - there is no such customer - and `unavailable` is a read
 * that FAILED. Kept apart from each other and from `ok` for the reason the whole
 * module keeps them apart: an email, a page or an alert built out of a failed
 * read looks exactly like one built out of an empty answer, and only one of the
 * two is safe to put in front of somebody.
 */
export type VisitContextRead =
  | { status: 'ok'; visit: VisitContext }
  | { status: 'none' }
  | { status: 'unavailable' };

/**
 * `visitContextFor`, reported rather than thrown.
 *
 * Every caller that describes a visit to a human goes through here, so none of
 * them can invent its own `.catch(() => null)` and lose the difference between
 * "no such visit" and "we could not look". That difference decided whether a
 * crew member was told their live visit was cancelled, and whether a retraction
 * went out naming nobody.
 */
export async function readVisitContext(
  homeownerId: string,
  visitStart: Date,
): Promise<VisitContextRead> {
  try {
    const visit = await visitContextFor(homeownerId, visitStart);
    return visit ? { status: 'ok', visit } : { status: 'none' };
  } catch (err) {
    console.error(
      `crew dispatch could not read the visit at ${visitKey(visitStart)} for ${homeownerId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return { status: 'unavailable' };
  }
}

/** An assignment plus the visit it belongs to, resolved from a confirm token. */
export interface TokenLookup {
  assignment: DispatchAssignment;
  dispatch: VisitDispatchRow;
  /** Null ONLY when the read failed - never because the visit is off. */
  visit: VisitContext | null;
  /**
   * Whether the visit could be read at all.
   *
   * `unavailable` is not an answer ABOUT the visit and must never be rendered
   * as one. The assignment and the dispatch row resolved; what did not is the
   * description of the job - so "we could not check" is what the crew and the
   * flag alert are told, not "this visit is off".
   */
  visitRead: 'ok' | 'unavailable';
}

/**
 * What a token resolved to.
 *
 * `not_found` is a deliberate dead end - the token names nobody, and every
 * caller answers that generically so live tokens cannot be enumerated.
 * `unavailable` is a READ that FAILED, and is a different thing entirely: the
 * link may be perfectly good. Folding the two together told a crew member
 * holding a live link that it was dead, which is why they are separate values
 * rather than a null both callers have to remember to interpret.
 */
export type TokenLookupResult =
  | { status: 'ok'; found: TokenLookup }
  | { status: 'not_found' }
  | { status: 'unavailable' };

/**
 * Resolve a confirm token to the person and the visit it names.
 *
 * READ ONLY, always. It backs the confirm page, which is a GET - and a GET that
 * changed anything would be tripped by every mail scanner and link-preview bot
 * that fetches URLs out of an inbox. The mutation lives behind POST
 * /api/crew/confirm.
 *
 * REPORTS rather than throws, like everything else in this module. Both reads
 * below can fail - a 5xx, a revoked grant, RLS reached without the service key -
 * and a caller that caught that into the same null a missing token produces
 * would state, flatly, that somebody's working link is not valid.
 */
export async function lookupByToken(token: string): Promise<TokenLookupResult> {
  let assignment: DispatchAssignment | undefined;
  let dispatch: VisitDispatchRow | undefined;
  try {
    const assignments = (await supabaseRest<DispatchAssignment[]>(
      'GET',
      `visit_dispatch_recipients?select=${DISPATCH_ASSIGNMENT_COLUMNS}` +
        `&confirm_token=eq.${encodeURIComponent(token)}&limit=1`,
    )) ?? [];
    assignment = assignments[0];
    if (!assignment) return { status: 'not_found' };

    const dispatches = (await supabaseRest<VisitDispatchRow[]>(
      'GET',
      `visit_dispatch?select=${VISIT_DISPATCH_COLUMNS}&id=eq.${assignment.dispatch_id}&limit=1`,
    )) ?? [];
    dispatch = dispatches[0];
  } catch (err) {
    console.error(
      'crew confirm could not read the token - the link may be perfectly good:',
      err instanceof Error ? err.message : String(err),
    );
    return { status: 'unavailable' };
  }
  // An assignment whose dispatch row is gone. Nothing to answer about, and the
  // same generic dead end an unknown token gets.
  if (!dispatch) return { status: 'not_found' };

  // The visit read is the one part of this that is allowed to fail without
  // losing the lookup - but the failure is HANDED BACK rather than folded into
  // a null that reads like an answer. A caller that could not tell the two
  // apart tells a crew member their live, booked visit is cancelled. Through
  // the same helper the retraction reads it, so neither can drift.
  const row = dispatch;
  const read = await readVisitContext(row.homeowner_id, new Date(row.visit_start));
  return {
    status: 'ok',
    found: {
      assignment,
      dispatch: row,
      visit: read.status === 'ok' ? read.visit : null,
      visitRead: read.status === 'ok' ? 'ok' : 'unavailable',
    },
  };
}

/**
 * Whether the crew was actually told the visit is off.
 *
 * `unavailable` is the one that needs saying out loud: nothing was sent because
 * the visit could not be READ, so there was nothing to name it by. A
 * cancellation built out of defaults - "the customer", no address, no work, a
 * subject trailing off after the dash - is a cancellation for a visit the crew
 * cannot identify, which is worse than none at all. So it is not sent, and the
 * admin is told to call them instead.
 */
export type RetractionOutcome = 'sent' | 'not_needed' | 'send_failed' | 'unavailable';

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
 * The recipients are read only when there is a retraction to address - and then
 * always BEFORE the delete, because the assignments cascade with the row and
 * take the addresses and the UIDs with them.
 *
 * `visit` describes what is being retracted, for the email and the .ics. Pass
 * the READ, not just its value - a visit that could not be read is not a visit
 * with nothing in it, and only the first of those must stop the send. Take it
 * from before the window was cleared where you can: once the tasks are unbooked
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
  opts: { reason: 'cancelled' | 'completed'; visit?: VisitContextRead | null; now?: Date },
): Promise<ClearDispatchResult> {
  const { reason, visit, now = new Date() } = opts;
  let dispatch: VisitDispatchRow | null = null;
  let assignments: DispatchAssignment[] = [];
  let retracting = false;
  try {
    const key = visitKey(visitStart);
    dispatch = await dispatchForVisit(homeownerId, visitStart);

    // Read ONLY when there is a retraction to address, and always BEFORE the
    // delete - the assignments cascade with the row, taking the addresses and
    // the UIDs with them. A completion retracts nothing, and neither does a
    // dispatch that never sent or a window already past, so reading their
    // recipients is a round trip per window for a value nobody looks at.
    retracting = reason === 'cancelled' && Boolean(dispatch?.dispatched_at)
      && visitStart.getTime() > now.getTime();
    if (dispatch && retracting) assignments = await assignmentsForDispatch(dispatch.id);

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
  if (retracting && dispatch && assignments.length > 0) {
    // Read here only as a fallback, for a caller that no longer holds it - and
    // a read that FAILED stops the send rather than filling it in from
    // defaults. "the customer", no address, no work and a subject trailing off
    // after the dash is a cancellation the crew cannot tie to a job, which is
    // worse than no cancellation: it is reported instead, so the admin calls
    // them rather than believing they were told.
    const described = visit ?? await readVisitContext(homeownerId, visitStart);
    if (described.status !== 'ok') {
      unretracted = assignments.map((a) => a.email);
      retraction = 'unavailable';
      console.error(
        `crew dispatch retraction NOT sent for ${visitKey(visitStart)} - the visit could not be `
          + `read (${described.status}), so nothing could name what is being cancelled. Still `
          + `holding it: ${unretracted.join(', ')}`,
      );
    } else {
      unretracted = await sendDispatchRetraction({
        homeownerId, visitStart, dispatch, assignments, visit: described.visit,
      }).catch((err) => {
        console.error(
          'crew dispatch retraction failed - the crew may still be holding the visit:',
          err instanceof Error ? err.message : String(err),
        );
        return assignments.map((a) => a.email);
      });
      retraction = unretracted.length > 0 ? 'send_failed' : 'sent';
    }
  }

  return { status: 'cleared', retraction, unretracted };
}

/**
 * The one envelope every crew calendar message rides in.
 *
 * Spelled once because the parts that are not obvious are the parts that must
 * not drift: the `campaign` shape is what the email_log audit reads and what
 * records the attachment name, and the .ics has to declare its own MIME type or
 * Gmail and Outlook offer it as a plain download instead of the "Add to
 * calendar" / RSVP card the whole METHOD:REQUEST decision exists for. The type
 * is read off the file, so an invite and the retraction that withdraws it are
 * each announced as what they actually are.
 *
 * Only `category` differs between the two callers, which is exactly why this is
 * one function taking it as an argument rather than two copies of ten lines.
 */
function sendCrewMail(args: {
  category: 'crew_dispatch' | 'crew_dispatch_cancelled';
  assignment: Pick<DispatchAssignment, 'email' | 'name'>;
  dispatchId: string;
  visitStart: Date;
  homeownerId: string;
  subject: string;
  html: string;
  text: string;
  ics: string;
}) {
  const { category, assignment, dispatchId, visitStart, homeownerId, subject, html, text, ics } = args;
  // No preferenceStream, on either message: a marketing opt-out must never be
  // able to suppress the email that tells someone where to be tomorrow, nor the
  // one that tells them not to go.
  return sendTrackedEmail({
    from: HOME_CARE_FROM,
    to: assignment.email,
    replyTo: SERVICE_REPLY_TO.join(', '),
    subject,
    html,
    text,
    category,
    toName: assignment.name,
    homeownerId,
    campaign: { visit_start: visitKey(visitStart), dispatch_id: dispatchId },
    attachments: [{ filename: 'visit.ics', content: ics, contentType: icsContentType(ics) }],
  });
}

/**
 * Tell everyone who was sent this visit that it is off, and answer with the
 * addresses that could NOT be told.
 *
 * SEQUENCE counts up from the row's own value: a client applies a CANCEL to the
 * event it holds only when the number is higher than the one it stored, so a
 * retraction reusing the invite's number can be discarded as a duplicate and
 * leave the event - and its 7:00am alarm - exactly where it was.
 *
 * The visit is REQUIRED, not optional. Its caller resolves the read and reports
 * a failed one rather than calling here, because a cancellation that cannot name
 * the customer, the address or the work is one the crew cannot act on.
 */
async function sendDispatchRetraction(args: {
  homeownerId: string;
  visitStart: Date;
  dispatch: VisitDispatchRow;
  assignments: DispatchAssignment[];
  visit: VisitContext;
}): Promise<string[]> {
  const { homeownerId, visitStart, dispatch, assignments, visit } = args;

  // Straight off the visit, which resolved a missing end through `visitEndsAt`
  // - the same helper the escalation and the confirm page read one through, so
  // a retraction cannot describe a different window than the chase did.
  const { end, customerName, address, services } = visit;
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

    const res = await sendCrewMail({
      category: 'crew_dispatch_cancelled',
      assignment,
      dispatchId: dispatch.id,
      visitStart,
      homeownerId,
      subject,
      html,
      text,
      ics,
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
  /**
   * Dropped recipients still holding a working confirm link. Empty is the
   * normal answer; anything in it can silence both chases.
   */
  stillLive: string[];
  /** Ticked recipients no dispatch was even attempted for. Empty is normal. */
  notMailed: string[];
  /**
   * Whether the send was written back onto the dispatch row. `unavailable`
   * leaves the escalation reading it as never sent - and, because a retraction
   * only goes out for a dispatch that sent, leaves a later cancellation unable
   * to take the visit off anybody's calendar.
   */
  recorded: 'ok' | 'unavailable';
  /**
   * Whether the sub reached the dispatch row. `unavailable` means the email
   * names them and the record does not - the confirm page shows no sub, and a
   * flag alert about this visit cannot say who was booked for it.
   */
  subRecorded: 'ok' | 'unavailable';
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
  // Carried out of the try so a verdict reached before a later throw is still
  // reported: somebody left with a live link is not made safe by the send
  // falling over afterwards.
  let stillLive: string[] = [];
  let notMailed: string[] = [];
  let subRecorded: 'ok' | 'unavailable' = 'ok';
  const nothing = {
    sentTo: [], stillLive: [], notMailed: [], recorded: 'ok' as const, subRecorded: 'ok' as const,
  };
  try {
    recipients = await resolveRecipients(recipientIds);
    if (recipients.length === 0) return { outcome: 'no_recipients', ...nothing };

    const ensured = await ensureVisitDispatch({ homeownerId, visitStart, subName });
    dispatch = ensured.row;
    subRecorded = ensured.subRecorded;
    if (!dispatch) {
      return { outcome: 'unavailable', ...nothing, error: 'could not create the dispatch row' };
    }

    const rows = await ensureAssignments(dispatch.id, recipients);
    ({ assignments, stillLive, notMailed } = rows);
    if (assignments.length === 0) {
      return {
        outcome: 'unavailable', sentTo: [], stillLive, notMailed, recorded: 'ok', subRecorded,
        error: 'could not create the assignment rows',
      };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('crew dispatch could not be recorded:', error);
    return { outcome: 'unavailable', sentTo: [], stillLive, notMailed, recorded: 'ok', subRecorded, error };
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

    const res = await sendCrewMail({
      category: 'crew_dispatch',
      assignment,
      dispatchId: dispatch.id,
      visitStart,
      homeownerId,
      subject,
      html,
      text,
      ics,
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
  // The sequence is persisted with the stamp, and only when something landed: a
  // number stored for a send that never happened would let the next real invite
  // tie with a copy nobody holds, or skip past one they do.
  //
  // Reported rather than swallowed. The email is out and cannot be unsent, but
  // a row that does not know it went says two wrong things: the 5pm stage
  // chases this as "nobody was ever told", and cancelling the visit retracts
  // NOTHING, because a retraction only goes out for a dispatch that sent.
  const recorded: 'ok' | 'unavailable' = sentTo.length === 0 ? 'ok' : await supabaseRest(
    'PATCH', `visit_dispatch?id=eq.${dispatch.id}`, {
      dispatched_at: new Date().toISOString(),
      ics_sequence: sequence,
      updated_at: new Date().toISOString(),
    },
  ).then(() => 'ok' as const).catch((err) => {
    console.error(
      'crew dispatch went out but could not be recorded on the visit - it reads as never sent, ' +
        'so cancelling it will not take it off their calendars:',
      err instanceof Error ? err.message : String(err),
    );
    return 'unavailable' as const;
  });

  // A send is only 'sent' when the record around it landed too. Anything else
  // here is something the admin has to act on - a live link on somebody who is
  // off the visit, a ticked person nobody wrote to, a send the row does not
  // know about, a sub the email names and the record does not - and reporting
  // those as clean is what would bury them.
  const degraded = stillLive.length > 0 || notMailed.length > 0
    || recorded === 'unavailable' || subRecorded === 'unavailable';
  const outcome: DispatchOutcome = sentTo.length === 0 || anyFailed
    ? 'send_failed'
    : degraded ? 'sent_degraded' : 'sent';
  return { outcome, sentTo, stillLive, notMailed, recorded, subRecorded };
}
