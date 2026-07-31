/**
 * La Vaca Home Care - service-work emails (pure, testable).
 *
 * Three emails around a one-visit service job, all on the shared `emailShell`:
 *
 *  - `buildServiceQuoteEmail`  - the lighter sibling of the project estimate
 *  - `buildVisitReminderEmail` - 7:30pm the evening before
 *  - `buildServiceCompletedEmail` - "Please let us know how our team did"
 *
 * What is deliberately absent from the quote, versus the project estimate:
 * no portal URL, no update cadence, no lifetime Schluter warranty (tile-
 * specific - it would be a false claim on a gutter clean), no five-bullet
 * "what you get" stack and no four-step QuickBooks walkthrough. A quote that
 * reads like a construction contract adds friction to a decision the customer
 * should be able to make in ten seconds.
 *
 * What the quote never does is ask for a review. It promises a 5-star finish
 * and says we'll ask how it went; the ask itself fires after the job, from
 * `buildServiceCompletedEmail`. Soliciting specifically positive reviews is
 * review-gating, which Google's policies prohibit.
 */
import {
  homeCareEmailShell,
  licenceBar,
  brandRow,
  pill,
  headline,
  intro,
  cta,
  callBlock,
  panel,
  footer,
  textFooter,
  esc,
  FF,
  INK,
  MUTED,
  PILL_BG,
  HAIRLINE,
} from './emailShell';

/**
 * Public rating claim. Kept in ONE place: an email still claiming 5.0 after the
 * rating moves is a false statement in a spot nobody thinks to check.
 */
export const GOOGLE_RATING = '5.0';

/** Service work replies go to both, not the shared info@ mailbox. */
export const SERVICE_REPLY_TO = ['alex@lavacagc.com', 'veronica@lavacagc.com'];

/**
 * Why they got the quote, and what unsubscribing from it does.
 *
 * The second sentence is not decoration. The recipient asked for a price and
 * may never have joined anything, so "Unsubscribe" beside a quote has to say
 * what it takes away - the automated mail about their inquiry - and what it
 * leaves, or the safe reading is "this cancels my quote".
 */
const QUOTE_FOOTER_REASON =
  `You're getting this because you asked La Vaca for a quote. Unsubscribing stops our follow-up ` +
  `emails about it; your quote and any scheduling still reach you.`;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "29 Aug 2026" - unambiguous for a US reader without being a bare date. */
