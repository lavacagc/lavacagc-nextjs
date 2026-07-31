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

  let found: TokenLookup | null;
  try {
    // The whole visit, not just the assignment row: a flag has to name what is
    // wrong AND which job, and the alert is worthless if the owner has to go
    // looking up which customer this was.
    found = await lookupByToken(token);
  } catch (err) {
    // The detail stays in the logs. This endpoint is public and the thrown
    // message carries the table name, the token filter and PostgREST's own
    // error body - schema detail nobody outside needs. Same answer the Home
    // Care unsubscribe route gives.
    console.error('crew confirm lookup failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // Deliberately the same answer for an unknown token and a malformed one: this
  // endpoint is public, and telling the difference would let anyone enumerate
  // live tokens.
  if (!found) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });

  const { assignment } = found;

  // Taken OFF this visit - un-ticked on the picker and the window re-dispatched.
  // The link is dead, and says so plainly rather than falling back to the
  // generic "not valid": this person may be acting on the 7:00am alarm still
  // sitting on their calendar, and the one thing they must learn before they
  // text the customer is that the visit is not theirs. Answering would be
  // worse - it would satisfy the escalation for people who have not answered.
  if (assignment.status === 'retired') {
    return NextResponse.json({
      status: 'retired',
      error: 'You are no longer on this visit - there is nothing to confirm.',
    }, { status: 410 });
  }

  const now = new Date().toISOString();
  try {
    await supabaseRest('PATCH', `visit_dispatch_recipients?id=eq.${assignment.id}`, {
      status: action === 'confirm' ? 'confirmed' : 'flagged',
      // Stamped for a flag too. It is the record of when somebody actually
      // looked at this - which is not the same as the visit being dealt with,
      // so the escalation keeps chasing a flag until it is confirmed or off.
      confirmed_at: now,
      note: action === 'flag' ? (note ?? null) : null,
      updated_at: now,
    });
  } catch (err) {
    console.error('crew confirm failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  if (action === 'confirm') return NextResponse.json({ status: 'confirmed' });

  // Only the TRANSITION into a flag alerts, judged against the row as it was
  // before the PATCH above. This route is public and unthrottled - the token
  // travels in an email that can be forwarded - so alerting on every POST lets
  // one link drive unlimited messages into the operations chat, and an honest
  // double-tap tells the owner the same thing twice. A changed note is a new
  // thing to say and does alert.
  const repeat = assignment.status === 'flagged' && (assignment.note ?? null) === (note ?? null);

  // The flag is already recorded, so a Telegram outage cannot cost the crew
  // their tap - and it cannot leave the problem unreported either, because the
  // 5pm and 6pm stages now carry this note too.
  const notified = repeat ? 'duplicate' as const : await notifyFlag(found, note ?? null);
  if (notified !== 'sent' && notified !== 'duplicate') {
    console.error(
      `crew flag could not be Telegrammed (${notified}) for assignment ${assignment.id}. ` +
        'The escalation still carries it.',
    );
  }

  return NextResponse.json({ status: 'flagged', notified });
}

/** Who flagged it, which visit, and what they typed - verbatim. */
async function notifyFlag(found: TokenLookup, note: string | null) {
  const { assignment, dispatch, visit } = found;
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
