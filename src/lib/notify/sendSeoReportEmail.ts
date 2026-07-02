import { cleanEnv } from '@/lib/envClean';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
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
  // Reuse the same owner recipient as lead notifications, overridable.
  const to = cleanEnv(process.env.SEO_REPORT_EMAIL) || cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || 'alex@vacamoo.com';
  const { subject, html, text } = renderSeoReportEmail(report);

  return sendTrackedEmail({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    text,
    category: 'seo_report',
  });
}
