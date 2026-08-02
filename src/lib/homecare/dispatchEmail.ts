/**
 * La Vaca Home Care - the crew dispatch email.
 *
 * Sent to whoever is going, at the moment a visit is booked. It is the only
 * thing in the system that tells the people doing the work that there is work.
 *
 * INTERNAL mail, and shaped accordingly:
 *
 *  - No unsubscribe link and no postal address. CAN-SPAM governs commercial
 *    messages to the public; a work assignment to your own staff is neither, and
 *    a "stop receiving these" link on the email that tells someone where to be
 *    tomorrow would be an invitation to break the schedule. Every customer-facing
 *    Home Care email still carries both - see emailShell's `footer`.
 *  - No `preferenceStream`. A marketing opt-out must not be able to suppress a
 *    dispatch.
 *
 * The two one-tap calendar routes both live here: the .ics rides as an
 * attachment (the caller passes it to sendTrackedEmail) and the Google Calendar
 * template link is rendered in the body. See `googleCalendarUrl` in ics.ts for
 * why both, and why a bare link to a hosted .ics is not enough on its own.
 *
 * NOTHING here states a deadline it has not checked. Every sentence naming a
 * night, a morning or a reminder is derived from the visit's own start and from
 * what the booking actually managed to queue - "tonight" is true for exactly one
 * of the days a visit can be booked on, and a dispatch goes out the moment it is
 * booked. Each of those sentences is built ONCE and rendered into both the HTML
 * and the text part, because a text part that drifts is the same bug twice.
 */
import {
  FF, INK, BODY, MUTED, ORANGE, ORANGE_DEEP, NAVY, HAIRLINE, PANEL_BG, PHONE,
  esc, brandRow, headline, homeCareEmailShell,
} from './emailShell';
import {
  customerReminderWhen, confirmAlarmAhead, morningAlarmAhead, morningAlarmWhen,
} from './visitSchedule';
import type { ReminderOutcome } from './serviceScheduling';

/** The caps prefix the owner asked for, to make a dispatch unmissable. */
export const ACTION_PREFIX = '[ACTION REQUIRED]';

/** Same caps convention, so a retraction is as unmissable as the dispatch was. */
export const CANCELLED_PREFIX = '[CANCELLED]';

export interface DispatchEmailArgs {
  /** Who the email is addressed to, e.g. "Veronica". */
  recipientName?: string | null;
  customerName: string;
  customerPhone?: string | null;
  address: string;
  services: string[];
  /** e.g. "Tuesday, August 5". */
  visitDateLabel: string;
  /** e.g. "8:00 - 11:00am". */
  timeWindow: string;
  /** Free text: who we are subbing this to, if anyone. */
  subName?: string | null;
  confirmUrl: string;
  /** Google Calendar template link - see googleCalendarUrl. */
  calendarUrl: string;
  /**
   * The visit's own start, and when this email is being written.
   *
   * Every "tonight" and "tomorrow" below is derived from these two rather than
   * assumed. A dispatch goes out the MOMENT a visit is booked, which is
   * routinely days or weeks ahead, so the unconditional wording was true for
   * exactly one of those days - and the .ics attached to this same email sets
   * both its alarms off the visit's own date, so the body contradicted its own
   * attachment.
   */
  visitStart: Date;
  now: Date;
  /**
   * What actually happened to the customer's night-before reminder, from
   * `requeueVisitReminder`.
   *
   * The booking route holds this verdict BEFORE it sends the dispatch, and the
   * email asserted flatly that the customer gets their reminder either way. A
   * same-day or late booking answers 'skipped' - the covering run has already
   * fired - and a queue write that failed answers 'unavailable'. In both, nobody
   * is telling the customer anything, and the crew are the only people who can.
   */
  customerReminder: ReminderOutcome;
}

/**
 * `[ACTION REQUIRED] Tue 5 Aug, 8-11am - 14 Maple Ave`
 *
 * The detail after the prefix is not decoration. Gmail threads messages by
 * subject, so a bare `[ACTION REQUIRED]` on every dispatch would collapse five
 * different visits into one conversation and bury four of them. Varying the tail
 * keeps them separate and makes a visit findable by searching its date or street.
 *
 * Caps stay on the prefix alone: an all-caps subject line is a mild spam signal,
 * which is a low risk on lavacagc.com-to-lavacagc.com mail but no reason to
 * spend goodwill.
 */
export function dispatchSubject(args: VisitSubjectArgs): string {
  return visitSubject(ACTION_PREFIX, args);
}

/** `[CANCELLED] Tue 5 Aug, 8-11am - 14 Maple Ave` - the dispatch subject's twin. */
export function cancelledSubject(args: VisitSubjectArgs): string {
  return visitSubject(CANCELLED_PREFIX, args);
}

