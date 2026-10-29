/**
 * The article Telegrams (docs/phase-2/acceptance-criteria.md, "Telegram
 * unpublish link"): one to the owner's chat when an article goes live without
 * him (Claude's publish route, the scheduled-publish cron), one when the
 * publish guard holds it, and one confirming a one-tap unpublish.
 *
 *   New article published: <title> <url>
 *   Unpublish: <signed link>
 *
 *   Article held for review: <title> <adminUrl>
 *   - <reason 1>
 *   - <reason 2>
 *   - <reason 3>
 *
 * The builders are pure (tests/articles-publish-guard.spec.ts checks the text
 * and the outgoing request with a mocked fetch). Sending goes through
 * sendTelegramMessage, which never throws and reports `not_configured` when
 * the bot is not set up, so a publish never fails on Telegram (TG4).
 *
 * Server-only.
 */
import { escapeTelegram, escapeTelegramClipped, sendTelegramMessage, type TelegramOutcome } from '@/lib/notify/telegramMessage';

/** Reasons shown in the held message; the rest are in the admin editor. */
export const HELD_REASONS_SHOWN = 3;
const TITLE_MAX = 300;
const REASON_MAX = 400;

export function publishedMessage(input: { title: string; url: string; unpublishUrl: string | null }): string {
  const lines = [`New article published: ${escapeTelegramClipped(input.title, TITLE_MAX)} ${escapeTelegram(input.url)}`];
  lines.push(input.unpublishUrl
    ? `Unpublish: ${escapeTelegram(input.unpublishUrl)}`
    // No INTERNAL_WEBHOOK_SECRET: no signed link can be minted.
    : 'Unpublish: no one-tap link (INTERNAL_WEBHOOK_SECRET is not set); use the admin.');
  return lines.join('\n');
}

export function heldMessage(input: { title: string; adminUrl: string; reasons: string[] }): string {
  const shown = input.reasons.slice(0, HELD_REASONS_SHOWN).map((r) => `- ${escapeTelegramClipped(r, REASON_MAX)}`);
  const more = input.reasons.length - shown.length;
  return [
    `Article held for review: ${escapeTelegramClipped(input.title, TITLE_MAX)} ${escapeTelegram(input.adminUrl)}`,
    ...shown,
    ...(more > 0 ? [`(${more} more in the admin)`] : []),
  ].join('\n');
}

export function unpublishedMessage(input: { title: string; url: string }): string {
  return `Article unpublished: ${escapeTelegramClipped(input.title, TITLE_MAX)} ${escapeTelegram(input.url)}`;
}

export function notifyArticlePublished(input: { title: string; url: string; unpublishUrl: string | null }): Promise<TelegramOutcome> {
  return sendTelegramMessage(publishedMessage(input));
}

export function notifyArticleHeld(input: { title: string; adminUrl: string; reasons: string[] }): Promise<TelegramOutcome> {
  return sendTelegramMessage(heldMessage(input));
}

export function notifyArticleUnpublished(input: { title: string; url: string }): Promise<TelegramOutcome> {
  return sendTelegramMessage(unpublishedMessage(input));
}
