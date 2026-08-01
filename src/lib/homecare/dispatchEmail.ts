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
 */
import {
  FF, INK, BODY, MUTED, ORANGE, ORANGE_DEEP, NAVY, HAIRLINE, PANEL_BG, PHONE,
  esc, brandRow, headline, homeCareEmailShell,
} from './emailShell';

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
  } = args;

  const subject = dispatchSubject({ visitDateLabel, timeWindow, address });
  const greeting = recipientName ? `${esc(recipientName)}, ` : '';

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
    `  <tr><td class="px" style="padding:20px 40px 0 40px;font-family:${FF};font-size:15px;line-height:23px;mso-line-height-rule:exactly;color:${BODY}">${greeting}confirm once you have spoken to the sub. <strong style="color:${INK}">The customer gets their reminder at 7:30pm tonight either way</strong>, so if something is wrong we need to know before then.</td></tr>`,
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
        <strong style="color:${INK}">Save the calendar invite attached.</strong> It carries two reminders: one at 7:30pm tonight to confirm, and one at <strong style="color:${INK}">7:00am tomorrow to text ${esc(customerName)} when you are on the way</strong>${customerPhone ? ` - ${esc(customerPhone)}` : ''}. We told them in writing that we would text, so that one matters.
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
    'Confirm once you have spoken to the sub. The customer gets their reminder',
    'at 7:30pm tonight either way, so if something is wrong we need to know first.',
    '',
    `Confirm or flag a problem: ${confirmUrl}`,
    `Add to Google Calendar:    ${calendarUrl}`,
    '',
    `Save the attached calendar invite - it reminds you at 7:30pm tonight to confirm,`,
    `and at 7:00am tomorrow to text ${customerName} when you are on the way.`,
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
  const { recipientName, customerName, address, services, visitDateLabel, timeWindow } = args;

  const subject = cancelledSubject({ visitDateLabel, timeWindow, address });
  const greeting = recipientName ? `${esc(recipientName)}, this` : 'This';

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
    `  <tr><td class="px" style="padding:20px 40px 0 40px;font-family:${FF};font-size:15px;line-height:23px;mso-line-height-rule:exactly;color:${BODY}">${greeting} visit is <strong style="color:${INK}">off</strong> - you are not going. <strong style="color:${INK}">Do not text ${esc(customerName)} about it</strong>; the reminder attached to the original invite does not know the visit was cancelled.</td></tr>`,
    `  <tr><td class="px" style="padding:22px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${PANEL_BG};border-radius:12px">
      <tr><td style="padding:16px 18px;font-family:${FF};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED}">
        <strong style="color:${INK}">Open the attached calendar file</strong> to take the visit off your calendar. Most phones remove it for you; if yours does not, delete the event by hand so its 7:00am reminder cannot fire.
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
    'This visit is off - you are not going. Do not text the customer about it:',
    'the reminder on the original invite does not know the visit was cancelled.',
    '',
    'Open the attached calendar file to take it off your calendar. If your phone',
    'does not remove it for you, delete the event by hand so the 7:00am reminder',
    'cannot fire.',
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
