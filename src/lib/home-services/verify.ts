/**
 * The one-time text code that moves a request from Held to New
 * (acceptance-criteria.md: 4 digits, sha256 with INTERNAL_WEBHOOK_SECRET as the
 * salt, 10 minute expiry, 5 attempts, 3 sends).
 *
 * Only the hash is stored. Comparison is constant time. Server-only.
 */
import { createHash, randomInt, timingSafeEqual } from 'crypto';

export const VERIFY_CODE_TTL_MS = 10 * 60 * 1000;
export const VERIFY_MAX_ATTEMPTS = 5;
export const VERIFY_MAX_SENDS = 3;
export const VERIFY_CODE_RE = /^\d{4}$/;

export function generateCode(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

/**
 * Null when the salt is missing: without it a 4-digit hash is a lookup table,
 * so the caller must not start verification at all rather than store a weak
 * hash.
 */
export function hashCode(code: string): string | null {
  const salt = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!salt) return null;
  return createHash('sha256').update(`${code}${salt}`).digest('hex');
}

export function codeMatches(code: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !VERIFY_CODE_RE.test(code)) return false;
  const candidate = hashCode(code);
  if (!candidate) return false;
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function codeSmsBody(code: string, lang: 'en' | 'es'): string {
  return lang === 'es'
    ? `La Vaca: su código es ${code}. Vence en 10 minutos.`
    : `La Vaca: your code is ${code}. It expires in 10 minutes.`;
}
