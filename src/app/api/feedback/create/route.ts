import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import {
  feedbackDay0Html,
  feedbackDay3Html,
  feedbackDay7Html,
} from '@/lib/emailTemplates';
import { cleanEnv } from '@/lib/envClean';
import { normalizeEmail } from '@/lib/preferences/preferences';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';

/** Visible unsubscribe link for review-request emails (follow_ups opt-out). */
function followUpUnsubUrl(email: string): string {
  return `${SITE_URL}/unsub?stream=follow_ups&email=${encodeURIComponent(normalizeEmail(email))}`;
}

/**
 * POST /api/feedback/create
 * Creates a feedback (review request) email sequence for a customer.
 * Sends Day 0 email immediately, queues Day 3 and Day 7 for cron.
 */
export async function POST(request: NextRequest) {
  try {
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, secretKey);
    const body = await request.json();
    const { customerName, email } = body as { customerName: string; email: string };

    if (!customerName || !email) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }

    const now = new Date();
    const unsubUrl = followUpUnsubUrl(email);
    const day0Subject = 'How was your experience with La Vaca?';
    const day0Html = feedbackDay0Html(customerName, unsubUrl);

    // Send Day 0 email immediately
    const day0Result = await sendTrackedEmail({
      from: 'La Vaca General Contractors <info@email.lavaca.link>',
      to: email,
      subject: day0Subject,
      html: day0Html,
      category: 'feedback_request',
      toName: customerName,
      campaign: { follow_up_type: 'feedback_day0' },
      // Review requests are commercial → honor the follow-ups opt-out + one-click header.
      preferenceStream: 'follow_ups',
    });
    const day0Sent = day0Result.status === 'sent';

    const feedbackEmails = [
      {
        lead_email: email,
        lead_name: customerName,
        follow_up_type: 'feedback_day0',
        scheduled_at: now.toISOString(),
        status: day0Sent ? 'sent' : 'pending',
        email_subject: day0Subject,
        email_body: day0Html,
        ...(day0Sent ? { sent_at: now.toISOString() } : {}),
      },
      {
        lead_email: email,
        lead_name: customerName,
        follow_up_type: 'feedback_day3',
        scheduled_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        email_subject: `Quick follow-up — we'd love your feedback`,
        email_body: feedbackDay3Html(customerName, unsubUrl),
      },
      {
        lead_email: email,
        lead_name: customerName,
        follow_up_type: 'feedback_day7',
        scheduled_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        email_subject: `Last chance to share your thoughts`,
        email_body: feedbackDay7Html(customerName, unsubUrl),
      },
    ];

    const { data, error } = await supabase
      .from('follow_up_queue')
      .insert(feedbackEmails)
      .select('id, follow_up_type, scheduled_at');

    if (error) {
      console.error('Error creating feedback sequence:', error);
      return NextResponse.json({ error: 'Failed to create feedback sequence' }, { status: 500 });
    }

    return NextResponse.json({
      status: 'created',
      day0Sent,
      followUps: data,
    });
  } catch (error) {
    console.error('Feedback create error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
