/**
 * The two Telegram alerts crew dispatch sends, as pure builders.
 *
 * Both were assembled inline in their routes, in the middle of the reads and
 * writes around them - and they are the two messages in this feature with the
 * most conditional logic in them: whether the visit reads as dispatched, whether
 * that means "nobody was told" or "the write-back failed", whether a flag note
 * is present, what the rest of the crew has said, and which of the later chases
 * can still run. Everything else that speaks to a human here already has a
 * builder that can be rendered and asserted without sending - `buildDispatchEmail`,
 * `buildDispatchCancelledEmail`, `buildIcs` - and these two could only be pinned
 * by grepping route source, which is how the "no dispatch was ever sent" branch
 * came to say something untrue with nothing objecting.
 *
 * Everything interpolated goes through `escapeTelegram`, because these render in
 * Telegram's HTML parse mode and every value in them is somebody's typed input:
 * an address, a customer name, a free-text flag note.
 *
 * NOTHING here promises a chase it has not checked. A sentence saying the 5pm
 * and 6pm stages will pick this up is conditioned on `chasesAhead`, which knows
 * the escalation reads tomorrow's window only - so a same-day flag, which is the
 * case a re-flag after a confirmation exists for, says what is actually true:
 * this alert is all there is.
 */
import { escapeTelegram } from '@/lib/notify/telegramMessage';
import type { ChaseStage } from './visitSchedule';

/**
 * What is still coming for this visit, said in one sentence.
 *
 * `[]` is the one that had to be written down: with nothing ahead, the message
 * carrying this line is the last thing anybody will hear about the visit, and
 * the reader has to know that rather than wait for a chase that is not coming.
 */
export function chaseSentence(ahead: ChaseStage[]): string {
  if (ahead.length === 0) {
    return 'Nothing else will chase this visit - no stage is left to run, so this alert is all you get.';
  }
  if (ahead.length === 2) return '5pm and 6pm will chase it until somebody does.';
  return ahead[0] === 'nudge'
    ? '5pm will chase it.'
    : '6pm is the last chase before the customer is told at 7:30pm.';
}

/** What one other person on the visit has answered. */
export interface SiblingAnswer {
  name: string | null;
  email: string;
  status: string;
}

/**
 * What the REST of the crew has said about this visit - read, never assumed.
 *
 * The escalation skips any visit somebody has confirmed, so when a colleague has
 * already answered, the alert carrying this line is the only message the owner
 * will ever get about the problem. It cannot be the one that says something
 * false - which is why a read that failed says so rather than guessing either
 * way, and why the chase promise is conditioned rather than tacked on.
 */
export function siblingVerdict(others: SiblingAnswer[] | null, ahead: ChaseStage[]): string {
  if (!others) return '⚠️ Whether anybody else has confirmed could not be read - check the visit.';

  const confirmed = others.filter((a) => a.status === 'confirmed').map((a) => a.name || a.email);
  if (confirmed.length > 0) {
    return `${escapeTelegram(confirmed.join(', '))} ${confirmed.length > 1 ? 'have' : 'has'} `
      + 'already confirmed this visit, so the 5pm and 6pm chases stay quiet. This is the only alert you get.';
  }
  const who = others.length === 0
    ? 'Nobody else is on this visit, so it stays unconfirmed.'
    : 'Nobody has confirmed it.';
  return `${who} ${chaseSentence(ahead)}`;
}

export interface FlagAlertArgs {
  /** Who tapped it. */
  who: string;
  /** The visit's date and window, already in words. */
  when: string;
  customerName: string;
  customerPhone: string | null;
  address: string | null;
  services: string[];
  subName: string | null;
  /** `unavailable` is said out loud - it is not a thin visit, it is an unread one. */
  visitRead: 'ok' | 'unavailable';
  note: string | null;
  /** What the rest of the crew has said, from `siblingVerdict`. */
  verdict: string;
  /** Whether the customer still has to be told we are coming. */
  customerReminderAhead: boolean;
}

