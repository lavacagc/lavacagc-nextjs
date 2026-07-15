import { cleanEnv } from '@/lib/envClean';
import {
  formatContactTime,
  isTimezoneMismatch,
  type ContactTimePreference,
} from '@/lib/notify/formatContactTime';

export interface TelegramLeadPayload {
  name?: string;
  email?: string;
  phone?: string;
  projectType?: string;
  location?: string;
  score?: number;
  tier?: 'hot' | 'warm' | 'cold';
  source?: string;
  estimate?: number;
  contactTimePreference?: ContactTimePreference;
  contactTimeDetails?: string;
  contactTimezone?: string;
  /**
   * Requested service titles for a consolidated request (e.g. a Home Care
   * multi-task estimate). Rendered as one itemized block so the whole request
   * arrives as a single message instead of one alert per service.
   */
  services?: string[];
  /**
   * Saved home details ("My Home Systems") for the booked services - e.g.
   * "Water main shut-off: Basement, behind the stairs". Resolved server-side
   * from the homeowner's own records; internal to La Vaca so the crew arrives
   * knowing where things are.
   */
  homeDetails?: string[];
}

// Telegram parse_mode:'HTML' requires &, <, > in text to be escaped. A stray
// character in user-supplied data otherwise breaks parsing (the API rejects the
// whole message with 400, so the lead alert silently fails) or injects markup.
// Escape every user-controlled value before interpolating it.
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface TelegramLeadResult {
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
  message?: string;
  messageId?: number;
  error?: string;
}

/**
 * Dispatch a Telegram notification for a new lead.
 *
 * This runs in-process — do NOT wrap it in a self-fetch. On Vercel, self-fetches
 * to www.lavacagc.com get intercepted by Cloudflare's managed-challenge page
 * (HTTP 403 "Just a moment…") and silently fail.
 */
export async function sendTelegramLead(payload: TelegramLeadPayload): Promise<TelegramLeadResult> {
  const {
    name,
    email,
    phone,
    projectType,
    location,
    score,
    tier,
    source,
    estimate,
    contactTimePreference,
    contactTimeDetails,
    contactTimezone,
    services,
    homeDetails,
  } = payload;

  // Defensive clean — env values pasted in dashboards can carry stray whitespace,
  // real newlines, or literal backslash-n escape sequences.
  const botToken = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);

  if (!botToken || !chatId) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured — skipping Telegram notification');
    return {
      status: 'skipped',
      reason: 'not_configured',
      message: 'Telegram credentials not configured',
    };
  }

  let tierEmoji = '🔵';
  if (tier === 'hot') tierEmoji = '🔥';
  else if (tier === 'warm') tierEmoji = '🟡';

  const lines = [
    `${tierEmoji} <b>New ${tier?.toUpperCase() || 'LEAD'} Lead!</b>`,
    '',
    `👤 <b>Name:</b> ${name ? esc(name) : 'Not provided'}`,
  ];
  if (phone) lines.push(`📱 <b>Phone:</b> <code>${esc(phone)}</code>`);
  // Best-time line sits right under the phone number — it's the single most
  // decision-relevant field for whether to call *now* vs later.
  const timeLabel = formatContactTime(contactTimePreference);
  if (timeLabel) {
    const tzFlag = isTimezoneMismatch(contactTimezone)
      ? ` <i>(⚠️ customer on ${esc(contactTimezone || '')})</i>`
      : '';
    lines.push(`⏰ <b>Best time:</b> ${timeLabel}${tzFlag}`);
    if (contactTimePreference === 'specific' && contactTimeDetails) {
      lines.push(`   <i>"${esc(contactTimeDetails)}"</i>`);
    }
  }
  if (email) lines.push(`📧 <b>Email:</b> ${esc(email)}`);
  if (projectType) lines.push(`🏠 <b>Project:</b> ${esc(projectType)}`);
  // Itemized services for a consolidated request: one block listing every
  // service the customer picked, so a multi-service request is a single alert.
  if (services && services.length > 0) {
    lines.push(`🧰 <b>Services requested (${services.length}):</b>`);
    for (const s of services) lines.push(`   • ${esc(s)}`);
  }
  // Saved home details for the booked services (My Home Systems). Internal to
  // La Vaca - helps the crew arrive knowing where the shut-offs/panel are.
  if (homeDetails && homeDetails.length > 0) {
    lines.push(`🏡 <b>Home details for this visit (${homeDetails.length}):</b>`);
    for (const d of homeDetails) lines.push(`   • ${esc(d)}`);
  }
  if (location) lines.push(`📍 <b>Location:</b> ${esc(location)}`);
  if (estimate) lines.push(`💰 <b>Estimate:</b> $${Math.round(estimate).toLocaleString()}`);
  if (score !== undefined) lines.push(`⭐ <b>Score:</b> ${score}/100`);
  if (source) lines.push(`📊 <b>Source:</b> ${esc(source)}`);

  const message = lines.join('\n');
  const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      // Explicit outbound timeout so a slow/hung Telegram API can't keep the
      // socket open past the caller's race cap and leak a pending request.
      signal: AbortSignal.timeout(6000),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Telegram API error:', result);
      return {
        status: 'failed',
        error: result.description || 'Unknown Telegram API error',
      };
    }

    return { status: 'sent', messageId: result.result?.message_id };
  } catch (error) {
    console.error('Telegram notification error:', error);
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
