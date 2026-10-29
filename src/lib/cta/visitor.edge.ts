/**
 * The same `cta_vid` cookie as visitor.server.ts, minted from the edge
 * runtime (middleware) with WebCrypto, so a visitor has a signed id on their
 * first page response rather than on their first event. Before this, the
 * click beacon depended on the view beacon's Set-Cookie having landed, and a
 * visitor who tapped the hero button on a slow connection lost the click
 * (CT3 flaked exactly that way under load).
 *
 * Format and key are identical to the node version:
 * `<uuid v4>.<base64url(HMAC-SHA256("cta_vid:" + uuid, INTERNAL_WEBHOOK_SECRET))>`.
 * /api/cta/event verifies with the node helper; both must stay in step, and
 * tests/cta-tests.spec.ts asserts a cookie minted here verifies there.
 */
import { CTA_COOKIE_MAX_AGE, CTA_VID_COOKIE } from './types';

function base64url(bytes: ArrayBuffer): string {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Null when no secret is configured or WebCrypto is unavailable: then nothing is minted, never an unsigned id. */
export async function mintVisitorCookieEdge(): Promise<string | null> {
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!secret || typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    const uuid = crypto.randomUUID();
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`cta_vid:${uuid}`));
    return `${uuid}.${base64url(sig)}`;
  } catch {
    return null;
  }
}

export const VISITOR_COOKIE_EDGE = {
  name: CTA_VID_COOKIE,
  options: (secure: boolean) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: CTA_COOKIE_MAX_AGE,
  }),
};
