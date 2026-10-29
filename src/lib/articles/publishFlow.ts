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
import { checkPublishable, type PublishCandidate, type PublishFacts, type PublishVerdict } from './publishGuard';
import { loadCatalogPrices } from './catalogPrices';
import { notifyArticleHeld, notifyArticlePublished } from './notify';
import { isTokenCurrent, readUnpublishToken, signUnpublishToken, unpublishLink } from './unpublishToken';
import { getArticle, loadContentFacts, type ArticleRow } from './writer';
import type { TelegramOutcome } from '@/lib/notify/telegramMessage';
import type { Fact } from '@/lib/seo/draftGuardrails';

/** What the guard reads: the locked facts and the catalog's published prices. */
export async function loadPublishFacts(contentFacts?: Fact[]): Promise<PublishFacts> {
  const [facts, catalogPrices] = await Promise.all([contentFacts ?? loadContentFacts(), loadCatalogPrices()]);
  return { contentFacts: facts, catalogPrices };
}

/** The guard with its inputs loaded; pass `contentFacts` when the caller already read them. */
export async function runPublishGuard(candidate: PublishCandidate, contentFacts?: Fact[]): Promise<PublishVerdict> {
  return checkPublishable(candidate, await loadPublishFacts(contentFacts));
}

/** The signed one-tap link for this publication, or null without INTERNAL_WEBHOOK_SECRET. */
export function unpublishUrlFor(origin: string, live: Pick<ArticleRow, 'id' | 'published_at' | 'publish_nonce'>): string | null {
  if (!live.published_at || !live.publish_nonce) return null;
  const token = signUnpublishToken({ id: live.id, published_at: live.published_at, publish_nonce: live.publish_nonce });
  return token ? unpublishLink(origin, token) : null;
}

export async function announcePublished(
  origin: string,
  live: Pick<ArticleRow, 'id' | 'title' | 'slug' | 'published_at' | 'publish_nonce'>,
  social: { caption: string; file: string } | null = null,
): Promise<{ telegram: TelegramOutcome; unpublishUrl: string | null }> {
  const unpublishUrl = unpublishUrlFor(origin, live);
  const telegram = await notifyArticlePublished({
    title: live.title,
    url: `${origin.replace(/\/+$/, '')}/blog/${live.slug}`,
    unpublishUrl,
    social,
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
