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
 * tapped, and the 5pm/6pm stages still chase the visit until somebody confirms
 * it or it is called off.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTelegramMessage, escapeTelegram } from '@/lib/notify/telegramMessage';
import {
  lookupByToken, assignmentsForDispatch, liveAssignments, type TokenLookup,
} from '@/lib/homecare/dispatch';
import { visitDateLabel, visitTimeWindow } from '@/lib/homecare/visitSchedule';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  token: z.string().trim().min(16).max(200),
  action: z.enum(['confirm', 'flag']),
  note: z.string().trim().max(1000).optional(),
});

export async function POST(request: NextRequest) {
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
  // their tap - and it cannot leave the problem unreported either, because the
  // 5pm and 6pm stages now carry this note too.
  const notified = alreadyTold ? 'duplicate' as const : await notifyFlag(found, note ?? null);
  if (notified === 'sent') {
    await recordNotified(assignment.id);
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
 * Re-asserts `status=eq.flagged` so a row the admin cleared, or a re-dispatch
 * retired, in the gap does not collect a delivery record for a flag it no
 * longer carries.
 */
async function recordNotified(assignmentId: string) {
  const stamp = new Date().toISOString();
  await supabaseRest(
    'PATCH',
    `visit_dispatch_recipients?id=eq.${assignmentId}&status=eq.flagged`,
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

/** Who flagged it, which visit, and what they typed - verbatim. */
async function notifyFlag(found: TokenLookup, note: string | null) {
  const { assignment, dispatch, visit, visitRead } = found;
  const who = assignment.name || assignment.email;
  const when = visit
    ? `${visitDateLabel(visit.start)} ${visitTimeWindow(visit.start, visit.end)}`
    : visitDateLabel(new Date(dispatch.visit_start));

  const text = [
    '🚩 <b>A visit has been flagged</b>',
    '',
    // Not "tomorrow's": a dispatch goes out when the visit is booked, which can
    // be weeks ahead, so the flag can land at any point before the day.
    `<b>${escapeTelegram(who)}</b> says something is wrong with this visit.`,
    '',
    `<b>${escapeTelegram(visit?.customerName ?? 'A customer')}</b> - ${escapeTelegram(when)}`,
    visit?.address ? `📍 ${escapeTelegram(visit.address)}` : '',
    visit?.services.length ? `🧰 ${escapeTelegram(visit.services.join(', '))}` : '',
    dispatch.sub_name ? `👷 ${escapeTelegram(dispatch.sub_name)}` : '',
    // Said out loud, the same shape siblingVerdict uses. Degrading quietly to
    // "A customer" with no address and no services reads like a thin alert
    // rather than a failed read - and when a colleague has already confirmed,
    // the escalation stays silent and this is the only message the owner gets.
    visitRead === 'unavailable'
      ? '⚠️ The visit itself could NOT be read - no customer, address or services here. Look it up.'
      : '',
    '',
    note ? `💬 ${escapeTelegram(note)}` : '💬 No note - call them.',
    '',
    'The customer still gets their reminder the night before, so this needs '
      + 'sorting or the visit calling off.',
    await siblingVerdict(found),
  ].filter(Boolean).join('\n');

  return sendTelegramMessage(text).catch(() => 'failed' as const);
}

/**
 * What the REST of the crew has said about this visit - read, never assumed.
 *
 * The escalation skips any visit somebody has confirmed, so when a colleague
 * already answered, this alert is the only message the owner will ever get
 * about the problem. It cannot be the one that says something false.
 */
async function siblingVerdict(found: TokenLookup): Promise<string> {
  const { assignment, dispatch } = found;
  const others = await assignmentsForDispatch(dispatch.id)
    .then((rows) => liveAssignments(rows).filter((a) => a.id !== assignment.id))
    .catch(() => null);

  if (!others) return '⚠️ Whether anybody else has confirmed could not be read - check the visit.';

  const confirmed = others.filter((a) => a.status === 'confirmed').map((a) => a.name || a.email);
  if (confirmed.length > 0) {
    return `${escapeTelegram(confirmed.join(', '))} ${confirmed.length > 1 ? 'have' : 'has'} `
      + 'already confirmed this visit, so the 5pm and 6pm chases stay quiet. This is the only alert you get.';
  }
  return others.length === 0
    ? 'Nobody else is on this visit. It stays unconfirmed, so 5pm and 6pm will chase it.'
    : 'Nobody has confirmed it, so 5pm and 6pm will chase it until somebody does.';
}
