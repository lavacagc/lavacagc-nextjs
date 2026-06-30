/**
 * Signed access cookie for La Vaca Home Care (no login).
 *
 * A verified homeowner gets an httpOnly cookie whose value is an HMAC-signed
 * `${homeownerId}.${issuedAtSec}` token — the same web-crypto scheme as the
 * Buy + Remodel `br_access` cookie, but a separate cookie name so the two
 * programs are independent. Reuses LISTINGS_ACCESS_SECRET (already configured),
 * so no new env var is required. Fail-closed when the secret is unset.
 */
import { cleanEnv } from '@/lib/envClean';

export const HC_ACCESS_COOKIE = 'hc_access';
export const HC_KNOWN_COOKIE = 'hc_known';
export const HC_ACCESS_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function hcAccessCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function hcKnownCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export function sanitizeKnownName(name: string | null | undefined): string {
  return (name ?? '').replace(/[^\p{L}\p{M}'\- ]/gu, '').trim().slice(0, 40);
}

function getSecret(): string {
  const secret = cleanEnv(process.env.LISTINGS_ACCESS_SECRET);
  if (!secret) throw new Error('LISTINGS_ACCESS_SECRET is not set');
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
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signHomeAccess(homeownerId: string): Promise<string> {
  const key = await importKey(getSecret());
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = strToB64url(`${homeownerId}.${issuedAt}`);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return `${payload}.${bytesToB64url(sig)}`;
}

/** Returns the homeowner id for a valid, unexpired, signed token; else null. Never throws. */
export async function verifyHomeAccess(cookieValue: string | undefined | null): Promise<{ homeownerId: string } | null> {
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
    const valid = await crypto.subtle.verify('HMAC', key, b64urlToBytes(signature) as unknown as BufferSource, encoder.encode(payload));
    if (!valid) return null;
    const decoded = b64urlToStr(payload);
    const sep = decoded.lastIndexOf('.');
    if (sep <= 0) return null;
    const homeownerId = decoded.slice(0, sep);
    const issuedAt = Number(decoded.slice(sep + 1));
    if (!homeownerId || !Number.isFinite(issuedAt)) return null;
    const ageSec = Math.floor(Date.now() / 1000) - issuedAt;
    if (ageSec < 0 || ageSec > HC_ACCESS_MAX_AGE_SECONDS) return null;
    return { homeownerId };
  } catch {
    return null;
  }
}
