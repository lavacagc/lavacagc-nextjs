import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEstimateEmail } from '@/lib/notify/sendEstimateEmail';
import { supabaseRest } from '@/lib/seo/supabase-rest';
import { estimateEmailSchema } from '../_schema';

/**
 * POST /api/admin/estimate-email/send
 *
 * Sends the customer-facing estimate email via Resend, then writes an
 * audit row to public.estimate_emails.
 *
 * Idempotency: the same recipient + estimateUrl combo within 30 seconds
 * returns the prior message_id instead of double-sending. This guards
 * against the admin's double-clicks and accidental retries — it is NOT a
 * deduplication policy for legitimate re-sends, which happen >30s apart.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */

interface RecentSendRow {
  id: string;
  resend_message_id: string | null;
  sent_at: string;
}

const IDEMPOTENCY_WINDOW_SECONDS = 30;

export async function POST(request: NextRequest) {
  // 1. Parse + validate
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = estimateEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const {
    leadId,
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
  } = parsed.data;

  // 2. Resolve admin identity for the audit log. Middleware already
  //    confirmed there's a valid session — this is just for sent_by.
  let sentBy: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    sentBy = user?.email ?? null;
  } catch {
    // Non-fatal: the audit row will just have a null sent_by.
  }

  // 3. Idempotency check (30s window). Test sends bypass since they
  //    redirect to alex@lavacagc.com regardless of recipientEmail.
  //
  //    The schema refinement guarantees recipientEmail is set unless
  //    isTest is true, so the non-null fallback below is safe.
  const idempotencyRecipient = isTest ? 'alex@lavacagc.com' : (recipientEmail as string);

  if (!isTest) {
    try {
      const sinceIso = new Date(Date.now() - IDEMPOTENCY_WINDOW_SECONDS * 1000).toISOString();
      const path =
        `estimate_emails?select=id,resend_message_id,sent_at` +
        `&recipient_email=eq.${encodeURIComponent(idempotencyRecipient)}` +
        `&estimate_url=eq.${encodeURIComponent(estimateUrl)}` +
        `&sent_at=gte.${encodeURIComponent(sinceIso)}` +
        `&order=sent_at.desc&limit=1`;
      const recent = await supabaseRest<RecentSendRow[]>('GET', path);
      if (recent && recent.length > 0) {
        const prior = recent[0];
        return NextResponse.json({
          status: 'idempotent',
          reason: 'duplicate_within_30s',
          messageId: prior.resend_message_id,
          sentAt: prior.sent_at,
        });
      }
    } catch (err) {
      // If the idempotency check itself fails, log and proceed — better
      // to risk a duplicate than to block a legitimate send because
      // Supabase had a hiccup. The audit row will still record it.
      console.warn('Idempotency check failed, proceeding with send:', err);
    }
  }

  // 4. Send via Resend. For test mode, recipientEmail may be undefined —
  //    the helper redirects to alex@lavacagc.com regardless of what we pass,
  //    but we still need a non-empty value to satisfy its API shape.
  const result = await sendEstimateEmail({
    recipientName,
    recipientEmail: recipientEmail ?? 'alex@lavacagc.com',
    ccEmails,
    replyTo,
    projectType,
    estimateUrl,
    portalUrl,
    updateCadence,
    personalNote,
    isTest,
  });

  // 5. Write audit row regardless of success — failed sends are still
  //    audit-worthy. Status field carries the outcome.
  const auditStatus =
    result.status === 'sent' ? (isTest ? 'test' : 'sent') : 'failed';

  try {
    await supabaseRest('POST', 'estimate_emails', [
      {
        lead_id: leadId ?? null,
        recipient_email: idempotencyRecipient,
        recipient_name: recipientName,
        cc_emails: ccEmails && ccEmails.length > 0 ? ccEmails.join(',') : null,
        reply_to: replyTo ?? null,
        project_type: projectType,
        estimate_url: estimateUrl,
        portal_url: portalUrl ?? null,
        update_cadence: updateCadence ?? null,
        personal_note: personalNote ?? null,
        sent_by: sentBy,
        resend_message_id: result.emailId ?? null,
        status: auditStatus,
        error_message: result.error ?? null,
      },
    ]);
  } catch (err) {
    // Non-fatal: the email already went out. Log loudly so we know we
    // lost an audit row.
    console.error('estimate_emails audit insert failed:', err);
  }

  if (result.status !== 'sent') {
    return NextResponse.json(
      {
        status: result.status,
        error: result.error || result.reason || 'Send failed',
      },
      { status: result.status === 'skipped' ? 503 : 502 },
    );
  }

  return NextResponse.json({
    status: 'sent',
    messageId: result.emailId,
    isTest: !!isTest,
    redirectedTo: isTest ? 'alex@lavacagc.com' : null,
  });
}
