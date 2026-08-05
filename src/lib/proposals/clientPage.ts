/**
 * Proposal Pod - is the client-facing proposal page live?
 *
 * The delivery email's whole point is its "Open my proposal" link, so through
 * slices 1 and 2 this read `false` and the admin's Send action REFUSED
 * server-side: /proposal/[token] did not exist, and a mis-click would have put
 * a 404 in a real client's inbox. Copy link stayed available throughout,
 * because pasting a link somewhere is a deliberate act by an admin who can see
 * it does not resolve yet.
 *
 * SLICE 3 FLIPPED IT, in the same commit that added the route - which is the
 * whole reason it is a constant rather than an env var. A dashboard flag can be
 * switched on before the code that serves the page has deployed, or left on
 * after a rollback takes the page away; a constant cannot get out of step with
 * the route, because the code that claims the page exists ships with it.
 *
 * The guard STAYS rather than being deleted along with its reason. `send` still
 * calls it, the message below still exists, and both branches still type-check
 * (hence the explicit `boolean` annotation rather than the inferred literal
 * type), so a slice that ever takes the page down again - a rewrite, a
 * rollback, a pod that moves the route - has one line to change and every
 * refusal comes back with it. Deleting the guard would mean rediscovering the
 * argument for it later, in an incident.
 */
export const CLIENT_PAGE_LIVE: boolean = true;

/** The message the admin sees when Send is refused for that reason. */
export const CLIENT_PAGE_NOT_LIVE_MESSAGE =
  'The client proposal page is not live yet - sending would deliver a dead link. Use Copy link until it ships.';
