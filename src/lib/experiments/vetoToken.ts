/**
 * The one-tap veto link in the winner's Telegram message.
 *
 * Token: base64url(key + "." + proposedAtUnix) + "." + base64url(HMAC-SHA256(
 * that first part, INTERNAL_WEBHOOK_SECRET)), compared with timingSafeEqual.
 * The same signed-link pattern as the article unpublish link
 * (docs/phase-2/acceptance-criteria.md, "Telegram unpublish link"):
 *  - valid for 7 days, and
 *  - only while the experiment is still pending promotion with that same
 *    `proposed_at` (checked by the caller against the row), so a link from an
 *    earlier proposal can never veto a later one.
 * A GET of the link page never changes anything; the page's one button POSTs.
 *
 * Server-only (node:crypto), free of Next imports so specs can import it.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const VETO_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(env: Partial<Record<string, string | undefined>>): string | null {
  const value = env.INTERNAL_WEBHOOK_SECRET?.trim();
  return value && value.length >= 16 ? value : null;
}

function sign(body: string, key: string): string {
  return createHmac('sha256', key).update(body).digest('base64url');
}

export function createVetoToken(experimentKey: string, proposedAt: string, env: Partial<Record<string, string | undefined>> = process.env): string | null {
  const key = secret(env);
  const unix = Math.floor(Date.parse(proposedAt) / 1000);
  if (!key || !Number.isFinite(unix)) return null;
  const body = Buffer.from(`${experimentKey}.${unix}`).toString('base64url');
  return `${body}.${sign(body, key)}`;
}

export type VetoTokenCheck =
  | { ok: true; experimentKey: string; proposedAtUnix: number }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'not_configured' };

export function verifyVetoToken(
  token: string,
  now: Date = new Date(),
  env: Partial<Record<string, string | undefined>> = process.env,
): VetoTokenCheck {
  const key = secret(env);
  if (!key) return { ok: false, reason: 'not_configured' };
  if (typeof token !== 'string' || token.length > 300) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [body, mac] = parts;
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad_signature' };
  const decoded = Buffer.from(body, 'base64url').toString('utf8');
  const dot = decoded.lastIndexOf('.');
  const experimentKey = decoded.slice(0, dot);
  const unix = Number(decoded.slice(dot + 1));
  if (dot < 1 || !Number.isInteger(unix)) return { ok: false, reason: 'malformed' };
  if (now.getTime() - unix * 1000 > VETO_TOKEN_TTL_MS) return { ok: false, reason: 'expired' };
  return { ok: true, experimentKey, proposedAtUnix: unix };
}
