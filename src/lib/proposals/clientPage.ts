/**
 * Proposal Pod - is the client-facing proposal page live?
 *
 * The delivery email's whole point is its "Open my proposal" link. Slice 2
 * builds the admin side; /proposal/[token] itself is Slice 3. Until that route
 * exists, a Send would put a 404 in a real client's inbox, so the send action
 * REFUSES server-side rather than trusting a card description to stop a
 * mis-click. Copy link stays available - pasting a link somewhere is a
 * deliberate act by an admin who can see it does not resolve yet.
 *
 * Slice 3 flips this to true in the same commit that adds the route. It is a
 * constant, not an env var, precisely so the two cannot drift: the code that
 * claims the page exists ships with the page.
 */
export const CLIENT_PAGE_LIVE = false;

/** The message the admin sees when Send is refused for that reason. */
export const CLIENT_PAGE_NOT_LIVE_MESSAGE =
  'The client proposal page is not live yet (Slice 3) - sending would deliver a dead link. Use Copy link until it ships.';
