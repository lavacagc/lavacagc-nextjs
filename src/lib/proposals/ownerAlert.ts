/**
 * Proposal Pod - Slice 3: what Alex gets when a client answers.
 *
 * Two channels, deliberately. Telegram is the one that reaches a phone in a
 * van; the email is the one that survives, is searchable, and is itemized for
 * the minute it takes to transcribe into QuickBooks. Neither is a fallback for
 * the other - a client accepting a proposal is the most important event this
 * site produces, and it is worth two chances at being noticed.
 *
 * INTERNAL mail, so `noreply@` per the house from-address convention, and the
 * warm `alex@` identity is left to the delivery email that goes to the client.
 *
 * Runs IN-PROCESS. Do NOT self-fetch /api/notify/* - Cloudflare 403s the
 * deployment's own requests to itself, and Vercel kills a fetch that is not
 * awaited. The route awaits both of these through Promise.allSettled.
 *
 * NEITHER FUNCTION THROWS. The submission is already stored by the time they
 * run; an alert that failed must be logged and reported, never allowed to turn
 * a recorded agreement into an error the client sees.
 */
import { cleanEnv } from '@/lib/envClean';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import {
  escapeTelegram, escapeTelegramClipped, sendTelegramMessage, TELEGRAM_TEXT_LIMIT,
  type TelegramOutcome,
} from '@/lib/notify/telegramMessage';
import {
  FF, INK, BODY, MUTED, NAVY, HAIRLINE, PANEL_BG, esc, brandRow, headline,
  homeCareEmailShell,
} from '@/lib/homecare/emailShell';
import { usd } from './money';
import type { SnapshotLine, SubmissionRecord } from './submit';

export const PROPOSAL_ALERT_FROM = 'La Vaca Proposals <noreply@email.lavaca.link>';

/** Where owner alerts go, matching the new-lead notification. */
function ownerAddress(): string {
  return cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || 'alex@vacamoo.com';
}

/**
 * "Accepted" for a first answer, "revised" for a later one.
 *
 * The verdict is the record's own - see `isRevision` on SubmissionRecord for
 * why it is not derived from the count here. Deriving it from
 * `priorSubmissions ?? 0` was wrong in exactly the case the count is missing
 * but a prior row was seen, which is what a stripped Content-Range header
 * produces: a genuine revision announced as a first answer.
 */
function isRevision(record: SubmissionRecord): boolean {
  return record.isRevision;
}

function lineRows(lines: SnapshotLine[]): string {
  return lines.map((l) => `
    <tr>
      <td style="padding:7px 0;border-bottom:1px solid ${HAIRLINE};font-family:${FF};font-size:14px;line-height:20px;color:${BODY}">
        ${esc(l.title)}${l.optional ? ` <span style="color:${MUTED};font-size:12px">(their choice)</span>` : ''}
      </td>
      <td align="right" style="padding:7px 0 7px 12px;border-bottom:1px solid ${HAIRLINE};font-family:${FF};font-size:14px;line-height:20px;color:${INK};white-space:nowrap">
        ${esc(usd(l.price_cents))}
      </td>
    </tr>`).join('\n');
}

export function buildProposalSubmissionEmail(record: SubmissionRecord): {
  subject: string;
  html: string;
  text: string;
} {
  const revision = isRevision(record);
  const verb = revision ? 'revised their proposal' : 'accepted their proposal';
  const subject = `${revision ? 'Proposal revised' : 'Proposal accepted'}: ${record.clientName} - ${usd(record.totalCents)}`;

  const rows = [
    brandRow('Proposal'),
    headline(`${esc(record.clientName)} ${verb}`),
    `  <tr><td class="px" style="padding:14px 40px 0 40px;font-family:${FF};font-size:14px;line-height:21px;color:${MUTED}">
      ${esc(record.proposalTitle)}${revision && record.priorSubmissions != null
        ? ` &nbsp;&middot;&nbsp; revision ${record.priorSubmissions + 1}`
        : ''}${revision && record.priorSubmissions == null
        ? ' &nbsp;&middot;&nbsp; a later revision'
        : ''}
    </td></tr>`,
    `  <tr><td class="px" style="padding:18px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${PANEL_BG};border-radius:12px">
      <tr><td style="padding:16px 18px;font-family:${FF};font-size:13px;line-height:18px;color:${MUTED}">
        Agreed total
        <div style="padding-top:4px;font-size:28px;line-height:34px;font-weight:bold;color:${INK}">${esc(usd(record.totalCents))}</div>
      </td></tr>
    </table>
  </td></tr>`,
    `  <tr><td class="px" style="padding:24px 40px 0 40px;font-family:${FF};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};font-weight:bold">
      What they agreed to (${record.included.length})
    </td></tr>`,
    `  <tr><td class="px" style="padding:6px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">
${lineRows(record.included)}
      <tr>
        <td style="padding:10px 0 0 0;font-family:${FF};font-size:14px;line-height:20px;color:${INK};font-weight:bold">Total</td>
        <td align="right" style="padding:10px 0 0 12px;font-family:${FF};font-size:16px;line-height:20px;color:${INK};font-weight:bold;white-space:nowrap">${esc(usd(record.totalCents))}</td>
      </tr>
    </table>
  </td></tr>`,
    ...(record.declined.length > 0
      ? [`  <tr><td class="px" style="padding:24px 40px 0 40px;font-family:${FF};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};font-weight:bold">
      They turned down (${record.declined.length})
    </td></tr>`,
      `  <tr><td class="px" style="padding:6px 40px 0 40px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">
${lineRows(record.declined)}
    </table>
  </td></tr>`]
      : []),
    ...(record.touched.length > 0
      ? [`  <tr><td class="px" style="padding:20px 40px 0 40px;font-family:${FF};font-size:12.5px;line-height:19px;color:${MUTED}">
      <strong style="color:${INK}">Switched back and forth on:</strong> ${esc(record.touched.map((l) => l.title).join(', '))}.
    </td></tr>`]
      : []),
    `  <tr><td class="px" style="padding:26px 40px 32px 40px">
    <div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:1px">&nbsp;</div>
    <div style="padding-top:16px;font-family:${FF};font-size:12.5px;line-height:19px;color:#8A8A8A">
      Sent from the client's own proposal page. The full record is on the proposal in
      <span style="color:${NAVY}">Customers &rarr; Proposals</span>.
    </div>
  </td></tr>`,
  ].join('\n');

  const text = [
    `${record.clientName} ${verb}.`,
    record.proposalTitle,
    '',
    `AGREED TOTAL: ${usd(record.totalCents)}`,
    '',
    `What they agreed to (${record.included.length}):`,
    ...record.included.map((l) => `  ${l.title}${l.optional ? ' (their choice)' : ''} - ${usd(l.price_cents)}`),
    ...(record.declined.length > 0
      ? ['', `They turned down (${record.declined.length}):`,
        ...record.declined.map((l) => `  ${l.title} - ${usd(l.price_cents)}`)]
      : []),
    ...(record.touched.length > 0
      ? ['', `Switched back and forth on: ${record.touched.map((l) => l.title).join(', ')}`]
      : []),
  ].join('\n');

  return {
    subject,
    html: homeCareEmailShell({
      preheader: `${esc(record.clientName)} landed on ${esc(usd(record.totalCents))}.`,
      rows,
    }),
    text,
  };
}