export function formatQuoteDate(d: Date): string {
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Credibility, the light version: three true claims, no footnotes. */
function credibility(): string {
  return `  <tr><td class="px" style="padding:22px 40px 0 40px">
    <div style="border-top:1px solid ${HAIRLINE};padding-top:16px">
      <div style="font-family:${FF};font-size:11px;line-height:14px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:0.11em;color:${MUTED};text-transform:uppercase">Who's doing the work</div>
      <div style="padding-top:9px;font-family:${FF};font-size:14px;line-height:24px;mso-line-height-rule:exactly;color:${MUTED}">
        <strong style="color:${INK}">Licensed, bonded &amp; insured</strong> &nbsp;&middot;&nbsp; NJ HIC# 13VH13373800<br />
        <strong style="color:${INK}">1-year workmanship warranty</strong> on everything we touch<br />
        <strong style="color:${INK}">${GOOGLE_RATING} on Google</strong> &nbsp;&middot;&nbsp; same crew, start to finish
      </div>
      <div style="margin-top:12px;background:${PILL_BG};border-radius:9px;padding:12px 14px;font-family:${FF};font-size:14px;line-height:21px;mso-line-height-rule:exactly;color:${INK}">
        We aim for a <strong>5-star finish</strong> on every visit, however small the job. When we're done we'll ask how we did - and if anything isn't right, we come back.
      </div>
    </div>
  </td></tr>`;
}

export interface ServiceQuoteArgs {
  recipientName: string;
  /** Plain-language scope, e.g. "Gutter clearing and a dryer-vent clean". */
  scopeSummary: string;
  /** QuickBooks estimate URL. Accepting still happens there. */
  estimateUrl: string;
  /** e.g. "About 2-3 hours, one visit". */
  visitLength?: string | null;
  personalNote?: string | null;
  unsubscribeUrl: string;
  preferencesUrl?: string | null;
  /** Defaults to 30 days from `now`. */
  validUntil?: Date | null;
  now?: Date;
}

export function buildServiceQuoteEmail(args: ServiceQuoteArgs): { subject: string; html: string; text: string } {
  const {
    recipientName, scopeSummary, estimateUrl, visitLength, personalNote,
    unsubscribeUrl, preferencesUrl, now = new Date(),
  } = args;

  const first = esc(recipientName.split(' ')[0] || recipientName);
  const validUntil = args.validUntil ?? new Date(now.getTime() + 30 * DAY_MS);
  const validLabel = formatQuoteDate(validUntil);
  const scope = esc(scopeSummary);
  const length = visitLength ? esc(visitLength) : '';

  const rows = [
    licenceBar(),
    brandRow(),
    pill(['Service quote', formatQuoteDate(now)]),
    headline('Your quote is', `ready, ${first}.`),
    intro(
      `Hi ${first},`,
      `${scope}.${length ? ` ${length}.` : ''} Open the estimate to see the price and accept it - it takes two taps.`,
    ),
    ...(personalNote
      ? [panel(`<em style="color:${INK}">${esc(personalNote)}</em>`)]
      : []),
    cta('Open your estimate', estimateUrl, `Open it, then hit <strong>Accept</strong>. This quote holds until ${validLabel}.`),
    credibility(),
    callBlock('Questions before you decide?', `Call and we'll talk it through - no pressure either way.`),
    footer({
      reason: QUOTE_FOOTER_REASON,
      unsubscribeUrl,
      preferencesUrl: preferencesUrl ?? undefined,
    }),
  ].join('\n');

  const html = homeCareEmailShell({
    // Escaped: the preheader is HTML too, and scope is caller-supplied.
    preheader: `${scope} - your quote is ready. Holds until ${esc(validLabel)}.`,
    rows,
  });

  const text =
    `Hi ${recipientName.split(' ')[0] || recipientName},\n\n` +
    `${scopeSummary}.${visitLength ? ` ${visitLength}.` : ''}\n\n` +
    `Open your estimate to see the price and accept it:\n${estimateUrl}\n\n` +
    `This quote holds until ${validLabel}.\n\n` +
    (personalNote ? `${personalNote}\n\n` : '') +
    `WHO'S DOING THE WORK\nLicensed, bonded & insured · NJ HIC# 13VH13373800\n1-year workmanship warranty on everything we touch\n${GOOGLE_RATING} on Google · same crew, start to finish\n\n` +
    `We aim for a 5-star finish on every visit, however small the job. When we're done we'll ask how we did - and if anything isn't right, we come back.\n\n` +
    `Questions before you decide? Call (201) 212-4917 - 24-hour response guaranteed.\n` +
    textFooter(QUOTE_FOOTER_REASON, unsubscribeUrl, preferencesUrl ?? undefined);

  return { subject: `Your La Vaca quote - ${scopeSummary}`, html, text };
}

export interface VisitReminderArgs {
  recipientName: string;
  /** Service titles being performed. */
  services: string[];
  address: string;
  /** Human window, e.g. "8:00 - 11:00am". */
  timeWindow: string;
  /** Human date, e.g. "Tue 5 Aug". */
  visitDateLabel: string;
  portalUrl: string;
  unsubscribeUrl: string;
  preferencesUrl?: string | null;
}

/**
 * Sent 7:30pm the evening before. The "we'll text you" line is load-bearing:
 * it sets the expectation so the owner's manual text lands as promised rather
 * than out of the blue, which is what let us skip an SMS integration entirely.
 */
export function buildVisitReminderEmail(args: VisitReminderArgs): { subject: string; html: string; text: string } {
  const { recipientName, services, address, timeWindow, visitDateLabel, portalUrl, unsubscribeUrl, preferencesUrl } = args;
  const first = esc(recipientName.split(' ')[0] || recipientName);
  const svc = services.map(esc).join(' &middot; ');

  const rows = [
    licenceBar(),
    brandRow(),
    pill(['Visit reminder', esc(visitDateLabel)]),
    headline(`We're coming`, 'tomorrow.'),
    intro(
      `Hi ${first},`,
      `We'll be at <strong style="color:${INK}">${esc(address)}</strong> tomorrow, <strong style="color:${INK}">${esc(visitDateLabel)}, ${esc(timeWindow)}</strong>, for ${svc}.`,
    ),
    panel(
      `<strong style="color:${INK}">We'll text you when we're on our way</strong>, so you'll know roughly when to expect the knock. You don't need to be home.`,
    ),
    cta('See it on my plan', portalUrl, 'Add it to your calendar or change the time from there.'),
    callBlock('Need to move it?', `Reply to this email or give us a call - no problem at all.`),
    footer({
      reason: `You're getting this because you have a La Vaca visit scheduled.`,
      unsubscribeUrl,
      preferencesUrl: preferencesUrl ?? undefined,
    }),
  ].join('\n');

  const html = homeCareEmailShell({
    preheader: `${esc(visitDateLabel)}, ${esc(timeWindow)} - we'll text you when we're on our way.`,
    rows,
  });

  const text =
    `Hi ${recipientName.split(' ')[0] || recipientName},\n\n` +
    `We'll be at ${address} tomorrow, ${visitDateLabel}, ${timeWindow}, for ${services.join(', ')}.\n\n` +
    `We'll text you when we're on our way, so you'll know roughly when to expect the knock. You don't need to be home.\n\n` +
    `See it on your plan (and add it to your calendar): ${portalUrl}\n\n` +
    `Need to move it? Reply to this email or call (201) 212-4917.\n` +
    textFooter(`You're getting this because you have a La Vaca visit scheduled.`, unsubscribeUrl, preferencesUrl ?? undefined);

  return { subject: `We're coming tomorrow, ${visitDateLabel} (${timeWindow})`, html, text };
}

export interface ServiceCompletedArgs {
  recipientName: string;
  services: string[];
  feedbackUrl: string;
  unsubscribeUrl: string;
  preferencesUrl?: string | null;
}

/**
 * Fired by mark-complete from the admin.
 *
 * Copy order matters: "if anything isn't right, tell us and we'll come back"
 * comes BEFORE any mention of a public word. That keeps it a genuine feedback
 * request rather than review-gating, and it is the better business move - you
 * hear about a problem before Google does.
 */
export function buildServiceCompletedEmail(args: ServiceCompletedArgs): { subject: string; html: string; text: string } {
  const { recipientName, services, feedbackUrl, unsubscribeUrl, preferencesUrl } = args;
  const first = esc(recipientName.split(' ')[0] || recipientName);
  const svc = services.map(esc).join(' and ');

  const rows = [
    licenceBar(),
    brandRow(),
    pill(['Service complete']),
    headline('Please let us know', 'how our team did.'),
    intro(
      `Hi ${first},`,
      `We finished ${svc} at your place. <strong style="color:${INK}">If anything isn't right, tell us and we'll come back</strong> - that's the whole point of asking. And if it went well, a quick word helps other Northern NJ homeowners find us.`,
    ),
    cta('Tell us how it went', feedbackUrl, 'Takes less than a minute.'),
    callBlock('Rather just tell us directly?', `Call and you'll get a person, not a queue.`),
    footer({
      reason: `You're getting this because La Vaca completed work at your home.`,
      unsubscribeUrl,
      preferencesUrl: preferencesUrl ?? undefined,
    }),
  ].join('\n');

  const html = homeCareEmailShell({
    preheader: `We finished up - tell us how our team did, and we'll fix anything that isn't right.`,
    rows,
  });

  const text =
    `Hi ${recipientName.split(' ')[0] || recipientName},\n\n` +
    `We finished ${services.join(' and ')} at your place.\n\n` +
    `If anything isn't right, tell us and we'll come back - that's the whole point of asking. And if it went well, a quick word helps other Northern NJ homeowners find us.\n\n` +
    `Tell us how it went: ${feedbackUrl}\n\n` +
    `Rather just tell us directly? Call (201) 212-4917.\n` +
    textFooter(`You're getting this because La Vaca completed work at your home.`, unsubscribeUrl, preferencesUrl ?? undefined);

  return { subject: 'Please let us know how our team did', html, text };
}
