/**
 * The CTA counting identity: `cta_vid` = `<uuid v4>.<HMAC-SHA256(uuid), base64url>`,
 * keyed with INTERNAL_WEBHOOK_SECRET, minted only by /api/cta/event and set
 * httpOnly, SameSite=Lax, 180 days. A browser cannot invent or alter one, so
 * every counted view and click traces to an id this server issued, and the
 * unique index (button, variant_key, event_type, visitor_id) caps each id at
 * one of each.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { CTA_COOKIE_MAX_AGE, CTA_VID_COOKIE } from './types';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Throws when the secret is missing: no secret means no counting, never unsigned counting. */
function secret(): string {
  const value = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!value) throw new Error('INTERNAL_WEBHOOK_SECRET not configured');
  return value;
}

function sign(uuid: string): string {
  return createHmac('sha256', secret()).update(`cta_vid:${uuid}`).digest('base64url');
}

export function mintVisitorCookie(): { visitorId: string; value: string } {
  const visitorId = randomUUID();
  return { visitorId, value: `${visitorId}.${sign(visitorId)}` };
}

/** The visitor id when the cookie value carries a valid signature, else null. */
export function verifyVisitorCookie(value: string | undefined | null): string | null {
  if (!value) return null;
  const dot = value.indexOf('.');
  if (dot < 0) return null;
  const uuid = value.slice(0, dot);
  if (!UUID_V4.test(uuid)) return null;
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(uuid));
  return given.length === expected.length && timingSafeEqual(given, expected) ? uuid : null;
}

export const VISITOR_COOKIE = {
  name: CTA_VID_COOKIE,
  options: (secure: boolean) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: CTA_COOKIE_MAX_AGE,
  }),
};
