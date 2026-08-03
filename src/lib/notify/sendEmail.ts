import { Resend } from 'resend';
import { cleanEnv } from '@/lib/envClean';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { getOrCreateByEmail, type SuppressionKey } from '@/lib/preferences/preferences';

const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';

/**
 * The single chokepoint every outbound email funnels through.
 *
 * Before this, ~11 helpers in src/lib/notify/* each constructed their own
 * `new Resend(...)` and none (except the estimate tool) recorded what they
 * sent. `sendTrackedEmail` sends via Resend AND writes one audit row to
 * public.email_log so the admin can see every email + the HTML that went out,
 * minus the credentials in its links (see `redactEmailBody`) and minus
 * attachment bytes. Delivered/opened/clicked/bounced events are backfilled
 * later by the Resend webhook (Phase 2), which matches on resend_message_id.
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
  | 'release'
  | 'service_quote'
  | 'visit_reminder'
  /** Internal: the crew's "you are on this visit" email. Never customer-facing. */
  | 'crew_dispatch'
  /** Internal: the METHOD:CANCEL that takes a retired visit off the crew's calendar. */
  | 'crew_dispatch_cancelled'
  | 'other';

interface TrackedEmailBase {
  from: string;
  to: string | string[];
  cc?: string | string[];
  /**
   * One address, or several.
   *
   * An ARRAY for several - never a comma-joined string. Resend validates this
   * field per-address and answers 422 "Invalid `reply_to` field" for
   * "a@x.com, b@x.com", which fails the whole send. Every service-quote email
   * passed `SERVICE_REPLY_TO.join(', ')`, so the quote, the completion feedback
   * request and the night-before visit reminder could none of them ever be
   * delivered - latent only because no service quote had been sent yet.
   */
  replyTo?: string | string[];
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
   * Files to attach. `content` is the raw body; it is base64-encoded here
   * because that is the only shape Resend's JSON API accepts.
   *
   * The bytes are NEVER written to email_log. The audit row exists so the admin
   * can see what went out, and a base64 blob in a TEXT column is not that - it
   * is a way to make the table unreadable and unbounded. The filenames are
   * recorded on the campaign field instead, which is enough to answer "did this
   * email carry the calendar file".
   *
   * `contentType` declares the MIME type of the part. Optional, and omitted
   * unless a caller asks for one, so every existing send produces exactly the
   * request it produced before - Resend derives a type from the filename when
   * none is given. It exists for the parts whose type carries meaning the
   * extension cannot: a calendar invite is only rendered as an "Add to
   * calendar" / RSVP card when its part says
   * `text/calendar; charset=utf-8; method=REQUEST`, and is offered as a plain
   * download otherwise.
   */
  attachments?: { filename: string; content: string | Buffer; contentType?: string }[];

  /**
   * Set false to skip the audit-log row (rare — e.g. a caller that logs the
   * send itself in its own table). Defaults to true: log everything.
   */
  log?: boolean;
}

/**
 * Stream governance travels as a pair, and the type says so: `knownSuppressed`
 * is a verdict ABOUT a stream, so it cannot be set without naming one. Left
 * independent, a stray `knownSuppressed: true` on a stream-less send read as
 * "no stream, nothing to check" and delivered mail to a recipient the caller
 * had already established was unsubscribed - the inverse of what it says.
 */
type StreamGovernance =
  | {
      /**
       * This send is governed by a preference/suppression key: the recipient's
       * opt-out is honored (suppressed → skipped, not sent) and a per-recipient
       * List-Unsubscribe header + one-click URL are attached. Accepts a
       * marketing stream (home_care | buy_remodel | announcements) OR the
       * transactional 'follow_ups' opt-out (lead follow-ups / review requests,
       * whose primary purpose is commercial so they still need a working
       * unsubscribe).
       */
      preferenceStream: SuppressionKey;

      /**
       * Set when the caller has ALREADY established that this recipient is off
       * the stream - e.g. the monthly cron reads the whole opt-out list once and
       * classifies every recipient against it. Such a send still comes through
       * here rather than being dropped at the call site, so the opt-out leaves
       * the same email_log row any other honored opt-out leaves.
       */
      knownSuppressed?: boolean;
    }
  /** Purely transactional/internal mail: no stream, and so no verdict about one. */
  | { preferenceStream?: never; knownSuppressed?: never };

export type TrackedEmailInput = TrackedEmailBase & StreamGovernance;

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
 * A credential-bearing query parameter inside a rendered email body.
 *
 * Matched on the parameter NAME, the same rule `redactRestPath` applies to the
 * REST path - `?token=`, `&access_token=`, and the entity-escaped `&amp;token=`
 * an HTML href carries. The value runs to whatever ends it: the next parameter,
 * the quote closing an href, or the whitespace ending a plain-text URL.
 */
