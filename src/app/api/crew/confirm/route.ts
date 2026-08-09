/**
 * POST /api/crew/confirm - a crew member confirms a visit, or flags a problem.
 *
 * Public by design: auth is the token, which is random, per (dispatch,
 * recipient), and only ever sent to that one person's inbox. Requiring a login
 * would defeat the point - this has to work from a phone lock screen at 5pm.
 *
 * POST ONLY, and that is the whole reason this route exists separately from the
 * page. Mail scanners, link-preview bots and Gmail's own image proxy fetch every
 * URL in an email; a GET that confirmed would mark visits confirmed that no
 * human has looked at, and the 5pm escalation would then never fire for exactly
 * the visits it exists to catch. The same rule the Home Care unsubscribe route
 * already follows.
 *
 * A FLAG TELLS SOMEBODY, IMMEDIATELY. The note is the whole value of that
 * button - "sub cancelled" and "van is in the shop" are different problems - and
 * writing it to a table nothing reads would make flagging strictly worse than
 * ignoring the email. So it goes to the operations Telegram chat as it is
 * tapped, and any 5pm/6pm stage still ahead of the visit keeps chasing it until
 * somebody confirms it or it is called off.
 *
 * THAT SECOND HALF IS NOT ALWAYS TRUE, and the alert says which it is. The
 * escalation reads tomorrow's window only, so a flag raised on the day - the
 * case a confirmed person re-flagging exists for - has no chase behind it at
 * all, and this message is everything the owner will hear about the problem.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTelegramMessage } from '@/lib/notify/telegramMessage';
import {
  lookupByToken, assignmentsForDispatch, liveAssignments, type TokenLookup,
} from '@/lib/homecare/dispatch';
import { flagAlertMessage, siblingVerdict } from '@/lib/homecare/dispatchAlerts';
import { readCustomerReminder } from '@/lib/homecare/serviceScheduling';
import { visitDateLabel, visitTimeWindow, chasesAhead } from '@/lib/homecare/visitSchedule';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  token: z.string().trim().min(16).max(200),
  action: z.enum(['confirm', 'flag']),
  note: z.string().trim().max(1000).optional(),
});

/** Generous for a crew member retrying on bad signal; hostile to guessing. */
const CONFIRM_RATE_LIMIT = 20;
const CONFIRM_RATE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  // CM-08 class: this route was public AND unthrottled, by an explicit comment.
  // The token is genuinely the credential, and it has real entropy - but
  // nothing bounded how fast someone could guess at it, and a hit PATCHes
  // dispatch state and fires a Telegram message. A ceiling costs a crew member
  // nothing (they confirm once, occasionally retrying on bad signal) and takes
  // unbounded guessing off the table.
  //
  // failClosed: a dropped confirm is recoverable - the crew member taps again,
  // and the owner is chasing them anyway - whereas unbounded guessing during a
  // database incident is not.
  const rl = await checkRateLimit(
    `crew-confirm:${getClientIp(request)}`,
    CONFIRM_RATE_LIMIT,
    CONFIRM_RATE_WINDOW_MS,
    { failClosed: true },
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Give it a moment and tap the link again.' },
      { status: 429 },
    );
  }

  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { token, action, note } = parsed.data;

  // The whole visit, not just the assignment row: a flag has to name what is
  // wrong AND which job, and the alert is worthless if the owner has to go
  // looking up which customer this was.
  const lookup = await lookupByToken(token);

  // A READ that failed, never an answer about the token. The detail stays in
  // the logs: this endpoint is public and the thrown message carries the table
  // name, the token filter and PostgREST's own error body - schema detail
  // nobody outside needs. Same answer the Home Care unsubscribe route gives.
  if (lookup.status === 'unavailable') {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // Deliberately the same answer for an unknown token and a malformed one: this
  // endpoint is public, and telling the difference would let anyone enumerate
  // live tokens.
  if (lookup.status === 'not_found') {
    return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
  }

  const found: TokenLookup = lookup.found;
  const { assignment } = found;

  // Taken OFF this visit - un-ticked on the picker and the window re-dispatched.
  // The link is dead, and says so plainly rather than falling back to the
  // generic "not valid": this person may be acting on the 7:00am alarm still
  // sitting on their calendar, and the one thing they must learn before they
  // text the customer is that the visit is not theirs. Answering would be
  // worse - it would satisfy the escalation for people who have not answered.
  if (assignment.status === 'retired') return retiredAnswer();

  // Only the TRANSITION into a flag alerts, judged against the row as it was
  // BEFORE the PATCH below. This route is public and unthrottled - the token
  // travels in an email that can be forwarded - so alerting on every POST lets
  // one link drive unlimited messages into the operations chat, and an honest
  // double-tap tells the owner the same thing twice. A changed note is a new
  // thing to say and does alert.
  //
  // `notified_at` is the other half, and the half that makes this safe: the
  // guard suppresses an alert only when a previous one for this exact note is
  // RECORDED as delivered. Keyed on the flag's existence alone it dedupes
  // ATTEMPTS, so the realistic phone-at-a-job-site sequence - first tap writes
  // the flag, Telegram fails, the response is lost on a bad signal, they tap
  // again - answered 'duplicate' having told nobody anything, and the screen
  // read that as "the office has it".
  const alreadyTold = action === 'flag'
    && assignment.status === 'flagged'
    && (assignment.note ?? null) === (note ?? null)
    && assignment.notified_at !== null;

  const now = new Date().toISOString();
  let updated: { id: string }[];
  try {
    updated = (await supabaseRest<{ id: string }[]>(
      'PATCH',
      // The retired check above reads a snapshot; this re-asserts it at the
      // write, the same way the escalation re-asserts `is.null` when it claims
      // a stamp. An admin re-dispatching this window in the gap between the two
      // retires this row, and a filter on the id alone would write 'confirmed'
      // straight back over that - the escalation would count an answer from
      // somebody who is not going, and both chases would go quiet for a visit
      // the people actually going have never answered.
      `visit_dispatch_recipients?id=eq.${assignment.id}&status=neq.retired`,
      {
        status: action === 'confirm' ? 'confirmed' : 'flagged',
        // Stamped for a flag too. It is the record of when somebody actually
        // looked at this - which is not the same as the visit being dealt with,
        // so the escalation keeps chasing a flag until it is confirmed or off.
        confirmed_at: now,
        note: action === 'flag' ? (note ?? null) : null,
        // The delivery record belongs to the flag as it now reads, so it is
        // kept ONLY by the tap that changes nothing about it. Anything else is
        // about to attempt a fresh alert, and a stamp left standing from an
        // older note would let a send that fails read as one that landed.
        notified_at: alreadyTold ? assignment.notified_at : null,
        updated_at: now,
      },
    )) ?? [];
  } catch (err) {
    console.error('crew confirm failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // Nothing matched, and the row was there to read a moment ago: it was retired
  // underneath us. The same answer the snapshot check gives, because it is the
  // same event - and because reporting a write that changed nothing as
  // 'confirmed' would leave this person believing they are on a visit they have
  // been taken off, with the 7:00am "text the customer" alarm still on their
  // phone.
  if (updated.length === 0) return retiredAnswer();

  if (action === 'confirm') return NextResponse.json({ status: 'confirmed' });

  // The flag is already recorded, so a Telegram outage cannot cost the crew
  // their tap - and where a chase is still ahead, the 5pm and 6pm stages carry
  // this note too. Where none is, the alert says so rather than implying one.
  const notified = alreadyTold ? 'duplicate' as const : await notifyFlag(found, note ?? null);
  if (notified === 'sent') {
    await recordNotified(assignment.id, now);
  } else if (notified !== 'duplicate') {
    console.error(
      `crew flag could not be Telegrammed (${notified}) for assignment ${assignment.id}. ` +
        'The escalation still carries it, and the crew member is told to call.',
    );
  }

  return NextResponse.json({ status: 'flagged', notified });
}

/**
 * Write down that this flag REACHED somebody - the one thing that earns a later
 * tap the quiet answer, and the confirm page the words "the office has it".
 *
 * Best-effort and reported only to the logs: the alert is out and cannot be
 * unsent, and the screen this tap is answering already says so truthfully. A
 * stamp that did not land costs one duplicate alert on a re-tap and an
 * over-cautious "call the office" on a re-open, which is the direction this
 * whole feature errs in on purpose.
 *
 * Stamps the row THIS request wrote, or nothing: `updated_at=eq.<wroteAt>` is a
 * compare-and-swap against the value the PATCH above set, so any write that
 * landed in between - a note corrected on a second tap, an admin clearing the
 * flag, a re-dispatch retiring the row - takes the stamp off the table rather
 * than letting it settle onto a flag it does not describe.
 *
 * The corrected-note case is the one that bites, and it is the same phone at the
 * same job site: tap one types "sub cancelled" and its response is lost on a bad
 * signal, so the note field is still open and still populated; they change it to
 * "van broken" and tap again, and that send fails, so the screen correctly says
 * nobody was told. Tap one's Telegram - six seconds of timeout behind it - then
 * returns 'sent'. Keyed on the id and the status alone, its stamp lands on a row
 * now reading "van broken", and the next tap of that note is answered
 * 'duplicate': the note that actually describes the problem never reaches
 * anybody, and the screen says the office has it. A changed note is new
 * information and must always get through.
 *
 * `status=eq.flagged` stays alongside it: an admin who cleared the flag without
 * touching `updated_at` must not collect a delivery record either.
 */
async function recordNotified(assignmentId: string, wroteAt: string) {
  const stamp = new Date().toISOString();
  await supabaseRest(
    'PATCH',
    `visit_dispatch_recipients?id=eq.${assignmentId}&status=eq.flagged&updated_at=eq.${wroteAt}`,
    { notified_at: stamp, updated_at: stamp },
  ).catch((err) => console.error(
    `crew flag was Telegrammed but could not be recorded for assignment ${assignmentId} - ` +
      'a repeat tap will alert again, and re-opening the link will tell them to call:',
    err instanceof Error ? err.message : String(err),
  ));
}

/**
 * Taken OFF this visit - reached from both the read and the write, because a
 * re-dispatch between them is the same event arriving a moment later.
 */
function retiredAnswer() {
  return NextResponse.json({
    status: 'retired',
    error: 'You are no longer on this visit - there is nothing to confirm.',
  }, { status: 410 });
}

/**
 * Who flagged it, which visit, and what they typed - verbatim.
 *
 * The reads happen here; the message itself is built by `flagAlertMessage`, so
 * what the owner is told can be rendered and asserted without a Telegram token.
 *
 * The one thing this alert must never do is promise a chase that is not coming,
 * and the case it gets wrong is the case re-flagging a confirmed visit exists
 * for: the sub falls through at 6am, so the visit is TODAY, and the escalation
 * reads tomorrow's window only. Both stages ran last night. Nothing is left, and
 * this message is all the owner gets - so `chasesAhead` decides the sentence.
 */
async function notifyFlag(found: TokenLookup, note: string | null) {
  const { assignment, dispatch, visit, visitRead } = found;
  const visitStart = visit?.start ?? new Date(dispatch.visit_start);
  const now = new Date();

  const others = await assignmentsForDispatch(dispatch.id)
    .then((rows) => liveAssignments(rows).filter((a) => a.id !== assignment.id))
    .catch(() => null);

  // READ, not worked out from the time of day. A same-day booking is past the
  // covering run, so `requeueVisitReminder` answered 'skipped' and no reminder
  // row exists - and the clock alone would tell the owner the customer already
  // knows we are coming when nothing has ever told them. Without the visit
  // there is no address to find the row by, which is its own answer.
  const customerReminder = visit
    ? await readCustomerReminder(visit.customerEmail, visitStart, now)
    : 'unavailable' as const;

  const text = flagAlertMessage({
    who: assignment.name || assignment.email,
    when: visit
      ? `${visitDateLabel(visit.start)} ${visitTimeWindow(visit.start, visit.end)}`
      : visitDateLabel(visitStart),
    customerName: visit?.customerName ?? 'A customer',
    customerPhone: visit?.customerPhone ?? null,
    address: visit?.address || null,
    services: visit?.services ?? [],
    subName: dispatch.sub_name,
    visitRead,
    note,
    verdict: siblingVerdict(others, chasesAhead({
      visitStart,
      now,
      nudgedAt: dispatch.nudged_at,
      escalatedAt: dispatch.escalated_at,
    })),
    customerReminder,
  });

  return sendTelegramMessage(text).catch(() => 'failed' as const);
}
