/**
 * The signed one-tap unpublish link sent with every "New article published"
 * Telegram (docs/phase-2/acceptance-criteria.md, "Telegram unpublish link").
 *
 *   token = base64url(postId + "." + publishedAtUnix + "." + publishNonce)
 *           + "." + base64url(HMAC-SHA256(that, INTERNAL_WEBHOOK_SECRET))
 *
 * The contract's token is `postId.publishedAtUnix`; the nonce is added
 * (slice G review, fix 2). `published_at` in whole seconds could not tell two
 * publications apart when an unpublish and a republish landed in the same
 * second, which revived a spent link. Every draft-to-live publish stamps a
 * fresh random `publish_nonce` on the post, so a link is valid only for the
 * publication it was minted for, whatever the clock says.
 *
 * Valid 7 days from that publish, and only while the post is still live with
 * that same nonce: once it is unpublished the link is spent, and a later
 * republish retires it.
 *
 * No secret, or one under 32 characters, means no link is minted and every
 * link is refused (fail closed, the CM-11 rule). The signature is compared
 * with timingSafeEqual (SEC2).
 *
 * Server-only (node:crypto). Pure apart from the env read, which callers can
 * override, so tests/articles-publish-guard.spec.ts covers it without a server.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MIN_ONE_TAP_LINK_SECRET_LENGTH, oneTapLinkSecret } from '../oneTapLinkSecret';

export const UNPUBLISH_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MIN_UNPUBLISH_SECRET_LENGTH = MIN_ONE_TAP_LINK_SECRET_LENGTH;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE = /^[A-Za-z0-9_-]{8,64}$/;

export function unpublishSecret(env: Record<string, string | undefined> = process.env): string | null {
  return oneTapLinkSecret(env);
}

/** Whole seconds, the precision the token carries for its 7-day window. */
export function publishedAtUnix(publishedAt: string | Date): number {
  return Math.floor(new Date(publishedAt).getTime() / 1000);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** The publication a link is minted for: the post, when it went live, and its nonce. */
export interface Publication {
  id: string;
  published_at: string | Date;
  publish_nonce: string;
}

/** The token for this publication, or null when no secret is configured or the nonce is unusable. */
export function signUnpublishToken(publication: Publication, secret = unpublishSecret()): string | null {
  if (!secret || !NONCE.test(publication.publish_nonce)) return null;
  const raw = `${publication.id}.${publishedAtUnix(publication.published_at)}.${publication.publish_nonce}`;
  const payload = Buffer.from(raw, 'utf8').toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export type TokenReading =
  | { ok: true; postId: string; publishedAtUnix: number; nonce: string }
  | { ok: false; reason: 'disabled' | 'malformed' | 'bad_signature' | 'expired' };

/**
 * Check the signature and the 7-day window. Whether the post is still live
 * with this nonce is the caller's second check (`isTokenCurrent`), because it
 * needs the row.
 */
export function readUnpublishToken(token: string, nowMs = Date.now(), secret = unpublishSecret()): TokenReading {
  if (!secret) return { ok: false, reason: 'disabled' };
  if (typeof token !== 'string' || token.length > 400) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [payload, signature] = parts;

  const expected = Buffer.from(sign(payload, secret), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad_signature' };

  const decoded = Buffer.from(payload, 'base64url').toString('utf8');
  const m = /^([0-9a-f-]{36})\.(\d{1,12})\.([A-Za-z0-9_-]{8,64})$/i.exec(decoded);
  if (!m || !UUID.test(m[1])) return { ok: false, reason: 'malformed' };
  const at = Number(m[2]);
  if (nowMs / 1000 > at + UNPUBLISH_LINK_TTL_SECONDS) return { ok: false, reason: 'expired' };
  return { ok: true, postId: m[1], publishedAtUnix: at, nonce: m[3] };
}

/** Still the publication the link was minted for: live, with the same nonce and publish second. */
export function isTokenCurrent(
  reading: { publishedAtUnix: number; nonce: string },
  post: { published: boolean; published_at: string | null; publish_nonce: string | null },
): boolean {
  return post.published
    && !!post.published_at
    && post.publish_nonce === reading.nonce
    && publishedAtUnix(post.published_at) === reading.publishedAtUnix;
}

export function unpublishLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/articles/unpublish/${token}`;
}
