/**
 * The signed one-tap unpublish link sent with every "New article published"
 * Telegram (docs/phase-2/acceptance-criteria.md, "Telegram unpublish link").
 *
 *   token = base64url(postId + "." + publishedAtUnix) + "." + base64url(HMAC-SHA256(that, INTERNAL_WEBHOOK_SECRET))
 *
 * It is valid for 7 days from the publish it was minted for, and only while
 * the post is still live with that same `published_at`: once it is
 * unpublished the link is spent, and a later republish stamps a new
 * `published_at`, so an old link can never take down the new publication.
 *
 * No secret, or one under 32 characters, means no link is minted and every
 * link is refused (fail closed, the CM-11 rule). The signature is compared
 * with timingSafeEqual (SEC2).
 *
 * Server-only (node:crypto). Pure apart from the env read, which callers can
 * override, so tests/articles-publish-guard.spec.ts covers it without a server.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const UNPUBLISH_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MIN_UNPUBLISH_SECRET_LENGTH = 32;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function unpublishSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.INTERNAL_WEBHOOK_SECRET?.trim();
  return secret && secret.length >= MIN_UNPUBLISH_SECRET_LENGTH ? secret : null;
}

/** Whole seconds, the precision the token carries. */
export function publishedAtUnix(publishedAt: string | Date): number {
  return Math.floor(new Date(publishedAt).getTime() / 1000);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** The token for this publish, or null when no secret is configured. */
export function signUnpublishToken(postId: string, publishedAt: string | Date, secret = unpublishSecret()): string | null {
  if (!secret) return null;
  const payload = Buffer.from(`${postId}.${publishedAtUnix(publishedAt)}`, 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export type TokenReading =
  | { ok: true; postId: string; publishedAtUnix: number }
  | { ok: false; reason: 'disabled' | 'malformed' | 'bad_signature' | 'expired' };

/**
 * Check the signature and the 7-day window. Whether the post is still live
 * with this `published_at` is the caller's second check (`isTokenCurrent`),
 * because it needs the row.
 */
export function readUnpublishToken(token: string, nowMs = Date.now(), secret = unpublishSecret()): TokenReading {
  if (!secret) return { ok: false, reason: 'disabled' };
  if (typeof token !== 'string' || token.length > 300) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [payload, signature] = parts;

  const expected = Buffer.from(sign(payload, secret), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad_signature' };

  const decoded = Buffer.from(payload, 'base64url').toString('utf8');
  const m = /^([0-9a-f-]{36})\.(\d{1,12})$/i.exec(decoded);
  if (!m || !UUID.test(m[1])) return { ok: false, reason: 'malformed' };
  const at = Number(m[2]);
  if (nowMs / 1000 > at + UNPUBLISH_LINK_TTL_SECONDS) return { ok: false, reason: 'expired' };
  return { ok: true, postId: m[1], publishedAtUnix: at };
}

/** Still the publication the link was minted for: live, with the same `published_at`. */
export function isTokenCurrent(
  reading: { publishedAtUnix: number },
  post: { published: boolean; published_at: string | null },
): boolean {
  return post.published && !!post.published_at && publishedAtUnix(post.published_at) === reading.publishedAtUnix;
}

export function unpublishLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/articles/unpublish/${token}`;
}
