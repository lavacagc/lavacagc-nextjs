import { HC_KNOWN_COOKIE } from '@/lib/homecare/accessCookie';

/**
 * Read the readable `hc_known` hint cookie (member first name) on the client.
 * Name hint only — real portal access is enforced server-side via hc_access.
 */
export function readHcKnown(): string | null {
  if (typeof document === 'undefined') return null;
  const entry = document.cookie.split('; ').find((c) => c.startsWith(`${HC_KNOWN_COOKIE}=`));
  if (!entry) return null;
  try {
    const name = decodeURIComponent(entry.slice(HC_KNOWN_COOKIE.length + 1)).trim();
    return name || null;
  } catch {
    return null;
  }
}
