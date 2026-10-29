/**
 * The one-tap veto link in the winner's Telegram message.
 *
 * Token: base64url(key + "." + proposedAtUnix + "." + issuedAtUnix) + "." +
 * base64url(HMAC-SHA256(that first part, INTERNAL_WEBHOOK_SECRET)), compared
 * with timingSafeEqual.
 * The same signed-link pattern as the article unpublish link
 * (docs/phase-2/acceptance-criteria.md, "Telegram unpublish link"), and the
 * same secret rule (src/lib/oneTapLinkSecret.ts):
 *  - minted when the message is sent and valid for 7 days from that instant
 *    (`issuedAt`, stored on the pending record as `veto_link_issued_at`), so a
 *    message delivered days after the proposal still carries a working link
 *    for well past its 24-hour promotion window, and
 *  - only while the experiment is still pending promotion with that same
 *    `proposed_at` (checked by the caller against the row), so a link from an
 *    earlier proposal can never veto a later one.
 * A GET of the link page never changes anything; the page's one button POSTs.
 *
 * Server-only (node:crypto), free of Next imports so specs can import it.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { oneTapLinkSecret } from '../oneTapLinkSecret';

export const VETO_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sign(body: string, key: string): string {
  return createHmac('sha256', key).update(body).digest('base64url');
}

function unixSeconds(at: string): number {
  return Math.floor(Date.parse(at) / 1000);
}

export function createVetoToken(
  experimentKey: string,
  proposedAt: string,
  issuedAt: string,
  env: Partial<Record<string, string | undefined>> = process.env,
): string | null {
  const key = oneTapLinkSecret(env);
  const proposed = unixSeconds(proposedAt);
  const issued = unixSeconds(issuedAt);
  if (!key || !Number.isFinite(proposed) || !Number.isFinite(issued)) return null;
  const body = Buffer.from(`${experimentKey}.${proposed}.${issued}`).toString('base64url');
  return `${body}.${sign(body, key)}`;
}

export type VetoTokenCheck =
  | { ok: true; experimentKey: string; proposedAtUnix: number; issuedAtUnix: number }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'not_configured' };

export function verifyVetoToken(
  token: string,
  now: Date = new Date(),
  env: Partial<Record<string, string | undefined>> = process.env,
): VetoTokenCheck {
  const key = oneTapLinkSecret(env);
  if (!key) return { ok: false, reason: 'not_configured' };
  if (typeof token !== 'string' || token.length > 300) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, mac] = parts;
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad_signature' };
  const decoded = Buffer.from(body, 'base64url').toString('utf8');
  const issuedDot = decoded.lastIndexOf('.');
  const proposedDot = decoded.lastIndexOf('.', issuedDot - 1);
  if (proposedDot < 1) return { ok: false, reason: 'malformed' };
  const experimentKey = decoded.slice(0, proposedDot);
  const proposed = Number(decoded.slice(proposedDot + 1, issuedDot));
  const issued = Number(decoded.slice(issuedDot + 1));
  if (!Number.isInteger(proposed) || !Number.isInteger(issued)) return { ok: false, reason: 'malformed' };
  if (now.getTime() - issued * 1000 > VETO_TOKEN_TTL_MS) return { ok: false, reason: 'expired' };
  return { ok: true, experimentKey, proposedAtUnix: proposed, issuedAtUnix: issued };
}