interface VisitSubjectArgs {
  visitDateLabel: string;
  timeWindow: string;
  address: string;
}

/**
 * The shape both subjects share, spelled once because it MUST NOT drift.
 *
 * Gmail threads on subject, and the retraction is meant to land in the same
 * conversation as the invite it withdraws. Two copies of the street rule is two
 * chances for one of them to change - and a `[CANCELLED]` that says "14 Maple
 * Ave, West Orange, NJ" where the invite said "14 Maple Ave" is a second
 * conversation, sitting where nobody is looking for it.
 */
function visitSubject(prefix: string, args: VisitSubjectArgs): string {
  // Just the street part - the full address makes the subject too long to read
  // in a list, and the town is the same for nearly every job.
  const street = args.address.split(',')[0]?.trim() || args.address;
  return `${prefix} ${args.visitDateLabel}, ${args.timeWindow} - ${street}`;
}

function kv(label: string, value: string): string {
  return `<tr>
    <td valign="top" style="padding:9px 0;border-bottom:1px solid ${HAIRLINE};font-family:${FF};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED};font-weight:bold;width:96px">${esc(label)}</td>
    <td valign="top" style="padding:9px 0;border-bottom:1px solid ${HAIRLINE};font-family:${FF};font-size:14px;line-height:20px;mso-line-height-rule:exactly;color:${INK}">${value}</td>
  </tr>`;
}

