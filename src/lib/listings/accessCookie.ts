/**
 * Signed access cookie for the "Buy + Remodel" email gate.
 *
 * A verified subscriber gets an httpOnly cookie whose value is an HMAC-signed
 * `${subscriberId}.${issuedAtSec}` token. The middleware reads + verifies the
 * signature (fast, no DB) before doing the authoritative live status check.
 *
 * Implemented with the Web Crypto API (`crypto.subtle`) rather than node:crypto
 * so the SAME helper works in BOTH the Edge-runtime middleware and the Node
 * route handlers. `crypto.subtle.verify` is constant-time. Tokens older than
 * MAX_AGE are rejected.
 *
 * The secret is LISTINGS_ACCESS_SECRET (cleaned via cleanEnv). When it is not
 * set, signing throws and verification returns null (fail-closed): no one can
 * be granted access until the secret is configured.
 */
import { cleanEnv } from '@/lib/envClean';

export const ACCESS_COOKIE_NAME = 'br_access';

/** Cookie/token lifetime. Revocation on unsubscribe is enforced sooner by the
 *  middleware's live status check; this is just the hard ceiling. */
export const ACCESS_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

function getSecret(): string {
  const secret = cleanEnv(process.env.LISTINGS_ACCESS_SECRET);
  if (!secret) {
    throw new Error('LISTINGS_ACCESS_SECRET is not set');
  }
  return secret;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToB64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function strToB64url(s: string): string {
  return bytesToB64url(encoder.encode(s));
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function b64urlToStr(s: string): string {
  return decoder.decode(b64urlToBytes(s));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** Mint a signed access token for a verified subscriber id. */
export async function signAccess(subscriberId: string): Promise<string> {
  const key = await importKey(getSecret());
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = strToB64url(`${subscriberId}.${issuedAt}`);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${bytesToB64url(sig)}`;
}

/**
 * Verify a cookie value. Returns the subscriber id on a valid, unexpired,
 * correctly-signed token; otherwise null. Never throws (a missing secret or
 * malformed input simply fails closed).
 */
export async function verifyAccess(
  cookieValue: string | undefined | null,
): Promise<{ subscriberId: string } | null> {
  if (!cookieValue) return null;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;

  try {
    const key = await importKey(secret);
    const sigBytes = b64urlToBytes(signature);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      encoder.encode(payload),
    );
    if (!valid) return null;

    const decoded = b64urlToStr(payload); // "<subscriberId>.<issuedAtSec>"
    const sep = decoded.lastIndexOf('.');
    if (sep <= 0) return null;
    const subscriberId = decoded.slice(0, sep);
    const issuedAt = Number(decoded.slice(sep + 1));
    if (!subscriberId || !Number.isFinite(issuedAt)) return null;

    const ageSec = Math.floor(Date.now() / 1000) - issuedAt;
    if (ageSec < 0 || ageSec > ACCESS_MAX_AGE_SECONDS) return null;

    return { subscriberId };
  } catch {
    return null;
  }
}
