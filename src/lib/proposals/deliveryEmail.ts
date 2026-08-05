/**
 * Proposal Pod - Slice 2: the delivery email.
 *
 * Warm, personal, one job: put the client's private proposal link in their
 * hands. Sent from the warm customer-facing sender (house convention: warm
 * sends come from Alex, noreply is for machines), through sendTrackedEmail so
 * it lands in the Email Tracking audit like every other send.
 *
 * Purely transactional - the client asked for an estimate; this delivers it.
 * No marketing stream, no unsubscribe machinery, same posture as the service
 * quote emails.
 *
 * Carries the D5 booking-link slot: when NEXT_PUBLIC_BOOKING_URL is set, a
 * "book a time to talk it through" line renders; unset, the email simply
 * doesn't mention it.
 */
import {
  FF, INK, BODY, MUTED, ORANGE, ORANGE_DEEP, NAVY, HAIRLINE, PANEL_BG, PHONE,
  BUSINESS_ADDRESS, esc, brandRow, headline, homeCareEmailShell,
} from '@/lib/homecare/emailShell';

export const PROPOSAL_FROM = 'Alex from La Vaca GC <alex@email.lavaca.link>';

export interface DeliveryEmailArgs {
  clientName: string;
  /** e.g. "Your bathroom remodel". */
  proposalTitle: string;
  proposalUrl: string;
  /** D5 slot - omit and the booking line does not render. */
  bookingUrl?: string | null;
}

export function buildProposalDeliveryEmail(args: DeliveryEmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const { clientName, proposalTitle, proposalUrl, bookingUrl } = args;
  const first = clientName.split(/\s+/)[0] || clientName;
  const subject = `${first}, your proposal from La Vaca is ready`;

  const rows = [
    brandRow('Proposal'),
    headline(esc(proposalTitle)),
    `  <tr><td class="px" style="padding:18px 40px 0 40px;font-family:${FF};font-size:15.5px;line-height:24px;mso-line-height-rule:exactly;color:${BODY}">
      ${esc(first)}, your proposal is ready - priced line by line, with the choices that are yours to make marked as switches you can turn on or off. Play with it: the total updates as you go, and when it reads the way you want it, send it back to us right from the page.
    </td></tr>`,
    `  <tr><td class="px" align="center" style="padding:26px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">
      <tr><td align="center" bgcolor="${ORANGE}" style="background:${ORANGE};border-radius:12px;padding:16px 24px">
        <a href="${proposalUrl}" style="display:block;font-family:${FF};font-size:16px;line-height:20px;mso-line-height-rule:exactly;font-weight:bold;color:#FFFFFF;text-decoration:none">Open my proposal</a>
      </td></tr>
    </table>
  </td></tr>`,
    `  <tr><td class="px" style="padding:18px 40px 0 40px;font-family:${FF};font-size:13.5px;line-height:21px;mso-line-height-rule:exactly;color:${MUTED}">
      This link is private to you - anyone you share it with can see your proposal, so treat it like the document it is.
    </td></tr>`,
    ...(bookingUrl
      ? [`  <tr><td class="px" style="padding:20px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${PANEL_BG};border-radius:12px">
      <tr><td style="padding:16px 18px;font-family:${FF};font-size:13.5px;line-height:20px;mso-line-height-rule:exactly;color:${MUTED}">
        <strong style="color:${INK}">Want to talk it through?</strong> <a href="${bookingUrl}" style="color:${ORANGE_DEEP};font-weight:bold;text-decoration:underline">Book a time that suits you</a> and we&rsquo;ll walk the proposal together.
      </td></tr>
    </table>
  </td></tr>`]
      : []),
    `  <tr><td class="px" style="padding:26px 40px 32px 40px">
    <div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:1px">&nbsp;</div>
    <div style="padding-top:16px;font-family:${FF};font-size:12.5px;line-height:19px;mso-line-height-rule:exactly;color:#8A8A8A">
      Questions? Reply to this email or call <a href="tel:+12012124917" style="color:${ORANGE_DEEP};text-decoration:none">${PHONE}</a> - you&rsquo;ll get Alex, not a phone tree.<br />
      <span style="color:${NAVY}">La Vaca General Contractors</span> &nbsp;&middot;&nbsp; ${BUSINESS_ADDRESS}
    </div>
  </td></tr>`,
  ].join('\n');

  const text = [
    `${first}, your proposal from La Vaca is ready.`,
    '',
    `${proposalTitle}`,
    '',
    'Open it here (private to you):',
    proposalUrl,
    '',
    'The choices that are yours to make are marked as switches - turn them on or off and the total updates as you go. When it reads right, send it back to us from the page.',
    ...(bookingUrl ? ['', `Want to talk it through? Book a time: ${bookingUrl}`] : []),
    '',
    `Questions? Reply to this email or call ${PHONE}.`,
    '- Alex, La Vaca General Contractors',
  ].join('\n');

  return {
    subject,
    html: homeCareEmailShell({ preheader: 'Your proposal is ready - open it, play with the options, and land on your number.', rows }),
    text,
  };
}
