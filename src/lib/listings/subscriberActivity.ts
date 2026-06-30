/**
 * Pure shaping for subscriber page-view activity rows.
 *
 * Kept free of network/Supabase so it can be unit tested. The track route
 * derives the subscriber id from the signed `br_access` cookie and the IP/UA
 * from headers; this normalizes the rest of the row (path, listing slug,
 * referrer, visitor id) with sane caps.
 */

export interface SubscriberActivityInput {
  path?: unknown;
  referrer?: unknown;
  visitor_id?: unknown;
}

export interface SubscriberActivityRow {
  subscriber_id: string;
  path: string;
  listing_slug: string | null;
  referrer: string | null;
  visitor_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

/** Extract a listing slug when the path is a Buy + Remodel detail page. */
export function listingSlugFromPath(path: string): string | null {
  const m = /^\/buy-and-remodel\/([^/?#]+)/.exec(path);
  if (!m) return null;
  const slug = m[1];
  if (slug === 'unlock') return null;
  return slug;
}

function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Normalize a request path: must be a same-site absolute path ("/..."). */
function cleanPath(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t.startsWith('/')) return null; // reject absolute URLs / junk
  return t.slice(0, 512);
}

/**
 * Build a validated subscriber_activity row. Returns null when there is no
 * usable path (the one required field besides the subscriber id).
 */
export function buildSubscriberActivityRow(
  subscriberId: string,
  body: SubscriberActivityInput,
  ipAddress: string | null,
  userAgent: string | null,
): SubscriberActivityRow | null {
  const path = cleanPath(body.path);
  if (!path) return null;

  return {
    subscriber_id: subscriberId,
    path,
    listing_slug: listingSlugFromPath(path),
    referrer: cleanStr(body.referrer, 512),
    visitor_id: cleanStr(body.visitor_id, 100),
    ip_address: ipAddress ? ipAddress.slice(0, 100) : null,
    user_agent: userAgent ? userAgent.slice(0, 1000) : null,
  };
}
