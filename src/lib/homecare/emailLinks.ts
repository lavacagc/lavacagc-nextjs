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
  /** Appended to the destination, e.g. `add=clean-gutters` from the newsletter. */
  query?: Record<string, string>;
  /** utm_* pairs, kept separate so they attach to the outer link. */
  utm?: Record<string, string>;
}

/**
 * A portal link carrying the homeowner's access token.
 *
 * `accessToken` is nullable because the column is backfilled by migration and a
 * row created before it lands could still be null. In that case this returns the
 * bare URL rather than a link with `token=null` in it - the recipient gets the
 * old behaviour, which is imperfect, instead of a URL that looks valid and is
 * not. Callers that care can check `hasAccessToken` first.
 */
export function checklistUrl(
  baseUrl: string,
  accessToken: string | null | undefined,
  options: ChecklistLinkOptions = {},
): string {
  const destination = options.to ?? '/home-care/checklist';
  const dest = new URLSearchParams(options.query ?? {}).toString();
  const path = dest ? `${destination}?${dest}` : destination;

  if (!accessToken) {
    const bare = new URL(path, baseUrl);
    for (const [k, v] of Object.entries(options.utm ?? {})) bare.searchParams.set(k, v);
    return bare.toString();
  }

  const url = new URL('/api/home-care/access', baseUrl);
  url.searchParams.set('token', accessToken);
  url.searchParams.set('to', path);
  for (const [k, v] of Object.entries(options.utm ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

export function hasAccessToken(accessToken: string | null | undefined): boolean {
  return typeof accessToken === 'string' && accessToken.length > 0;
}