/** Who flagged it, which visit, and what they typed - verbatim. */
export function flagAlertMessage(args: FlagAlertArgs): string {
  return [
    '🚩 <b>A visit has been flagged</b>',
    '',
    // Not "tomorrow's": a dispatch goes out when the visit is booked, which can
    // be weeks ahead, so the flag can land at any point before the day.
    `<b>${escapeTelegram(args.who)}</b> says something is wrong with this visit.`,
    '',
    `<b>${escapeTelegram(args.customerName)}</b> - ${escapeTelegram(args.when)}`,
    args.address ? `📍 ${escapeTelegram(args.address)}` : '',
    args.services.length ? `🧰 ${escapeTelegram(args.services.join(', '))}` : '',
    // The number to ring when the answer is "call the customer", which is what
    // it usually is once no chase is left to carry the problem forward.
    args.customerPhone ? `📱 <code>${escapeTelegram(args.customerPhone)}</code>` : '',
    args.subName ? `👷 ${escapeTelegram(args.subName)}` : '',
    // Said out loud, the same shape the verdict uses. Degrading quietly to "A
    // customer" with no address and no services reads like a thin alert rather
    // than a failed read - and when a colleague has already confirmed, the
    // escalation stays silent and this is the only message the owner gets.
    args.visitRead === 'unavailable'
      ? '⚠️ The visit itself could NOT be read - no customer, address or services here. Look it up.'
      : '',
    '',
    args.note ? `💬 ${escapeTelegram(args.note)}` : '💬 No note - call them.',
    '',
    // Conditioned, because it is a claim about the future: for a visit today the
    // customer was told last night, and telling the owner a deadline has not
    // passed yet is what makes them wait instead of ring.
    args.customerReminderAhead
      ? 'The customer still gets their reminder the night before, so this needs sorting or the '
        + 'visit calling off.'
      : 'The customer has ALREADY been told we are coming, so this needs sorting or calling off now.',
    args.verdict,
  ].filter(Boolean).join('\n');
}

export interface EscalationMessageArgs {
  stage: ChaseStage;
  customer: string;
  /** The visit's date and window, already in words. */
  label: string;
  address: string;
  services: string[];
  phone: string | null;
  /** Whether the dispatch row records a send. */
  dispatched: boolean;
  /** Everybody still on the visit, by name. */
  sentTo: string[];
  flags: { by: string; note: string | null }[];
}

/** The 5pm/6pm chase: what is unconfirmed, and how bad the silence is. */
export function escalationMessage(args: EscalationMessageArgs): string {
  const sentTo = args.sentTo.join(', ');
  // Carried into the message rather than left as a status: "somebody said
  // something is wrong" and "the sub cancelled" call for different moves, and
  // only one of them is written down anywhere.
  const flagLines = args.flags.map((f) =>
    `⚠️ <b>${escapeTelegram(f.by)} flagged a problem</b>` +
    `${f.note ? `: ${escapeTelegram(f.note)}` : ' (no note).'}`);

  // The flag note is the highest-signal thing in this message and is never
  // traded away for one of the other lines: "somebody said the sub cancelled" is
  // what the reader has to act on, whatever else is also true of the row.
  //
  // And a row that does not read as dispatched is two different events. No
  // assignments means nobody was ever told. Assignments with no `dispatched_at`
  // means the email went out and the write-back failed (`recorded:
  // 'unavailable'`) - stating flatly that nobody was told would send the owner
  // chasing people who already have the visit.
  const dispatchLine = !args.dispatched
    ? args.sentTo.length > 0
      ? `⚠️ <b>This visit does not read as dispatched</b> - it was sent to ${escapeTelegram(sentTo)}, `
        + 'but the record does not show it. Either they were never told or the send could not be '
        + 'written down. Check with them.'
      : '⚠️ <b>No dispatch was ever sent for this visit</b> - nobody has been told to go.'
    : flagLines.length > 0
      ? ''
      : `Sent to ${escapeTelegram(sentTo || 'the crew')}, no answer yet.`;

  return [
    args.stage === 'escalate'
      ? '🔴 <b>Still unconfirmed</b>'
      : '🟠 <b>Nobody has confirmed tomorrow\'s visit</b>',
    '',
    `<b>${escapeTelegram(args.customer)}</b> - ${escapeTelegram(args.label)}`,
    args.address ? `📍 ${escapeTelegram(args.address)}` : '',
    `🧰 ${escapeTelegram(args.services.join(', '))}`,
    args.phone ? `📱 <code>${escapeTelegram(args.phone)}</code>` : '',
    '',
    dispatchLine,
    ...flagLines,
    args.stage === 'escalate'
      ? 'The customer is told we are coming at 7:30pm - about 90 minutes from now.'
      : 'The customer is told we are coming at 7:30pm tonight.',
  ].filter(Boolean).join('\n');
}
