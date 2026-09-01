import { newLeadNotificationHtml } from '@/lib/emailTemplates';
import { cleanEnv } from '@/lib/envClean';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
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
  /** Requested service titles for a consolidated request (itemized in the email). */
  services?: string[];
  /**
   * Saved home details ("My Home Systems") for the booked services, itemized in
   * the email. Internal to La Vaca; resolved server-side from the homeowner's
   * own records.
   */
  homeDetails?: string[];
  /** Lead row id, for linking the audit row back to the lead. */
  leadId?: string | null;
  /** The middleware's geo reading for this submission (Phase A telemetry). */
  geoTier?: string;
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
    services,
    homeDetails,
    leadId,
    geoTier,
  } = payload;

  const notificationEmail = cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || 'alex@vacamoo.com';

  // Append a short time hint to the subject for hot leads so the info lands
  // in phone notification previews without opening. We skip it for warm/cold
  // to keep subject lines tight when the urgency isn't there.
  const shortTime = formatContactTimeShort(contactTimePreference);
  const subjectTimeSuffix = tier === 'hot' && shortTime ? ` — call ${shortTime}` : '';

  return sendTrackedEmail({
    from: 'La Vaca Leads <noreply@email.lavaca.link>',
    to: notificationEmail,
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
      services,
      homeDetails,
      geoTier,
    }),
    category: 'lead_notification',
    leadId: leadId ?? null,
  });
}
