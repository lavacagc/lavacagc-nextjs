import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { newLeadNotificationHtml } from '@/lib/emailTemplates';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notify/new-lead
 * Sends an instant email notification to Alex when a new lead is captured.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, projectType, location, source } = body as {
      name?: string;
      email?: string;
      phone?: string;
      projectType?: string;
      location?: string;
      source?: string;
    };

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn('⚠️ RESEND_API_KEY not configured — skipping lead notification email');
      return NextResponse.json({
        status: 'skipped',
        reason: 'no_api_key',
        message: 'RESEND_API_KEY not configured',
      });
    }

    const resend = new Resend(apiKey);

    const notificationEmail = process.env.LEAD_NOTIFICATION_EMAIL || 'alex@vacamoo.com';

    const { data, error } = await resend.emails.send({
      from: 'La Vaca Leads <noreply@email.lavaca.link>',
      to: [notificationEmail],
      subject: `🔥 New Lead: ${name || 'Unknown'} — ${projectType || 'General Inquiry'}`,
      html: newLeadNotificationHtml({ name, email, phone, projectType, location, source }),
    });

    if (error) {
      console.error('Failed to send lead notification email:', error);
      return NextResponse.json({ status: 'failed', error: error.message }, { status: 500 });
    }

    return NextResponse.json({ status: 'sent', emailId: data?.id });
  } catch (error) {
    console.error('Notification endpoint error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}
