import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { cleanEnv } from '@/lib/envClean';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notify/form-error
 *
 * Centralized form-failure alert channel. Any server-side form pipeline that
 * fails (reCAPTCHA verification, DB insert, upstream service error, etc.)
 * should post to this endpoint so the site owner gets an instant alert via
 * Telegram + email. Designed to be low-noise: you only hear from it when
 * something is actually broken.
 *
 * Payload shape:
 *   {
 *     stage: string,          // "recaptcha" | "insert" | "notify" | "exception"
 *     source: string,         // form name, e.g. "contact_form"
 *     message: string,        // short human error summary
 *     details?: unknown,      // optional raw error payload (truncated in alerts)
 *     lead?: { name?, email?, phone? }  // optional lead context
 *   }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      stage = 'unknown',
      source = 'unknown',
      message = 'Unknown error',
      details,
      lead,
    } = body as {
      stage?: string;
      source?: string;
      message?: string;
      details?: unknown;
      lead?: { name?: string; email?: string; phone?: string };
    };

    const detailStr =
      details === undefined
        ? ''
        : typeof details === 'string'
          ? details
          : JSON.stringify(details);
    const truncatedDetails = detailStr.length > 500 ? detailStr.slice(0, 500) + '…' : detailStr;

    const results: Record<string, string> = {};

    // Telegram alert (if configured). Clean to survive dashboard paste artifacts.
    const botToken = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
    const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);
    if (botToken && chatId) {
      const lines = [
        `🚨 <b>FORM FAILURE</b>`,
        ``,
        `<b>Source:</b> ${source}`,
        `<b>Stage:</b> ${stage}`,
        `<b>Error:</b> ${message}`,
      ];
      if (lead?.name) lines.push(`<b>Lead:</b> ${lead.name}`);
      if (lead?.email) lines.push(`<b>Email:</b> ${lead.email}`);
      if (lead?.phone) lines.push(`<b>Phone:</b> <code>${lead.phone}</code>`);
      if (truncatedDetails) lines.push(``, `<pre>${escapeHtml(truncatedDetails)}</pre>`);
      lines.push(``, `⚠️ A visitor tried to submit a form and it failed. Fix ASAP.`);

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

    // Email alert (if configured). Clean to survive dashboard paste artifacts.
    const apiKey = cleanEnv(process.env.RESEND_API_KEY);
    if (apiKey) {
      try {
        const resend = new Resend(apiKey);
        const notificationEmail = cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || 'alex@vacamoo.com';

        const html = `
          <div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:8px">
            <h2 style="color:#c1121f;margin:0 0 16px">🚨 Form submission failed</h2>
            <p style="margin:0 0 8px"><strong>Source:</strong> ${escapeHtml(source)}</p>
            <p style="margin:0 0 8px"><strong>Stage:</strong> ${escapeHtml(stage)}</p>
            <p style="margin:0 0 8px"><strong>Error:</strong> ${escapeHtml(message)}</p>
            ${lead?.name ? `<p style="margin:0 0 8px"><strong>Lead name:</strong> ${escapeHtml(lead.name)}</p>` : ''}
            ${lead?.email ? `<p style="margin:0 0 8px"><strong>Lead email:</strong> ${escapeHtml(lead.email)}</p>` : ''}
            ${lead?.phone ? `<p style="margin:0 0 8px"><strong>Lead phone:</strong> ${escapeHtml(lead.phone)}</p>` : ''}
            ${truncatedDetails ? `<pre style="background:#f5f5f5;padding:12px;border-radius:4px;font-size:12px;overflow:auto">${escapeHtml(truncatedDetails)}</pre>` : ''}
            <p style="margin:16px 0 0;color:#666;font-size:13px">A visitor attempted a form submission and it failed on the server. Check <code>/api/health/forms</code> for config diagnostics.</p>
          </div>
        `;

        const { data, error } = await resend.emails.send({
          from: 'La Vaca Alerts <noreply@email.lavaca.link>',
          to: [notificationEmail],
          subject: `🚨 Form failure: ${source} (${stage})`,
          html,
        });
        results.email = error ? `failed:${error.message}` : `sent:${data?.id}`;
      } catch (err) {
        results.email = `exception:${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      results.email = 'skipped:not_configured';
    }

    return NextResponse.json({ status: 'ok', results });
  } catch (error) {
    console.error('form-error notify endpoint crashed:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
