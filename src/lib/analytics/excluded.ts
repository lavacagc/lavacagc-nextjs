/**
 * Where third-party analytics must never run.
 *
 * CM-05: Microsoft Clarity (session RECORDING) and the Meta Pixel were mounted
 * in the root layout with no path condition at all, and Analytics.tsx excluded
 * only /admin, /vaca-mgmt and /auth - a list written before this app had any
 * token-authenticated pages.
 *
 * The consequence was concrete: /crew/confirm/[token] renders a customer's
 * name, phone number and address, and Clarity was replaying that page with the
 * capability token sitting in the recorded URL. On those pages the token IS the
 * credential, so anyone with access to the analytics account - or a breach of
 * it - could replay the session and reuse a live token. The same URLs went to
 * Meta via the Pixel.
 *
 * ONE list, used by BOTH the layout scripts and the page-view tracker. Two
 * lists is how the first one drifted.
 *
 * When adding a route that authenticates by a token in its URL, or that
 * displays customer contact details, add it here.
 */
export const ANALYTICS_EXCLUDED_PATTERNS: RegExp[] = [
  /^\/admin/,          // legacy admin surface
  /^\/vaca-mgmt/,      // the admin
  /^\/auth/,           // sign-in
  /^\/proposal\//,     // client proposal - token-authenticated, shows prices
  /^\/intake\//,       // tokenized lead intake - shows the lead's own answers
  /^\/crew\//,         // crew visit confirm - shows customer name, phone, address
  /^\/preferences/,    // email preference centre - token in the query string
  /^\/unsub/,          // unsubscribe - carries an address or a token
];

/** True when third-party analytics must not load or report on this path. */
export function isAnalyticsExcluded(pathname: string): boolean {
  return ANALYTICS_EXCLUDED_PATTERNS.some((rx) => rx.test(pathname));
}
