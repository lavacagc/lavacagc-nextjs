import { createClient } from '@supabase/supabase-js';
import {
  leadInstantAckHtml,
  lead24hHtml,
  lead48hHtml,
  lead7dHtml,
} from '@/lib/emailTemplates';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { cleanEnv } from '@/lib/envClean';
import { normalizeEmail } from '@/lib/preferences/preferences';
import { LEAD_NURTURE_FOLLOW_UP_TYPES } from '@/lib/notify/cancelFollowUps';

const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';

/**
 * Visible "unsubscribe from these follow-ups" link baked into each follow-up
 * email body (CAN-SPAM). Points at the /unsub page in follow-ups mode, which
 * turns off ONLY the transactional follow_ups opt-out — never marketing streams.
 */
function followUpUnsubUrl(email: string): string {
  return `${SITE_URL}/unsub?stream=follow_ups&email=${encodeURIComponent(normalizeEmail(email))}`;
}

export interface LeadFollowUpPayload {
  name: string;
  email: string;
  phone?: string;
  source?: string;
  projectType?: string;
  leadId?: string;
  estimateLeadId?: string;
}

export interface LeadFollowUpResult {
  status: 'created' | 'skipped' | 'invalid' | 'error';
  reason?: string;
  message?: string;
  followUps?: Array<{ id: string; follow_up_type: string; scheduled_at: string }>;
  error?: string;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function sendInstantAck(
  email: string,
  subject: string,
  html: string,
  opts: { name?: string; leadId?: string | null } = {},
): Promise<boolean> {
  const result = await sendTrackedEmail({
    from: 'La Vaca General Contractors <info@email.lavaca.link>',
    to: email,
    subject,
    html,
    category: 'lead_followup',
    toName: opts.name ?? null,
    leadId: opts.leadId ?? null,
    campaign: { follow_up_type: 'instant_ack' },
    // Transactional, but commercial in purpose: honor the follow-ups opt-out and
    // attach a one-click List-Unsubscribe header. A general marketing unsub does
    // NOT reach this (follow_ups is not a marketing stream).
    preferenceStream: 'follow_ups',
  });
  return result.status === 'sent';
}

function generateFollowUpEmails(name: string, projectType: string | undefined, unsubscribeUrl: string) {
  const firstName = name.split(' ')[0] || name;
  return {
    instant_ack: {
      subject: `Thanks for reaching out, ${firstName}! — La Vaca General Contractors`,
      html: leadInstantAckHtml(name, projectType, unsubscribeUrl),
    },
    '24h': {
      subject: `Following up on your home renovation inquiry — La Vaca GC`,
      html: lead24hHtml(name, projectType, unsubscribeUrl),
    },
    '48h': {
      subject: `Your home renovation dreams — let's make them happen, ${firstName}`,
      html: lead48hHtml(name, projectType, unsubscribeUrl),
    },
    '7d': {
      subject: `Still thinking about your renovation? We're here when you're ready`,
      html: lead7dHtml(name, unsubscribeUrl),
    },
  };
}

/**
 * Create a 4-stage follow-up email sequence for a new lead and send the instant ack.
 *
 * Runs in-process — do NOT self-fetch. See note in telegramLead.ts.
 */
export async function createLeadFollowUpSequence(
  payload: LeadFollowUpPayload
): Promise<LeadFollowUpResult> {
  try {
    const { name, email, projectType, leadId, estimateLeadId } = payload;

    if (!name || !email) {
      return { status: 'invalid', error: 'Name and email required' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error(`Invalid email skipped: ${email}`);
      return { status: 'invalid', error: 'Invalid email format' };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // "Has this lead already been through the nurture drip?" - scoped to the
    // drip's OWN types, because `follow_up_queue` is shared. Type-blind, this
    // read also saw a post-job review request and a night-before visit reminder,
    // and rows stay 'sent' forever: a service customer the admin booked by hand
    // who later submitted the website form was silently skipped here, so their
    // acknowledgement email never went out and `duplicate_email` in the log was
    // the only trace.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingFollowUps } = await (supabase.from as any)('follow_up_queue')
      .select('id, status')
      .eq('lead_email', email)
      .in('follow_up_type', LEAD_NURTURE_FOLLOW_UP_TYPES)
      .in('status', ['pending', 'sent'])
      .limit(1);

    if (existingFollowUps && existingFollowUps.length > 0) {
      return {
        status: 'skipped',
        reason: 'duplicate_email',
        message: 'Follow-up sequence already exists for this email',
      };
    }

    const emails = generateFollowUpEmails(name, projectType, followUpUnsubUrl(email));
    const now = new Date();

    const followUps: Array<{
      lead_id: string | null;
      estimate_lead_id: string | null;
      lead_email: string;
      lead_name: string;
      follow_up_type: string;
      scheduled_at: string;
      status: string;
      email_subject: string;
      email_body: string;
    }> = [
      {
        lead_id: leadId || null,
        estimate_lead_id: estimateLeadId || null,
        lead_email: email,
        lead_name: name,
        follow_up_type: 'instant_ack',
        scheduled_at: now.toISOString(),
        status: 'pending',
        email_subject: emails.instant_ack.subject,
        email_body: emails.instant_ack.html,
      },
      {
        lead_id: leadId || null,
        estimate_lead_id: estimateLeadId || null,
        lead_email: email,
        lead_name: name,
        follow_up_type: '24h',
        scheduled_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        email_subject: emails['24h'].subject,
        email_body: emails['24h'].html,
      },
      {
        lead_id: leadId || null,
        estimate_lead_id: estimateLeadId || null,
        lead_email: email,
        lead_name: name,
        follow_up_type: '48h',
        scheduled_at: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        email_subject: emails['48h'].subject,
        email_body: emails['48h'].html,
      },
      {
        lead_id: leadId || null,
        estimate_lead_id: estimateLeadId || null,
        lead_email: email,
        lead_name: name,
        follow_up_type: '7d',
        scheduled_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        email_subject: emails['7d'].subject,
        email_body: emails['7d'].html,
      },
    ];

    const instantSent = await sendInstantAck(email, emails.instant_ack.subject, emails.instant_ack.html, {
      name,
      leadId: leadId || null,
    });
    if (instantSent) followUps[0].status = 'sent';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from as any)('follow_up_queue')
      .insert(followUps)
      .select('id, follow_up_type, scheduled_at');

    if (error) {
      console.error('Error creating follow-up sequence:', error);
      return { status: 'error', error: 'Failed to create follow-up sequence' };
    }

    return {
      status: 'created',
      followUps: data,
      message: `Follow-up sequence created with ${data?.length || 0} emails`,
    };
  } catch (error) {
    console.error('Follow-up sequence error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
