/**
 * Where a home services request came from (acceptance-criteria.md,
 * "Attribution cookies and parameters").
 *
 *   ?src=<tag>    -> lv_src cookie (30 days) -> home_service_requests.source
 *   ?lid=<id>     -> lv_lid cookie (30 days) -> listing_id
 *   ?utm_*=...    -> lv_utm cookie (30 days, JSON) -> utm
 *   cta_v cookie  -> "P=<key>;S=<key>", written by the homepage Hero (another
 *                    slice) -> cta_variant_primary / cta_variant_secondary
 *
 * The landing and service pages write the first three from the URL (see
 * AttributionCapture). The request route reads all four from the request's
 * cookies, never from the JSON body, so a submission cannot claim a source it
 * did not arrive with.
 *
 * Every value is cleaned to a short safe token: these land in the admin and in
 * the owner alert, and a cookie is attacker-controlled input like any other.
 *
 * Import-light: used by the client capture component and the server route.
 */

export const SRC_COOKIE = 'lv_src';
export const LID_COOKIE = 'lv_lid';
export const UTM_COOKIE = 'lv_utm';
export const CTA_COOKIE = 'cta_v';
export const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30;

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

/** Lowercase tag: letters, digits, dash, underscore, dot. Empty when nothing usable. */
export function cleanSourceTag(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40);
}

/** Listing ids keep their case (Craigslist ids are numeric, others are not). */
export function cleanListingId(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 64);
}

function cleanUtmValue(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/[^\w .:/+-]/g, '')
    .slice(0, 100);
}

export function cleanUtm(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of UTM_KEYS) {
    const value = cleanUtmValue((raw as Record<string, unknown>)[key]);
    if (value) out[key] = value;
  }
  return out;
}

/** Parse the Hero's `cta_v` cookie. Absent or malformed is { null, null }. */
export function parseCtaCookie(raw: string | undefined | null): { primary: string | null; secondary: string | null } {
  const result: { primary: string | null; secondary: string | null } = { primary: null, secondary: null };
  if (!raw) return result;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // A malformed escape is just an unreadable cookie.
  }
  for (const part of decoded.split(';')) {
    const [k, v] = part.split('=').map((x) => x?.trim());
    const value = (v ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) || null;
    if (k === 'P') result.primary = value;
    if (k === 'S') result.secondary = value;
  }
  return result;
}

export interface RequestAttribution {
  source: string;
  listingId: string | null;
  utm: Record<string, string>;
  ctaPrimary: string | null;
  ctaSecondary: string | null;
}

/** Read attribution from a cookie getter (NextRequest.cookies.get or next/headers cookies().get). */
export function readAttribution(get: (name: string) => string | undefined): RequestAttribution {
  let utm: Record<string, string> = {};
  const utmRaw = get(UTM_COOKIE);
  if (utmRaw) {
    try {
      utm = cleanUtm(JSON.parse(decodeURIComponent(utmRaw)));
    } catch {
      utm = {};
    }
  }
  const cta = parseCtaCookie(get(CTA_COOKIE));
  return {
    source: cleanSourceTag(get(SRC_COOKIE)) || 'direct',
    listingId: cleanListingId(get(LID_COOKIE)) || null,
    utm,
    ctaPrimary: cta.primary,
    ctaSecondary: cta.secondary,
  };
}
