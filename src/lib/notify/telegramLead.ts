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
    `👤 <b>Name:</b> ${name || 'Not provided'}`,
  ];
  if (phone) lines.push(`📱 <b>Phone:</b> <code>${phone}</code>`);
  // Best-time line sits right under the phone number — it's the single most
  // decision-relevant field for whether to call *now* vs later.
  const timeLabel = formatContactTime(contactTimePreference);
  if (timeLabel) {
    const tzFlag = isTimezoneMismatch(contactTimezone)
      ? ` <i>(⚠️ customer on ${contactTimezone})</i>`
      : '';
    lines.push(`⏰ <b>Best time:</b> ${timeLabel}${tzFlag}`);
    if (contactTimePreference === 'specific' && contactTimeDetails) {
      lines.push(`   <i>"${contactTimeDetails}"</i>`);
    }
  }
  if (email) lines.push(`📧 <b>Email:</b> ${email}`);
  if (projectType) lines.push(`🏠 <b>Project:</b> ${projectType}`);
  if (location) lines.push(`📍 <b>Location:</b> ${location}`);
  if (estimate) lines.push(`💰 <b>Estimate:</b> $${Math.round(estimate).toLocaleString()}`);
  if (score !== undefined) lines.push(`⭐ <b>Score:</b> ${score}/100`);
  if (source) lines.push(`📊 <b>Source:</b> ${source}`);

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