export interface AlertOutcome {
  email: 'sent' | 'skipped' | 'failed' | 'error';
  telegram: TelegramOutcome;
}

/** Send the owner email. Never throws; the caller records the outcome. */
export async function sendProposalSubmissionEmail(
  record: SubmissionRecord,
): Promise<AlertOutcome['email']> {
  try {
    const { subject, html, text } = buildProposalSubmissionEmail(record);
    const res = await sendTrackedEmail({
      from: PROPOSAL_ALERT_FROM,
      to: ownerAddress(),
      subject,
      html,
      text,
      category: 'proposal_submission',
      leadId: record.leadId,
      campaign: { proposal_id: record.proposalId },
    });
    if (res.status !== 'sent') {
      console.error(
        `[proposal alert] email for proposal ${record.proposalId} did not send (${res.status}): `
        + `${res.error || res.reason || 'no detail'}`,
      );
    }
    return res.status;
  } catch (err) {
    console.error(
      `[proposal alert] email for proposal ${record.proposalId} threw:`,
      err instanceof Error ? err.message : String(err),
    );
    return 'error';
  }
}

/**
 * The phone-in-the-van copy.
 *
 * Every interpolated value is escaped for Telegram's HTML parse mode, and the
 * itemization is clipped rather than the message: a long estimate must not cost
 * the total, which is the one number worth pushing to a phone. The header and
 * total are composed first and the item list takes what budget is left.
 */
export function buildProposalSubmissionTelegram(record: SubmissionRecord): string {
  const revision = isRevision(record);
  const head = [
    `<b>${revision ? 'Proposal revised' : 'Proposal accepted'}</b>`,
    `${escapeTelegram(record.clientName)} - ${escapeTelegram(record.proposalTitle)}`,
    '',
    `<b>${escapeTelegram(usd(record.totalCents))}</b> across ${record.included.length} line(s)`,
    ...(record.declined.length > 0 ? [`Turned down ${record.declined.length} option(s)`] : []),
    '',
  ].join('\n');

  const budget = TELEGRAM_TEXT_LIMIT - head.length - 1;
  // RAW, because escapeTelegramClipped escapes what it is given: escaping here
  // as well would send '&amp;amp;' for a line titled 'Demo & haul away', and the
  // clip budget would be counted against the wrong length.
  const items = record.included
    .map((l) => `- ${l.title}: ${usd(l.price_cents)}`)
    .join('\n');
  return head + escapeTelegramClipped(items, Math.max(0, budget));
}

/** Send the owner Telegram. Never throws. */
export async function sendProposalSubmissionTelegram(
  record: SubmissionRecord,
): Promise<TelegramOutcome> {
  try {
    return await sendTelegramMessage(buildProposalSubmissionTelegram(record));
  } catch (err) {
    console.error(
      `[proposal alert] telegram for proposal ${record.proposalId} threw:`,
      err instanceof Error ? err.message : String(err),
    );
    return 'failed';
  }
}

/**
 * Both channels, together, awaited.
 *
 * allSettled rather than all: one channel failing must not cancel the other,
 * and neither may reject into the route. Awaited rather than fired and
 * forgotten because Vercel freezes the instance once the response is returned -
 * a pending fetch at that moment simply never happens.
 */
export async function alertOwnerOfSubmission(record: SubmissionRecord): Promise<AlertOutcome> {
  const [email, telegram] = await Promise.allSettled([
    sendProposalSubmissionEmail(record),
    sendProposalSubmissionTelegram(record),
  ]);
  return {
    email: email.status === 'fulfilled' ? email.value : 'error',
    telegram: telegram.status === 'fulfilled' ? telegram.value : 'failed',
  };
}
