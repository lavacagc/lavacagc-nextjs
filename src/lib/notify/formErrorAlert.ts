import { cleanEnv } from '@/lib/envClean';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';

export interface FormErrorAlertPayload {
  stage?: string;
  source?: string;
  message?: string;
  details?: unknown;
  lead?: { name?: string; email?: string; phone?: string };
  /**
   * 'failure' (default): the submission was lost - fix ASAP.
   * 'warning': the lead WAS saved, but something needs attention (e.g. a form
   * sent non-standard values that were auto-corrected before insert).
   */
  severity?: 'failure' | 'warning';
}

export interface FormErrorAlertResult {
  status: 'ok' | 'error';
  results?: Record<string, string>;
  message?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Dispatch a form-failure alert via Telegram + email.
 *
 * Runs in-process — do NOT self-fetch. See note in telegramLead.ts.
 * Never throws; callers can fire-and-await without try/catch.
 */
export async function sendFormFailureAlert(payload: FormErrorAlertPayload): Promise<FormErrorAlertResult> {
  try {
    const {
      stage = 'unknown',
      source = 'unknown',
      message = 'Unknown error',
      details,
      lead,
      severity = 'failure',
    } = payload;
    const isFailure = severity === 'failure';

    const detailStr =
      details === undefined
        ? ''
        : typeof details === 'string'
          ? details
          : JSON.stringify(details);
    const truncatedDetails = detailStr.length > 500 ? detailStr.slice(0, 500) + '…' : detailStr;

    const results: Record<string, string> = {};

    const botToken = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
    const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);
    if (botToken && chatId) {
      const lines = [
        isFailure ? `🚨 <b>FORM FAILURE</b>` : `⚠️ <b>FORM WARNING</b>`,
        ``,
        `<b>Source:</b> ${source}`,
        `<b>Stage:</b> ${stage}`,
        `<b>${isFailure ? 'Error' : 'Issue'}:</b> ${message}`,
      ];
      if (lead?.name) lines.push(`<b>Lead:</b> ${lead.name}`);
      if (lead?.email) lines.push(`<b>Email:</b> ${lead.email}`);
      if (lead?.phone) lines.push(`<b>Phone:</b> <code>${lead.phone}</code>`);
      if (truncatedDetails) lines.push(``, `<pre>${escapeHtml(truncatedDetails)}</pre>`);
      lines.push(
        ``,
        isFailure
          ? `⚠️ A visitor tried to submit a form and it failed. Fix ASAP.`
          : `✅ The lead WAS saved, but a form is sending non-standard data. Worth a look.`
      );

      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: lines.join('\n'),
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        });
        results.telegram = res.ok ? 'sent' : `failed:${res.status}`;
      } catch (err) {
        results.telegram = `exception:${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      results.telegram = 'skipped:not_configured';
    }

    const apiKey = cleanEnv(process.env.RESEND_API_KEY);
    if (apiKey) {
      try {
        const notificationEmail = cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || 'alex@vacamoo.com';

        const html = `
          <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:8px">
            <h2 style="color:${isFailure ? '#c1121f' : '#b45309'};margin:0 0 16px">${isFailure ? '🚨 Form submission failed' : '⚠️ Form data auto-corrected'}</h2>
            <p style="margin:0 0 8px"><strong>Source:</strong> ${escapeHtml(source)}</p>
            <p style="margin:0 0 8px"><strong>Stage:</strong> ${escapeHtml(stage)}</p>
            <p style="margin:0 0 8px"><strong>${isFailure ? 'Error' : 'Issue'}:</strong> ${escapeHtml(message)}</p>
            ${lead?.name ? `<p style="margin:0 0 8px"><strong>Lead name:</strong> ${escapeHtml(lead.name)}</p>` : ''}
            ${lead?.email ? `<p style="margin:0 0 8px"><strong>Lead email:</strong> ${escapeHtml(lead.email)}</p>` : ''}
            ${lead?.phone ? `<p style="margin:0 0 8px"><strong>Lead phone:</strong> ${escapeHtml(lead.phone)}</p>` : ''}
            ${truncatedDetails ? `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;font-size:12px;overflow:auto">${escapeHtml(truncatedDetails)}</pre>` : ''}
            <p style="margin:16px 0 0;color:#666;font-size:13px">${
              isFailure
                ? 'A visitor attempted a form submission and it failed on the server. Check <code>/api/health/forms</code> for config diagnostics.'
                : 'The lead WAS saved - but a form is sending non-standard values that had to be auto-corrected before insert. Details above.'
            }</p>
          </div>
        `;

        const sendResult = await sendTrackedEmail({
          from: 'La Vaca Alerts <noreply@email.lavaca.link>',
          to: notificationEmail,
          subject: isFailure
            ? `🚨 Form failure: ${source} (${stage})`
            : `⚠️ Form warning: ${source} (${stage})`,
          html,
          category: 'form_error',
        });
        results.email =
          sendResult.status === 'sent'
            ? `sent:${sendResult.emailId}`
            : `failed:${sendResult.error ?? sendResult.status}`;
      } catch (err) {
        results.email = `exception:${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      results.email = 'skipped:not_configured';
    }

    return { status: 'ok', results };
  } catch (error) {
    console.error('form-error alert helper crashed:', error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