export function buildDispatchEmail(args: DispatchEmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    recipientName, customerName, customerPhone, address, services,
    visitDateLabel, timeWindow, subName, confirmUrl, calendarUrl,
    visitStart, now, customerReminder,
  } = args;

  const subject = dispatchSubject({ visitDateLabel, timeWindow, address });
  const greeting = recipientName ? `${esc(recipientName)}, ` : '';

  const phoneTail = customerPhone ? ` - ${customerPhone}` : '';

  // What the customer will actually be told, and when. `queued` is the only
  // answer that earns the promise; 'skipped' and 'unavailable' both mean no
  // reminder exists, whatever the reason, and the crew are then the only route
  // the customer has.
  const notice = customerReminder === 'queued'
    ? {
      strong: `The customer gets their reminder ${customerReminderWhen(visitStart, now)} either way`,
      tail: ', so if something is wrong we need to know before then.',
    }
    : {
      strong: 'No automatic reminder is going out to the customer for this visit',
      tail: ` - text ${customerName} yourself, and tell us now if something is wrong.`,
    };

  // What the attached invite will actually do. Both alarms are absolute
  // instants on the visit's own dates, so a late booking can arrive after one or
  // both have passed - and an invite described as carrying a reminder that has
  // already gone is how somebody stops watching for it.
  const confirmAlarm = confirmAlarmAhead(visitStart, now);
  const morningAlarm = morningAlarmAhead(visitStart, now);
  const textThem = `to text ${customerName} when you are on the way`;
  const promised = customerReminder === 'queued'
    ? ' We told them in writing that we would text, so that one matters.'
    : '';
  const invite = confirmAlarm && morningAlarm
    ? {
      lead: `It carries two reminders: one ${customerReminderWhen(visitStart, now)} to confirm, and one `,
      strong: `${morningAlarmWhen(visitStart, now)} ${textThem}`,
      tail: `${phoneTail}.${promised}`,
    }
    : morningAlarm
      ? {
        lead: 'It reminds you ',
        strong: `${morningAlarmWhen(visitStart, now)} ${textThem}`,
        tail: `${phoneTail}.${promised}`,
      }
      : {
        lead: `Its reminders are set for ${visitDateLabel} and have already passed, so `,
        strong: `text ${customerName} yourself before you go`,
        tail: `${phoneTail}.`,
      };

  const rows = [
    brandRow('Dispatch'),
    // Red rather than the usual orange pill: this is the one Home Care email
    // that is asking someone to do something today.
    `  <tr><td class="px" style="padding:26px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
      <tr><td bgcolor="#FEE2E2" style="background:#FEE2E2;border-radius:9999px;padding:8px 16px;font-family:${FF};font-size:11px;line-height:14px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:0.12em;color:#991B1B;text-transform:uppercase">Action required</td></tr>
    </table>
  </td></tr>`,
    headline(esc(visitDateLabel), esc(timeWindow)),
    `  <tr><td class="px" style="padding:18px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">
      ${kv('Customer', customerPhone
        ? `${esc(customerName)} &nbsp;&middot;&nbsp; <a href="tel:${esc(customerPhone.replace(/[^\d+]/g, ''))}" style="color:${ORANGE_DEEP};text-decoration:none">${esc(customerPhone)}</a>`
        : esc(customerName))}
      ${kv('Address', esc(address))}
      ${kv('Work', services.map(esc).join('<br />'))}
      ${subName ? kv('Sub', `${esc(subName)} - confirm they are booked`) : ''}
    </table>
  </td></tr>`,
    `  <tr><td class="px" style="padding:20px 40px 0 40px;font-family:${FF};font-size:15px;line-height:23px;mso-line-height-rule:exactly;color:${BODY}">${greeting}confirm once you have spoken to the sub. <strong style="color:${INK}">${esc(notice.strong)}</strong>${esc(notice.tail)}</td></tr>`,
    // Primary action. Deliberately a link to a PAGE, not a link that confirms:
    // mail scanners and link-preview bots fetch every URL in an email, so a GET
    // that confirmed would mark visits confirmed that nobody has looked at.
    `  <tr><td class="px" align="center" style="padding:26px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">
      <tr><td align="center" bgcolor="${ORANGE}" style="background:${ORANGE};border-radius:12px;padding:16px 24px">
        <a href="${confirmUrl}" style="display:block;font-family:${FF};font-size:16px;line-height:20px;mso-line-height-rule:exactly;font-weight:bold;color:#FFFFFF;text-decoration:none">Confirm - sub is booked</a>
      </td></tr>
      <tr><td height="8" style="height:8px;line-height:8px;font-size:8px">&nbsp;</td></tr>
      <tr><td align="center" style="border:1px solid ${HAIRLINE};border-radius:12px;padding:14px 24px">
        <a href="${confirmUrl}" style="display:block;font-family:${FF};font-size:15px;line-height:20px;mso-line-height-rule:exactly;font-weight:bold;color:${INK};text-decoration:none">Something is wrong</a>
      </td></tr>
    </table>
  </td></tr>`,
    `  <tr><td class="px" align="center" style="padding:16px 40px 0 40px;font-family:${FF};font-size:14px;line-height:21px;mso-line-height-rule:exactly">
    <a href="${calendarUrl}" style="color:${ORANGE_DEEP};text-decoration:underline">Add to Google Calendar &rarr;</a>
  </td></tr>`,
    // Says what the attachment is for. Without this the 7:00am alarm arrives
    // unexplained, and the whole "we text the customer ourselves" decision
    // depends on somebody acting on it.
    `  <tr><td class="px" style="padding:22px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${PANEL_BG};border-radius:12px">
      <tr><td style="padding:16px 18px;font-family:${FF};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED}">
        <strong style="color:${INK}">Save the calendar invite attached.</strong> ${esc(invite.lead)}<strong style="color:${INK}">${esc(invite.strong)}</strong>${esc(invite.tail)}
      </td></tr>
    </table>
  </td></tr>`,
    `  <tr><td class="px" style="padding:26px 40px 32px 40px">
    <div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:1px">&nbsp;</div>
    <div style="padding-top:16px;font-family:${FF};font-size:12px;line-height:19px;mso-line-height-rule:exactly;color:#8A8A8A">
      Sent to you because you are on this visit. Reply to this email to reach Alex, or call <a href="tel:+12012124917" style="color:${ORANGE_DEEP};text-decoration:none">${PHONE}</a>.<br />
      <span style="color:${NAVY}">La Vaca General Contractors</span>
    </div>
  </td></tr>`,
  ].join('\n');

  const text = [
    `${ACTION_PREFIX} ${visitDateLabel}, ${timeWindow}`,
    '',
    `Customer: ${customerName}${customerPhone ? ` - ${customerPhone}` : ''}`,
    `Address:  ${address}`,
    `Work:     ${services.join(', ')}`,
    ...(subName ? [`Sub:      ${subName} - confirm they are booked`] : []),
    '',
    // The same two sentences the HTML renders, off the same strings.
    `Confirm once you have spoken to the sub. ${notice.strong}${notice.tail}`,
    '',
    `Confirm or flag a problem: ${confirmUrl}`,
    `Add to Google Calendar:    ${calendarUrl}`,
    '',
    `Save the calendar invite attached. ${invite.lead}${invite.strong}${invite.tail}`,
    '',
    'Sent to you because you are on this visit. Reply to reach Alex.',
    `La Vaca General Contractors · ${PHONE}`,
  ].join('\n');

  return {
    subject,
    html: homeCareEmailShell({
      preheader: `${esc(visitDateLabel)}, ${esc(timeWindow)} - ${esc(address)}. Confirm the sub.`,
      rows,
    }),
    text,
  };
}

export interface DispatchCancelledEmailArgs {
  recipientName?: string | null;
  customerName: string;
  address: string;
  services: string[];
  visitDateLabel: string;
  timeWindow: string;
  /**
   * The visit's own start, and now - because a retraction goes out for any
   * window whose START is still ahead, which includes the morning OF the visit.
   *
   * The 7:00am "text the customer when the crew is on the way" alarm has already
   * fired by then, so "delete the event so its 7:00am reminder cannot fire" is
   * advice about something that has happened - and it misses the thing that
   * actually matters in that window: they may have sent the text already.
   */
  visitStart: Date;
  now: Date;
}

