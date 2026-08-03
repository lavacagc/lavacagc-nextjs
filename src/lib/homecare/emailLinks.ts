/**
 * Links that work when they land in somebody's inbox.
 *
 * Every Home Care email used to point at a bare `/home-care/checklist`. That
 * page redirects to `/home-care` without an `hc_access` cookie, and the cookie
 * lasts 30 days - so a recipient who had not opened the portal in a month
 * clicked "See it on my plan" and landed on the signup page. Reported on 2 Aug
 * as the link being unreachable, and it affected the visit reminder, the monthly
 * newsletter and the release email alike.
 *
 * The fix is one helper that every email uses, so a new email cannot reintroduce
 * the bare link by copying an old one.
 */

/**
 * The owner's Google review page. Supplied 2 Aug.
 *
 * KNOWN DIVERGENCE, awaiting the owner. `src/components/LeaveReviewClient.tsx`
 * and `src/lib/emailTemplates.ts` carry a DIFFERENT g.page link for the same
 * business - `...CflitSa4DKHAEBM...` rather than the `...EAI...` here - and three
 * live feedback-drip buttons point at it. At most one of the two is the page the
 * owner means, and a Home Care service customer can receive both. Nothing is
 * unified on a guess: rewriting three live drip links to the wrong place is
 * worse than the drift. `tests/home-care-email-links.spec.ts` pins both values
 * so a third cannot appear unnoticed, and that list must shrink to one once the
 * owner confirms which is correct.
 */
export const GOOGLE_REVIEW_URL = 'https://g.page/r/CflitSa4DKHAEAI/review';

export interface ChecklistLinkOptions {
  /** Where in the portal to land. Defaults to the checklist. */
  to?: string;
  /** Merged into the destination, e.g. `add=clean-gutters` from the newsletter. */
  query?: Record<string, string>;
  /** utm_* pairs. Merged into the destination so they survive the redirect. */
  utm?: Record<string, string>;
}

/**
 * A portal link carrying the homeowner's access token.
 *
 * `accessToken` is nullable because the column is backfilled by migration and a
 * row created before it lands could still be null. In that case this returns the
 * bare URL rather than a link with `token=null` in it - the recipient gets the
 * old behaviour, which is imperfect, instead of a URL that looks valid and is
 * not.
 *
 * Both `query` and `utm` are merged into the DESTINATION through URLSearchParams
 * rather than concatenated. Two reasons: a `to` that already carries a query
 * cannot produce a second '?' and a dead link, and the utm pairs reach the
 * landing page. Hanging them off the outer /api/home-care/access URL instead
 * loses them entirely - that route is a server redirect, not a pageview, so
 * nothing forwards them on and analytics never sees the campaign.
 */
export function checklistUrl(
  baseUrl: string,
  accessToken: string | null | undefined,
  options: ChecklistLinkOptions = {},
): string {
  const destination = new URL(options.to ?? '/home-care/checklist', baseUrl);
  for (const [k, v] of Object.entries(options.query ?? {})) destination.searchParams.set(k, v);
  for (const [k, v] of Object.entries(options.utm ?? {})) destination.searchParams.set(k, v);

  if (!accessToken) return destination.toString();

  const url = new URL('/api/home-care/access', baseUrl);
  url.searchParams.set('token', accessToken);
  // The hash rides along too. The newsletter's own "Learn more" links are
  // `/home-care/guides/<season>#<task>`, so the first `to` anyone passes is very
  // likely to carry one, and dropping it lands them on the guide index.
  url.searchParams.set('to', `${destination.pathname}${destination.search}${destination.hash}`);
  return url.toString();
}

/**
 * Where an emailed access link may send them.
 *
 * An open redirect on a route that just handed out a session cookie would be a
 * genuinely bad combination, so this is an allow-list rather than any attempt to
 * sanitise an arbitrary URL. The whole Home Care portal is in scope - listing
 * individual pages read tighter than it behaved, because `/home-care` already
 * subsumes every one of them - and the cookie the caller is about to set is what
 * gates those pages anyway, so landing on one directly grants nothing extra.
 *
 * Query strings survive, because the newsletter's "Add to plan" buttons carry
 * `?add=<task>` and every link carries its utm pairs.
 *
 * The check runs on the RESOLVED url rather than the string, so no spelling of a
 * dot segment has to be enumerated: '..', '%2e%2e' and '%2E%2E' all collapse to
 * the same target before anything is compared. It then keeps decoding until the
 * path stops changing, because one resolution only undoes one layer - '..%2f'
 * and '%252e%252e' each survive the first pass and become '..' for whatever
 * decodes next. A destination is only accepted if it is still inside the portal
 * at every layer.
 */
const PORTAL_ROOT = '/home-care';
const FALLBACK_DESTINATION = '/home-care/checklist';

/** Anything that resolves off this origin left the site and is rejected. */
const RESOLUTION_BASE = new URL('https://portal.invalid');

/** Nesting deeper than this is not a real destination; treat it as hostile. */
const MAX_DECODE_ROUNDS = 4;

function resolveInPortal(candidate: string): URL | null {
  let url: URL;
  try {
    url = new URL(candidate, RESOLUTION_BASE);
  } catch {
    return null;
  }
  // Catches '//evil.com', 'https://evil.com' and the backslash forms in one
  // comparison: each resolves to a host that is not ours.
  if (url.origin !== RESOLUTION_BASE.origin) return null;
  if (url.pathname !== PORTAL_ROOT && !url.pathname.startsWith(`${PORTAL_ROOT}/`)) return null;
  return url;
}

export function safeDestination(raw: string | null): string {
  if (!raw) return FALLBACK_DESTINATION;

  const destination = resolveInPortal(raw);
  if (!destination) return FALLBACK_DESTINATION;

  let path = destination.pathname;
  let settled = false;
  for (let round = 0; round < MAX_DECODE_ROUNDS && !settled; round += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return FALLBACK_DESTINATION;
    }
    const next = resolveInPortal(decoded);
    if (!next) return FALLBACK_DESTINATION;
    // Compared after resolving, not before: a path carrying a legitimately
    // encoded character re-encodes to itself and settles on the first round.
    settled = next.pathname === path;
    path = next.pathname;
  }
  if (!settled) return FALLBACK_DESTINATION;

  return `${destination.pathname}${destination.search}${destination.hash}`;
}
