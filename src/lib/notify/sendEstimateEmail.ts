import {
  estimateEmailHtml,
  estimateEmailText,
  type EstimateEmailPayload,
} from '@/lib/emailTemplates';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';

/**
 * Customer-facing estimate-presentation email.
 *
 * Why a dedicated helper (not reusing newLeadEmail):
 *   - Different From identity. Per the email-from-address convention, anything
 *     a *customer* reads is sent as `Alex from La Vaca GC <alex@email.lavaca.link>`.
 *     newLeadEmail uses the noreply identity because it's inbox furniture for the team.
 *   - Different reply-to. Customers should reply to `info@lavacagc.com`, not the
 *     sending mailbox.
 *   - Different recipient model. newLeadEmail always sends to a single
 *     internal owner; this helper sends to whoever the admin selected, with
 *     optional CC.
 *
 * Runs in-process — do NOT self-fetch. See note in telegramLead.ts.
 */

export interface EstimateEmailSendPayload extends EstimateEmailPayload {
  recipientEmail: string;
  ccEmails?: string[];
  /** Override reply-to. Default: info@lavacagc.com. */
  replyTo?: string;
  /**
   * If true, force the test-redirect: send to alex@lavacagc.com regardless
   * of recipientEmail/ccEmails. Used by the admin "test send" button.
   */
  isTest?: boolean;
  /** Lead row id, for linking the email_log audit row back to the lead. */
  leadId?: string | null;
  /** Admin email that triggered this send, for the audit trail. */
  sentBy?: string | null;
}

export interface EstimateEmailSendResult {
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
  emailId?: string;
  error?: string;
}

const FROM_ADDRESS = 'Alex from La Vaca GC <alex@email.lavaca.link>';
const DEFAULT_REPLY_TO = 'info@lavacagc.com';
const TEST_REDIRECT = 'alex@lavacagc.com';

function firstName(full: string): string {
  const trimmed = full.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

export async function sendEstimateEmail(
  payload: EstimateEmailSendPayload,
): Promise<EstimateEmailSendResult> {
  const {
    recipientName,
    recipientEmail,
    ccEmails,
    replyTo,
    projectType,
    estimateUrl,
    portalUrl,
    updateCadence,
    personalNote,
    isTest,
    leadId,
    sentBy,
  } = payload;

  // Test mode: always redirect to Alex regardless of who the form said.
  // CCs are dropped in test mode so we don't accidentally email customers
  // during template iteration.
  const finalTo = isTest ? [TEST_REDIRECT] : [recipientEmail];
  const finalCc = isTest ? undefined : ccEmails && ccEmails.length > 0 ? ccEmails : undefined;

  const subjectPrefix = isTest ? '[TEST] ' : '';
  const subject =
    `${subjectPrefix}Your ${projectType} estimate from La Vaca General Contractors` +
    ` — ${firstName(recipientName)}`;

  const templatePayload: EstimateEmailPayload = {
    recipientName,
    projectType,
    estimateUrl,
    portalUrl,
    updateCadence,
    personalNote,
  };

  return sendTrackedEmail({
    from: FROM_ADDRESS,
    to: finalTo,
    cc: finalCc,
    replyTo: replyTo || DEFAULT_REPLY_TO,
    subject,
    html: estimateEmailHtml(templatePayload),
    text: estimateEmailText(templatePayload),
    category: 'estimate',
    toName: recipientName,
    leadId: leadId ?? null,
    sentBy: sentBy ?? null,
    campaign: isTest ? { test: true } : null,
  });
}