/**
 * The visit is off - take it out of your calendar.
 *
 * Carries the METHOD:CANCEL .ics (the caller attaches it), which is what
 * actually removes the event on a client that honours it. The body is the
 * fallback for a client that does not, and it leads with the thing that
 * otherwise goes wrong: the invite carries a 7:00am alarm telling whoever holds
 * it to text this customer, and nobody should be texting them now.
 *
 * Internal mail, exactly like the dispatch it retracts: no unsubscribe link, no
 * postal address, and no preferenceStream on the send.
 */
export function buildDispatchCancelledEmail(args: DispatchCancelledEmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    recipientName, customerName, address, services, visitDateLabel, timeWindow,
    visitStart, now,
  } = args;

  const subject = cancelledSubject({ visitDateLabel, timeWindow, address });
  const greeting = recipientName ? `${esc(recipientName)}, this` : 'This';

  // Whether the alarm this email is chasing is still ahead of the reader. Built
  // once and rendered into both parts, like the dispatch's own two claims.
  const alarmAhead = morningAlarmAhead(visitStart, now);
  const notGoing = alarmAhead
    ? {
      strong: `Do not text ${customerName} about it`,
      tail: '; the reminder attached to the original invite does not know the visit was cancelled.',
    }
    : {
      strong: 'Your 7:00am reminder has already gone off',
      tail: ` - if you have texted ${customerName} to say you are on the way, tell them the visit is off.`,
    };
  const deleteIt = alarmAhead
    ? 'delete the event by hand so its 7:00am reminder cannot fire.'
    : 'delete the event by hand.';

  const rows = [
    brandRow('Dispatch'),
    `  <tr><td class="px" style="padding:26px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
      <tr><td bgcolor="${PANEL_BG}" style="background:${PANEL_BG};border-radius:9999px;padding:8px 16px;font-family:${FF};font-size:11px;line-height:14px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:0.12em;color:${MUTED};text-transform:uppercase">Cancelled</td></tr>
    </table>
  </td></tr>`,
    headline(esc(visitDateLabel), esc(timeWindow)),
    `  <tr><td class="px" style="padding:18px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">
      ${kv('Customer', esc(customerName))}
      ${kv('Address', esc(address))}
      ${services.length > 0 ? kv('Work', services.map(esc).join('<br />')) : ''}
    </table>
  </td></tr>`,
    `  <tr><td class="px" style="padding:20px 40px 0 40px;font-family:${FF};font-size:15px;line-height:23px;mso-line-height-rule:exactly;color:${BODY}">${greeting} visit is <strong style="color:${INK}">off</strong> - you are not going. <strong style="color:${INK}">${esc(notGoing.strong)}</strong>${esc(notGoing.tail)}</td></tr>`,
    `  <tr><td class="px" style="padding:22px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${PANEL_BG};border-radius:12px">
      <tr><td style="padding:16px 18px;font-family:${FF};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED}">
        <strong style="color:${INK}">Open the attached calendar file</strong> to take the visit off your calendar. Most phones remove it for you; if yours does not, ${esc(deleteIt)}
      </td></tr>
    </table>
  </td></tr>`,
    `  <tr><td class="px" style="padding:26px 40px 32px 40px">
    <div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:1px">&nbsp;</div>
    <div style="padding-top:16px;font-family:${FF};font-size:12px;line-height:19px;mso-line-height-rule:exactly;color:#8A8A8A">
      Sent to you because you were on this visit. Reply to this email to reach Alex, or call <a href="tel:+12012124917" style="color:${ORANGE_DEEP};text-decoration:none">${PHONE}</a>.<br />
      <span style="color:${NAVY}">La Vaca General Contractors</span>
    </div>
  </td></tr>`,
  ].join('\n');

  const text = [
    `${CANCELLED_PREFIX} ${visitDateLabel}, ${timeWindow}`,
    '',
    `Customer: ${customerName}`,
    `Address:  ${address}`,
    ...(services.length > 0 ? [`Work:     ${services.join(', ')}`] : []),
    '',
    // The same two sentences the HTML renders, off the same strings.
    `This visit is off - you are not going. ${notGoing.strong}${notGoing.tail}`,
    '',
    `Open the attached calendar file to take it off your calendar. If your phone does not remove it for you, ${deleteIt}`,
    '',
    'Sent to you because you were on this visit. Reply to reach Alex.',
    `La Vaca General Contractors · ${PHONE}`,
  ].join('\n');

  return {
    subject,
    html: homeCareEmailShell({
      preheader: `${esc(visitDateLabel)}, ${esc(timeWindow)} - ${esc(address)} is cancelled. Do not go.`,
      rows,
    }),
    text,
  };
}
