import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import {
  leadInstantAckHtml,
  lead24hHtml,
  lead48hHtml,
  lead7dHtml,
} from '@/lib/emailTemplates';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Send the instant acknowledgment email immediately via Resend.
 */
async function sendInstantAck(email: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ RESEND_API_KEY not configured — skipping instant ack email');
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: 'La Vaca General Contractors <info@email.lavaca.link>',
      to: [email],
      subject,
      html,
    });

    if (error) {
      console.error('Failed to send instant ack:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error sending instant ack:', err);
    return false;
  }
}

// Generate email subjects and HTML for follow-up sequence
function generateFollowUpEmails(name: string, projectType?: string) {
  const firstName = name.split(' ')[0] || name;
  const projectMention = projectType ? ` about your ${projectType} project` : '';

  return {
    instant_ack: {
      subject: `Thanks for reaching out, ${firstName}! — La Vaca General Contractors`,
      html: leadInstantAckHtml(name, projectType),
    },
    '24h': {
      subject: `Following up on your home renovation inquiry — La Vaca GC`,
      html: lead24hHtml(name, projectType),
    },
    '48h': {
      subject: `Your home renovation dreams — let's make them happen, ${firstName}`,
      html: lead48hHtml(name, projectType),
    },
    '7d': {
      subject: `Still thinking about your renovation? We're here when you're ready`,
      html: lead7dHtml(name),
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, source, projectType, leadId, estimateLeadId } = body as {
      name: string;
      email: string;
      phone?: string;
      source?: string;
      projectType?: string;
      leadId?: string;
      estimateLeadId?: string;
    };

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error(`Invalid email skipped: ${email}`);
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Check for existing follow-up sequence for this email (prevent duplicates)
    const { data: existingFollowUps } = await supabase
      .from('follow_up_queue')
      .select('id, status')
      .eq('lead_email', email)
      .in('status', ['pending', 'sent'])
      .limit(1);

    if (existingFollowUps && existingFollowUps.length > 0) {
      return NextResponse.json({
        status: 'skipped',
        reason: 'duplicate_email',
        message: 'Follow-up sequence already exists for this email',
      });
    }

    // Generate email templates
    const emails = generateFollowUpEmails(name, projectType);
    const now = new Date();

    // Create follow-up sequence
    const followUps = [
      {
        lead_id: leadId || null,
        estimate_lead_id: estimateLeadId || null,
        lead_email: email,
        lead_name: name,
        follow_up_type: 'instant_ack' as const,
        scheduled_at: now.toISOString(),
        status: 'pending' as const,
        email_subject: emails.instant_ack.subject,
        email_body: emails.instant_ack.html,
      },
      {
        lead_id: leadId || null,
        estimate_lead_id: estimateLeadId || null,
        lead_email: email,
        lead_name: name,
        follow_up_type: '24h' as const,
        scheduled_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending' as const,
        email_subject: emails['24h'].subject,
        email_body: emails['24h'].html,
      },
      {
        lead_id: leadId || null,
        estimate_lead_id: estimateLeadId || null,
        lead_email: email,
        lead_name: name,
        follow_up_type: '48h' as const,
        scheduled_at: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
        status: 'pending' as const,
        email_subject: emails['48h'].subject,
        email_body: emails['48h'].html,
      },
      {
        lead_id: leadId || null,
        estimate_lead_id: estimateLeadId || null,
        lead_email: email,
        lead_name: name,
        follow_up_type: '7d' as const,
        scheduled_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending' as const,
        email_subject: emails['7d'].subject,
        email_body: emails['7d'].html,
      },
    ];

    // Send the instant ack email immediately
    const instantSent = await sendInstantAck(email, emails.instant_ack.subject, emails.instant_ack.html);

    // Notify admin about the new lead
    const adminEmail = 'alex@vacamoo.com';
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const resendAdmin = new Resend(apiKey);
        await resendAdmin.emails.send({
          from: 'La Vaca General Contractors <info@email.lavaca.link>',
          to: [adminEmail],
          subject: `New Lead: ${name} — ${projectType || 'Home Renovation'}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; padding: 24px;">
              <h2 style="color: #1e293b; margin: 0 0 16px;">New Lead Received</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #64748b; width: 100px;">Name</td><td style="padding: 8px 0; font-weight: 600;">${name}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Email</td><td style="padding: 8px 0;"><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Phone</td><td style="padding: 8px 0;"><a href="tel:${phone || ''}">${phone || 'N/A'}</a></td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Project</td><td style="padding: 8px 0;">${projectType || 'Not specified'}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Source</td><td style="padding: 8px 0;">${source || 'Website'}</td></tr>
              </table>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;">
              <p style="color: #64748b; font-size: 13px; margin: 0;">Customer already received an instant acknowledgment email. Follow-up sequence is queued (24h, 48h, 7d).</p>
            </div>
          `,
        });
      }
    } catch (adminErr) {
      console.error('Failed to send admin notification:', adminErr);
    }

    // Mark instant_ack as sent if successful
    if (instantSent) {
      followUps[0].status = 'sent' as const;
    }

    const { data, error } = await supabase
      .from('follow_up_queue')
      .insert(followUps)
      .select('id, follow_up_type, scheduled_at');

    if (error) {
      console.error('Error creating follow-up sequence:', error);
      return NextResponse.json({ error: 'Failed to create follow-up sequence' }, { status: 500 });
    }

    return NextResponse.json({
      status: 'created',
      followUps: data,
      message: `Follow-up sequence created with ${data?.length || 0} emails`,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
