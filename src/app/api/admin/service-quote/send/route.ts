/**
 * POST /api/admin/service-quote/send
 *
 * Sends the customer-facing service quote and writes an audit row to
 * public.estimate_emails with kind='service'.
 *
 * Mirrors the project estimate route deliberately - same 30-second idempotency
 * window against an admin's double-click, same audit-on-failure behaviour - so
 * there is one mental model for "we sent a customer a price", not two.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { HOME_CARE_FROM } from '@/lib/notify/sendHomeCareEmails';
import { buildServiceQuoteEmail, SERVICE_REPLY_TO } from '@/lib/homecare/serviceEmails';
import { preferencesUrlFor, normalizeEmail } from '@/lib/preferences/preferences';
import { cleanEnv } from '@/lib/envClean';
import { serviceQuoteSchema } from '../_schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';
const TEST_RECIPIENT = 'alex@lavacagc.com';
const IDEMPOTENCY_WINDOW_SECONDS = 30;

interface RecentSendRow { id: string; resend_message_id: string | null; sent_at: string }

export async function POST(request: NextRequest) {
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = serviceQuoteSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const {
    leadId, recipientName, recipientEmail, ccEmails, scopeSummary, taskKeys,
    visitLength, estimateUrl, validUntil, personalNote, isTest,
  } = parsed.data;

  let sentBy: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    sentBy = user?.email ?? null;
  } catch {
    // Non-fatal - the audit row just gets a null sent_by.
  }

  const to = isTest ? TEST_RECIPIENT : (recipientEmail as string);

  // Guard the admin's double-click, not legitimate re-sends (>30s apart).
  if (!isTest) {
    try {
      const sinceIso = new Date(Date.now() - IDEMPOTENCY_WINDOW_SECONDS * 1000).toISOString();
      const recent = await supabaseRest<RecentSendRow[]>(
        'GET',
        `estimate_emails?select=id,resend_message_id,sent_at&kind=eq.service` +
          `&recipient_email=eq.${encodeURIComponent(to)}&estimate_url=eq.${encodeURIComponent(estimateUrl)}` +
          `&sent_at=gte.${encodeURIComponent(sinceIso)}&order=sent_at.desc&limit=1`,
      );
      if (recent && recent.length > 0) {
        return NextResponse.json({
          status: 'idempotent', reason: 'duplicate_within_30s',
          messageId: recent[0].resend_message_id, sentAt: recent[0].sent_at,
        });
      }
    } catch (err) {
      // Better a possible duplicate than a blocked legitimate send.
      console.warn('service-quote idempotency check failed, proceeding:', err);
    }
  }

  const preferencesUrl = await preferencesUrlFor(SITE_URL, to).catch(() => undefined);
  // A quote goes to someone who asked us for a price. They are not necessarily
  // a Home Care member, so `stream=home_care` claimed a scope the recipient may
  // not have - and /unsub honours only `follow_ups`, so every other value fell
  // through to the marketing cascade and turned off buy_remodel and
  // announcements as well, consent that only a fresh double opt-in can restore.
  // `follow_ups` is the opt-out that actually governs automated mail about an
  // inquiry (the nurture drip, the post-job review request); estimates and
  // scheduling still come through, so it cannot silence a live negotiation.
  const unsubscribeUrl =
    `${SITE_URL}/unsub?stream=follow_ups&email=${encodeURIComponent(normalizeEmail(to))}`;

  const { subject, html, text } = buildServiceQuoteEmail({
    recipientName,
    scopeSummary,
    estimateUrl,
    visitLength,
    personalNote,
    unsubscribeUrl,
    preferencesUrl,
    validUntil: validUntil ? new Date(`${validUntil}T00:00:00Z`) : null,
  });

  const result = await sendTrackedEmail({
    from: HOME_CARE_FROM,
    to,
    ...(ccEmails && ccEmails.length > 0 && !isTest ? { cc: ccEmails } : {}),
    replyTo: SERVICE_REPLY_TO,
    subject: isTest ? `[TEST] ${subject}` : subject,
    html,
    text,
    category: 'service_quote',
    toName: recipientName,
    leadId: leadId ?? null,
  });

  const auditStatus = result.status === 'sent' ? (isTest ? 'test' : 'sent') : 'failed';
  try {
    await supabaseRest('POST', 'estimate_emails', [{
      lead_id: leadId ?? null,
      recipient_email: to,
      recipient_name: recipientName,
      cc_emails: ccEmails && ccEmails.length > 0 ? ccEmails.join(',') : null,
      reply_to: SERVICE_REPLY_TO.join(', '),
      // project_type is NOT NULL on the shared table; the scope is what a
      // service quote has instead of a remodel category.
      project_type: 'Home Care service',
      estimate_url: estimateUrl,
      personal_note: personalNote ?? null,
      sent_by: sentBy,
      resend_message_id: result.emailId ?? null,
      status: auditStatus,
      error_message: result.error ?? null,
      kind: 'service',
      scope_summary: scopeSummary,
      visit_length: visitLength ?? null,
      valid_until: validUntil ?? null,
    }]);
  } catch (err) {
    console.error('service-quote audit insert failed:', err);
  }

  if (result.status !== 'sent') {
    return NextResponse.json(
      { status: result.status, error: result.error || result.reason || 'Send failed' },
      { status: result.status === 'skipped' ? 503 : 502 },
    );
  }

  return NextResponse.json({
    status: 'sent',
    messageId: result.emailId,
    isTest: !!isTest,
    redirectedTo: isTest ? TEST_RECIPIENT : null,
    taskKeys: taskKeys ?? [],
  });
}
