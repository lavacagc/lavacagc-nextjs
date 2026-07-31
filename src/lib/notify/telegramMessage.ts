/**
 * Send one Telegram message to the operations chat.
 *
 * There is ONE chat: `TELEGRAM_CHAT_ID`, which is the owner's direct chat and
 * already carries new-lead and form-error alerts. The crew is deliberately not
 * on Telegram - a bot cannot message somebody who has never messaged it first,
 * so per-person notifications would silently reach nobody until each crew member
 * opened the bot. The escalation therefore reaches the OWNER, who chases the
 * crew, which is what happens today anyway.
 *
 * Runs in-process. Do NOT self-fetch - see the note in telegramLead.ts.
 */
import { cleanEnv } from '@/lib/envClean';

export type TelegramOutcome = 'sent' | 'not_configured' | 'failed';

/** Escape the three characters Telegram's HTML parse mode treats as markup. */
export function escapeTelegram(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendTelegramMessage(text: string): Promise<TelegramOutcome> {
  // Defensive clean - env values pasted into dashboards carry stray whitespace
  // and literal backslash-n escapes.
  const botToken = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);
  if (!botToken || !chatId) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured — skipping Telegram message');
    return 'not_configured';
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      // Explicit outbound timeout so a hung Telegram API cannot hold the
      // function open past its duration cap.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.error('Telegram API error:', await res.text().catch(() => res.status));
      return 'failed';
    }
    return 'sent';
  } catch (err) {
    console.error('Telegram send failed:', err instanceof Error ? err.message : String(err));
    return 'failed';
  }
}
