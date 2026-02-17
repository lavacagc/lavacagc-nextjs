import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notify/new-lead
 * Sends an instant email notification to Alex when a new lead is captured.
 *
 * Setup required:
 * 1. Sign up at https://resend.com
 * 2. Verify the lavacagc.com domain in Resend
 * 3. Add RESEND_API_KEY to Vercel env vars
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

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ea580c;">🔥 New Lead from lavacagc.com chatbot</h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee; width: 120px;">Name</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${name || 'Not provided'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">Email</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${email ? `<a href="mailto:${email}">${email}</a>` : 'Not provided'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">Phone</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${phone ? `<a href="tel:${phone}">${phone}</a>` : 'Not provided'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">Project Type</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${projectType || 'Not specified'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">Location</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${location || 'Not specified'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">Source</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${source || 'website'}</td>
          </tr>
        </table>
        <p style="margin-top: 20px; color: #666; font-size: 14px;">
          This lead was captured via the lavacagc.com chatbot. Log in to the
          <a href="https://www.lavacagc.com/admin">admin dashboard</a> to view details.
        </p>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'La Vaca Leads <noreply@lavacagc.com>',
      to: ['alex@vacamoo.com'],
      subject: '🔥 New Lead from lavacagc.com chatbot',
      html: htmlBody,
    });

    if (error) {
      console.error('Failed to send lead notification email:', error);
      return NextResponse.json({ status: 'failed', error: error.message }, { status: 500 });
    }

    console.log(`✅ Lead notification email sent to alex@vacamoo.com (id: ${data?.id})`);
    return NextResponse.json({ status: 'sent', emailId: data?.id });
  } catch (error) {
    console.error('Notification endpoint error:', error);
    return NextResponse.json({ status: 'error', message: 'Internal server error' }, { status: 500 });
  }
}
