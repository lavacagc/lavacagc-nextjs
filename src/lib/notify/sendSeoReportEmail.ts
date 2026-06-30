import { Resend } from 'resend';
import { cleanEnv } from '@/lib/envClean';
import { renderSeoReportEmail } from '@/lib/seo/reportEmail';
import type { SeoReport } from '@/lib/seo/report';

/**
 * Weekly SEO Observer digest email.
 *
 * Internal/system mail (inbox furniture for the owner), so it uses the
 * `noreply@` identity per the email-from-address convention — not the warm
 * customer-facing `alex@` identity.
 *
 * Runs in-process — do NOT self-fetch. See note in telegramLead.ts.
 */

export interface SeoReportEmailResult {
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
  emailId?: string;
  error?: string;
}

const FROM_ADDRESS = 'La Vaca SEO <noreply@email.lavaca.link>';

export async function sendSeoReportEmail(report: SeoReport): Promise<SeoReportEmailResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) {
    console.warn('⚠️ RESEND_API_KEY not configured — skipping SEO report email');
    return { status: 'skipped', reason: 'no_api_key' };
  }

  // Reuse the same owner recipient as lead notifications, overridable.
  const to = cleanEnv(process.env.SEO_REPORT_EMAIL) || cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || 'alex@vacamoo.com';
  const { subject, html, text } = renderSeoReportEmail(report);

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from: FROM_ADDRESS, to: [to], subject, html, text });
    if (error) {
      console.error('Failed to send SEO report email:', error);
      return { status: 'failed', error: error.message };
    }
    return { status: 'sent', emailId: data?.id };
  } catch (err) {
    console.error('SEO report email error:', err);
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