const BODY_CREDENTIAL = /([?&](?:amp;)?[a-z0-9_-]*token=)[^&"'<>\s]+/gi;

/** What replaces the value, so the admin still sees the link's shape. */
const REDACTED = 'REDACTED';

/**
 * The body with its credentials blanked, for the email_log copy ONLY.
 *
 * Every Home Care portal email now carries the homeowner's access token in
 * every link. That token is stable, never rotated, and buys 30 days of portal
 * access including booking paid work at the member's address - so writing the
 * rendered body verbatim put a permanent credential into a second table for
 * every newsletter, release, reminder, visit-scheduled and welcome send, with
 * no retention limit and a viewer that reads it back. That is the same leak
 * `redactRestPath` closed on the application log, on the durable path.
 *
 * The unsubscribe, preference and verify tokens sit in the same bodies and are
 * blanked by the same rule - matching on the name costs nothing extra and the
 * alternative is a list that a fifth token shape falls off.
 *
 * Applied here, at the single point that persists, rather than in each builder:
 * the same reasoning that keeps attachment bytes out of email_log. WHAT WAS
 * SENT IS UNTOUCHED - the recipient's link still works. Nothing re-sends from a
 * stored body (the admin routes only read email_log, and the Resend webhook only
 * patches delivery status), so a redacted copy cannot become a delivered one.
 */
export function redactEmailBody(body: string): string {
  return body.replace(BODY_CREDENTIAL, `$1${REDACTED}`);
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
      // Flattened for the audit column, which is TEXT. The wire format is the
      // array above; this is only what the admin reads back.
      reply_to: Array.isArray(input.replyTo) ? input.replyTo.join(', ') : input.replyTo ?? null,
      subject: input.subject,
      // Bodies are stored with their tokens blanked - see redactEmailBody.
      html: input.html == null ? null : redactEmailBody(input.html),
      text: input.text == null ? null : redactEmailBody(input.text),
      homeowner_id: input.homeownerId ?? null,
      subscriber_id: input.subscriberId ?? null,
      lead_id: input.leadId ?? null,
      // Attachment NAMES only - see the note on `attachments`. Folded into the
      // campaign blob rather than given a column, because "what rode along with
      // this email" is metadata about the send, not a new first-class field.
      campaign: input.attachments?.length
        ? { ...(input.campaign ?? {}), attachments: input.attachments.map((a) => a.filename) }
        : input.campaign ?? null,
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
 * Honor an opt-out: no send, and one email_log row recording that we
 * intentionally didn't send.
 *
 * Both routes into a suppression end here - the per-recipient lookup below and
 * a caller that already read the stream's opt-out list - so the audit row is
 * written once, in one shape, whichever side noticed. Without it the admin
 * cannot tell "we correctly honored an unsubscribe" from "the run never
 * reached this member", which for commercial mail is the record that matters.
 */
async function suppress(
  input: TrackedEmailInput,
  toList: string[],
  ccList: string[],
): Promise<TrackedEmailResult> {
  const result: TrackedEmailResult = {
    status: 'skipped',
    reason: 'unsubscribed',
    error: 'suppressed: recipient unsubscribed from this stream',
  };
  if (input.log !== false) await writeEmailLog(input, toList, ccList, result);
  return result;
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
  // An opt-out the caller already knows about is refused on its own terms -
  // ahead of the lookup below, which fails OPEN. Failing open is the right
  // default for a send nobody has ruled out, and the wrong one for a send
  // somebody has: a DB hiccup must not turn a known unsubscribe into a
  // delivered email. Nothing about it is conditional on the stream being
  // readable here, so nothing about it is nested under that.
  if (input.knownSuppressed) return suppress(input, toList, ccList);

  let unsubHeaders: Record<string, string> | undefined;
  if (input.preferenceStream && toList[0]) {
    try {
      const pref = await getOrCreateByEmail(toList[0]);
      if (pref[input.preferenceStream] === false) return suppress(input, toList, ccList);
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
      // Base64 is the only encoding Resend's JSON API takes for attachment
      // content. A Buffer would serialize to `{"type":"Buffer","data":[...]}`
      // and silently arrive as a corrupt file, so the conversion happens here
      // rather than being left to each caller to remember.
      ...(input.attachments?.length
        ? {
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content).toString('base64'),
              // Spread, so a caller that asks for no type sends the same
              // attachment object it has always sent and Resend keeps deriving
              // one from the filename.
              ...(a.contentType ? { contentType: a.contentType } : {}),
            })),
          }
        : {}),
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
