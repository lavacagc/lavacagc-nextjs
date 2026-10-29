/**
 * The publish guard wired to its inputs and its notices, shared by every path
 * that can make a post live (the planner's rule: the guard runs on every
 * publish path, not only Claude's):
 *
 *   - POST /api/articles/ingest/<id>/publish   Claude (token) - Telegram on publish and hold
 *   - POST /api/admin/articles/<id>/publish    the admin editor and list - inline, no Telegram
 *   - GET  /api/cron/publish                   scheduled posts - Telegram on publish and hold
 *
 * Server-only.
 */
import { checkPublishable, type PublishCandidate, type PublishVerdict } from './publishGuard';
import { loadCatalogPrices } from './catalogPrices';
import { notifyArticleHeld, notifyArticlePublished } from './notify';
import { isTokenCurrent, readUnpublishToken, signUnpublishToken, unpublishLink } from './unpublishToken';
import { getArticle, loadContentFacts, type ArticleRow } from './writer';
import type { TelegramOutcome } from '@/lib/notify/telegramMessage';

export async function runPublishGuard(candidate: PublishCandidate): Promise<PublishVerdict> {
  const [contentFacts, catalogPrices] = await Promise.all([loadContentFacts(), loadCatalogPrices()]);
  return checkPublishable(candidate, { contentFacts, catalogPrices });
}

/** The signed one-tap link for this publication, or null without INTERNAL_WEBHOOK_SECRET. */
export function unpublishUrlFor(origin: string, live: Pick<ArticleRow, 'id' | 'published_at'>): string | null {
  if (!live.published_at) return null;
  const token = signUnpublishToken(live.id, live.published_at);
  return token ? unpublishLink(origin, token) : null;
}

export async function announcePublished(
  origin: string,
  live: Pick<ArticleRow, 'id' | 'title' | 'slug' | 'published_at'>,
): Promise<{ telegram: TelegramOutcome; unpublishUrl: string | null }> {
  const unpublishUrl = unpublishUrlFor(origin, live);
  const telegram = await notifyArticlePublished({
    title: live.title,
    url: `${origin.replace(/\/+$/, '')}/blog/${live.slug}`,
    unpublishUrl,
  });
  return { telegram, unpublishUrl };
}

export function announceHeld(
  origin: string,
  post: Pick<ArticleRow, 'id' | 'title'>,
  reasons: string[],
): Promise<TelegramOutcome> {
  return notifyArticleHeld({
    title: post.title,
    adminUrl: `${origin.replace(/\/+$/, '')}/vaca-mgmt?tab=blog&post=${post.id}`,
    reasons,
  });
}

/**
 * The live post a one-tap unpublish link still controls, or null: a bad or
 * expired signature, an unknown post, a post already taken down, or one
 * published again since the link was minted (TG2). The signature is checked
 * before any database read, so a guessed token costs one HMAC.
 */
export async function postForUnpublishToken(token: string): Promise<ArticleRow | null> {
  const reading = readUnpublishToken(token);
  if (!reading.ok) return null;
  const post = await getArticle(reading.postId);
  if (!post || !isTokenCurrent(reading, post)) return null;
  return post;
}
