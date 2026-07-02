import { Resend } from 'resend';
import { cleanEnv } from '@/lib/envClean';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { getOrCreateByEmail, type StreamKey } from '@/lib/preferences/preferences';

const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';

/**
 * The single chokepoint every outbound email funnels through.
 *
 * Before this, ~11 helpers in src/lib/notify/* each constructed their own
 * `new Resend(...)` and none (except the estimate tool) recorded what they
 * sent. `sendTrackedEmail` sends via Resend AND writes one audit row to
 * public.email_log so the admin can see every email + the exact HTML that
 * went out. Delivered/opened/clicked/bounced events are backfilled later by
 * the Resend webhook (Phase 2), which matches on resend_message_id.
 *
 * Contract: logging is BEST-EFFORT. A failed email_log insert is swallowed and
 * never changes the send result — the actual email must go out regardless.
 *
 * Runs in-process — do NOT self-fetch. See note in telegramLead.ts.
 */

export type EmailCategory =
  | 'verification'
  | 'welcome'
  | 'estimate'
  | 'lead_followup'
  | 'lead_notification'
  | 'home_care_newsletter'
  | 'buy_remodel'
  | 'seo_report'
  | 'staged_draft'
  | 'rollback_digest'
  | 'form_error'
  | 'feedback_request'
  | 'broadcast'
  | 'other';

export interface TrackedEmailInput {
  from: string;
  to: string | string[];
  cc?: string | string[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  category: EmailCategory;

  /** Optional links to the domain entities this email concerns. */
  homeownerId?: string | null;
  subscriberId?: string | null;
  leadId?: string | null;
  /** utm / broadcast id / A-B arm, etc. */
  campaign?: Record<string, unknown> | null;
  /** Admin email when admin-triggered; defaults to 'system'. */
  sentBy?: string | null;
  /** Recipient display name, for the admin list. */
  toName?: string | null;

  /**
   * Set false to skip the audit-log row (rare — e.g. a caller that logs the
   * send itself in its own table). Defaults to true: log everything.
   */
  log?: boolean;

  /**
   * When set, this send is governed by a marketing preference stream: the
   * recipient's opt-out is honored (suppressed → skipped, not sent) and a
   * per-recipient List-Unsubscribe header + one-click URL are attached. Omit for
   * transactional/internal mail, which always sends and carries no such header.
   */
  preferenceStream?: StreamKey;
}

export interface TrackedEmailResult {
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
  emailId?: string;
  error?: string;
}

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Write the audit row. Best-effort: any failure is logged and swallowed so it
 * can never affect the send outcome. Not exported — callers use sendTrackedEmail.
 */
async function writeEmailLog(
  input: TrackedEmailInput,
  toList: string[],
  ccList: string[],
  result: TrackedEmailResult,
): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    await supabaseRest('POST', 'email_log', {
      category: input.category,
      to_email: toList[0] ?? 'unknown',
      to_emails: toList,
      to_name: input.toName ?? null,
      cc_emails: ccList.length ? ccList.join(',') : null,
      from_email: input.from,
      reply_to: input.replyTo ?? null,
      subject: input.subject,
      html: input.html ?? null,
      text: input.text ?? null,
      homeowner_id: input.homeownerId ?? null,
      subscriber_id: input.subscriberId ?? null,
      lead_id: input.leadId ?? null,
      campaign: input.campaign ?? null,
      sent_by: input.sentBy ?? 'system',
      resend_message_id: result.emailId ?? null,
      status: result.status,
      error_message: result.error ?? null,
      sent_at: result.status === 'sent' ? nowIso : null,
    }, { prefer: 'return=minimal' });
  } catch (err) {
    // Never let audit-logging break email delivery.
    console.error('email_log insert failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

/**
 * Send an email via Resend and record it in email_log.
 * Mirrors the {status,emailId,error} result shape the existing senders return.
 */
export async function sendTrackedEmail(input: TrackedEmailInput): Promise<TrackedEmailResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  const toList = toArray(input.to);
  const ccList = toArray(input.cc);

  if (!apiKey) {
    console.warn(`⚠️ RESEND_API_KEY not configured — skipping ${input.category} email`);
    // A skip is a non-event (no send attempted); we don't log it to avoid noise.
    return { status: 'skipped', reason: 'no_api_key' };
  }

  // Marketing-stream governance: honor the recipient's opt-out and attach a
  // per-recipient List-Unsubscribe header. Best-effort — a lookup failure must
  // not block a send (isSuppressed-style fail-open).
  //
  // Stream-governed sends are strictly single-recipient: suppression and the
  // unsubscribe token are per-recipient, so a multi-recipient send would skip
  // opt-out checks for everyone past the first AND hand every recipient a
  // header controlling the first recipient's preferences.
  if (input.preferenceStream && toList.length > 1) {
    const result: TrackedEmailResult = {
      status: 'error',
      error: `preferenceStream '${input.preferenceStream}' requires exactly one recipient, got ${toList.length}`,
    };
    console.error(`${input.category} email rejected:`, result.error);
    if (input.log !== false) await writeEmailLog(input, toList, ccList, result);
    return result;
  }
  let unsubHeaders: Record<string, string> | undefined;
  if (input.preferenceStream && toList[0]) {
    try {
      const pref = await getOrCreateByEmail(toList[0]);
      if (pref[input.preferenceStream] === false) {
        const suppressed: TrackedEmailResult = {
          status: 'skipped',
          reason: 'unsubscribed',
          error: 'suppressed: recipient unsubscribed from this stream',
        };
        // Record the suppression so the admin can see we intentionally didn't send.
        if (input.log !== false) await writeEmailLog(input, toList, ccList, suppressed);
        return suppressed;
      }
      const unsubUrl =
        `${SITE_URL}/api/preferences/unsubscribe?token=${encodeURIComponent(pref.preference_token)}` +
        `&stream=${input.preferenceStream}`;
      unsubHeaders = {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
    } catch (e) {
      console.error('preference lookup failed (sending anyway):', e instanceof Error ? e.message : e);
    }
  }

  let result: TrackedEmailResult;
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: input.from,
      to: toList,
      ...(ccList.length ? { cc: ccList } : {}),
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      subject: input.subject,
      ...(unsubHeaders ? { headers: unsubHeaders } : {}),
      // Resend requires at least one of html/text; senders always pass one.
      ...(input.html !== undefined ? { html: input.html } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
    } as Parameters<Resend['emails']['send']>[0]);

    if (error) {
      console.error(`Failed to send ${input.category} email:`, error);
      result = { status: 'failed', error: error.message };
    } else {
      result = { status: 'sent', emailId: data?.id };
    }
  } catch (err) {
    console.error(`${input.category} email error:`, err);
    result = { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }

  if (input.log !== false) {
    await writeEmailLog(input, toList, ccList, result);
  }

  return result;
}
