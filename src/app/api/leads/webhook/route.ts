import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = "https://xrvbrnrbnyfdwkfdoepq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhydmJybnJibnlmZHdrZmRvZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIyNTAsImV4cCI6MjA3NDM0ODI1MH0.TL9cUCyaApPjWl8YEW455JgCUSa6S2qsoRpZ8iATl10";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Email templates for follow-up sequence
function generateFollowUpEmails(name: string, projectType?: string) {
  const firstName = name.split(' ')[0] || name;
  const projectMention = projectType
    ? ` about your ${projectType} project`
    : '';

  return {
    instant_ack: {
      subject: `Thanks for reaching out, ${firstName}! — La Vaca General Contractors`,
      body: `Hi ${firstName},

Thank you for contacting La Vaca General Contractors${projectMention}! We're excited to learn more about what you have in mind.

One of our team members will be reaching out to you shortly to discuss your project and schedule a free estimate at your convenience.

In the meantime, feel free to:
• Browse our portfolio: lavacagc.com/portfolio
• Learn about our process: lavacagc.com/process
• Call us directly: (201) 212-4917

We look forward to working with you!

Best regards,
The La Vaca Team
Licensed, Bonded, & Insured | HIC# 13VH13373800`,
    },
    '24h': {
      subject: `Following up on your home renovation inquiry — La Vaca GC`,
      body: `Hi ${firstName},

Just wanted to follow up on your recent inquiry${projectMention}. We know choosing the right contractor is a big decision, and we're here to make the process as smooth as possible.

Here's what makes working with La Vaca different:
• Dedicated project manager for your project
• Transparent pricing with no hidden costs
• Warranty-backed craftsmanship
• 5.0 Google Rating from homeowners like you

Would you like to schedule a free, no-obligation estimate? Just reply to this email or call us at (201) 212-4917.

We'd love to help bring your vision to life!

Best regards,
The La Vaca Team`,
    },
    '48h': {
      subject: `Your home renovation dreams — let's make them happen, ${firstName}`,
      body: `Hi ${firstName},

We hope we're not being a bother! We just wanted to make sure you saw our previous messages${projectMention}.

Here's what one of our recent clients had to say:
"Unbelievably communicative and transparent... The final result is beyond anything we could have imagined." — Gerrick K.

If you're still exploring options, we'd be happy to provide a free estimate and answer any questions. No pressure at all — just reply to this email or give us a call at (201) 212-4917.

Wishing you the best with your project!

Warm regards,
The La Vaca Team
Family-Owned & Operated in Northern NJ`,
    },
    '7d': {
      subject: `Still thinking about your renovation? We're here when you're ready`,
      body: `Hi ${firstName},

It's been about a week since you reached out, and we just wanted to let you know — we're here whenever you're ready!

Home renovations are a big step, and we understand it takes time to plan. Whether you're ready to move forward or just have questions, our team is always happy to chat.

• Free estimates: No commitment required
• Portfolio: See our latest work at lavacagc.com/portfolio
• Call anytime: (201) 212-4917
• Email: info@lavacagc.com

We'll leave the ball in your court from here. Wishing you all the best, ${firstName}!

Best regards,
The La Vaca Team`,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, source, projectType, leadId, estimateLeadId } = body as {
      name: string;
      email: string;
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
      console.log(`Follow-up sequence already exists for ${email}, skipping duplicate`);
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
        email_body: emails.instant_ack.body,
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
        email_body: emails['24h'].body,
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
        email_body: emails['48h'].body,
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
        email_body: emails['7d'].body,
      },
    ];

    const { data, error } = await supabase
      .from('follow_up_queue')
      .insert(followUps)
      .select('id, follow_up_type, scheduled_at');

    if (error) {
      console.error('Error creating follow-up sequence:', error);
      return NextResponse.json({ error: 'Failed to create follow-up sequence' }, { status: 500 });
    }

    console.log(`✅ Follow-up sequence created for ${name} (${email}) from ${source || 'unknown'}`);
    console.log(`   ${data?.length || 0} follow-ups scheduled`);

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
