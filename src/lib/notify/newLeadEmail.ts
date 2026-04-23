import { Resend } from 'resend';
import { newLeadNotificationHtml } from '@/lib/emailTemplates';
import { cleanEnv } from '@/lib/envClean';
import {
  formatContactTimeShort,
  type ContactTimePreference,
} from '@/lib/notify/formatContactTime';

export interface NewLeadEmailPayload {
  name?: string;
  email?: string;
  phone?: string;
  projectType?: string;
  location?: string;
  source?: string;
  tier?: 'hot' | 'warm' | 'cold';
  contactTimePreference?: ContactTimePreference;
  contactTimeDetails?: string;
  contactTimezone?: string;
}

export interface NewLeadEmailResult {
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
  emailId?: string;
  error?: string;
}

/**
 * Send the "new lead captured" notification email to the site owner.
 *
 * Runs in-process — do NOT self-fetch. See note in telegramLead.ts.
 */
export async function sendNewLeadEmail(payload: NewLeadEmailPayload): Promise<NewLeadEmailResult> {
  const {
    name,
    email,
    phone,
    projectType,
    location,
    source,
    tier,
    contactTimePreference,
    contactTimeDetails,
    contactTimezone,
  } = payload;

  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) {
    console.warn('⚠️ RESEND_API_KEY not configured — skipping lead notification email');
    return { status: 'skipped', reason: 'no_api_key' };
  }

  const notificationEmail = cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || 'alex@vacamoo.com';

  // Append a short time hint to the subject for hot leads so the info lands
  // in phone notification previews without opening. We skip it for warm/cold
  // to keep subject lines tight when the urgency isn't there.
  const shortTime = formatContactTimeShort(contactTimePreference);
  const subjectTimeSuffix = tier === 'hot' && shortTime ? ` — call ${shortTime}` : '';

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: 'La Vaca Leads <noreply@email.lavaca.link>',
      to: [notificationEmail],
      subject: `🔥 New Lead: ${name || 'Unknown'} — ${projectType || 'General Inquiry'}${subjectTimeSuffix}`,
      html: newLeadNotificationHtml({
        name,
        email,
        phone,
        projectType,
        location,
        source,
        contactTimePreference,
        contactTimeDetails,
        contactTimezone,
      }),
    });

    if (error) {
      console.error('Failed to send lead notification email:', error);
      return { status: 'failed', error: error.message };
    }

    return { status: 'sent', emailId: data?.id };
  } catch (err) {
    console.error('New-lead email error:', err);
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
