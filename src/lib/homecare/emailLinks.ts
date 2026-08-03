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

/** The owner's Google review page. Supplied 2 Aug. */
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
 */
const PORTAL_ROOT = '/home-care';

export function safeDestination(raw: string | null): string {
  if (!raw) return '/home-care/checklist';
  // Reject anything that could leave the site: protocol-relative, absolute, or
  // backslash-escaped. `..` too - it passes a startsWith check and then gets
  // normalised away, so '/home-care/../vaca-mgmt' would land outside the portal.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.includes('..')) {
    return '/home-care/checklist';
  }
  const path = raw.split('?')[0].split('#')[0];
  const ok = path === PORTAL_ROOT || path.startsWith(`${PORTAL_ROOT}/`);
  return ok ? raw : '/home-care/checklist';
}
