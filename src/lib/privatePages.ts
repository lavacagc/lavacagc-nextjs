/**
 * The pages a client or crew member reaches by TOKEN, and nothing else.
 *
 * These are not marketing surfaces. Somebody arrives on one because we sent
 * them a private link about work that is already in motion - a priced proposal,
 * a lead intake conversation, a visit to confirm - and every global widget the
 * root layout mounts is written for a visitor we are still trying to win.
 *
 * The concrete failures this closes on /proposal, all of them over a page
 * showing one client's private pricing:
 *  - StickyCTA pins a "Free Estimate / Call Now" bar to the bottom of a phone,
 *    on top of the page's own Send button.
 *  - ExitIntentPopup offers a newsletter signup to somebody who is already a
 *    customer, at the moment they move to leave.
 *  - ReviewToast asks for a Google review before the job has been agreed.
 *  - SmartBanner rules match every path when `show_on_paths` is empty, so any
 *    live promotion lands on top of the proposal.
 *
 * ONE list, because "is this a private tokenized page" is one question and four
 * copies of the answer drift. Each widget keeps its own existing suppressions
 * and adds this one - nothing that is hidden today becomes visible.
 *
 * Analytics is deliberately NOT this module's business: the site-wide tags stay
 * as they are by owner decision (5 Aug 2026). This is about what the page
 * RENDERS, which is a different question with a different answer.
 */

/** Route prefixes whose pages are reached by a private token. */
export const PRIVATE_TOKEN_PATHS = ['/proposal', '/intake', '/crew'] as const;

/**
 * Is this path a private, token-reached page?
 *
 * Prefix match on a path SEGMENT, so a future marketing page at
 * `/proposals-explained` is not silently stripped of its chrome.
 */
export function isPrivateTokenPage(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return PRIVATE_TOKEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
