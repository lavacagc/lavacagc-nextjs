/**
 * Proposal Pod - how long a proposal's link resolves for.
 *
 * PURE, and its own module for that reason. The rule started life inside
 * `publicView.ts`, which is server-only in practice: it imports the secret-key
 * REST client. The admin roster has to ask the same question - it renders Copy
 * link, and a link the page will not serve is a link an admin must not hand
 * over believing it works - and importing it from there would have pulled
 * `supabaseRest` into the browser bundle to reach a function that does
 * arithmetic on a timestamp.
 *
 * So the rule lives here, where the server doors and the admin's browser can
 * both read it, and there is still exactly ONE of it. `publicView` re-exports
 * these so every existing caller is unchanged.
 */

/**
 * How long a DRAFT's link stays live, measured from `updated_at` (owner
 * decision, 5 Aug 2026).
 *
 * A draft has to open at all because Copy link is offered on one in the roster,
 * and the client an admin pastes it to has to be able to answer - preview-only
 * was considered and rejected. Bounding the window to a day bounds the hazard
 * that openness creates, which is an accidental tap recording a submission on a
 * proposal nobody ever sent, without breaking hand delivery.
 *
 * `updated_at` rather than `created_at`, deliberately: `proposal_lines_touch_proposal`
 * (20260824000000) moves it on every re-import, so correcting a draft's lines
 * reopens its proof-reading window, and an untouched draft still expires 24
 * hours after creation because the two columns are equal then.
 *
 * A SENT proposal is untouched by this. Owner decision D3 governs that link - no
 * hard expiry, revocable from the admin - and still does.
 */
export const DRAFT_LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * The same window in the unit an admin reads it in.
 *
 * Here rather than beside each screen that says it out loud: the roster's toast
 * and its expiry hint, and the send route's post-delivery failure, all name a
 * number of hours, and a derivation restated per caller is a second definition
 * of the rule this module exists to own.
 */
export const DRAFT_WINDOW_HOURS = Math.round(DRAFT_LINK_LIFETIME_MS / (60 * 60 * 1000));

/** The stored lifecycle, mirroring the `proposals_status_check` of 20260824000000. */
export type ProposalStatus = 'draft' | 'sent' | 'revoked';

/** The shape both doors and the roster row have in common. */
export interface LinkWindowSubject {
  status: ProposalStatus;
  updated_at: string | null;
}

/**
 * May this proposal's link serve at all?
 *
 * ONE rule for every reader - `lookupPublicProposal`, `submitProposal`, and now
 * the roster row - so the submit route can never accept an answer on a link the
 * page would not serve, and the admin is never shown a Copy link that quietly
 * hands over a dead one. Every `false` is answered as `missing` on the client
 * side, identically to a token that was never ours.
 *
 * An `updated_at` we cannot read closes the window rather than opening it. The
 * column is `NOT NULL DEFAULT now()`, so this is unreachable from a healthy
 * database; if it ever is reached, a draft that stops resolving is recoverable
 * (re-import, Copy link, or Send it) and a draft that never stops is not.
 *
 * A type PREDICATE rather than a plain boolean, so a caller that has taken the
 * early return holds a status the client projection can carry: 'revoked' cannot
 * survive this check, and the compiler is the one saying so.
 */
export function proposalLinkIsLive<T extends LinkWindowSubject>(
  head: T,
  now: number = Date.now(),
): head is T & { status: Exclude<ProposalStatus, 'revoked'> } {
  if (head.status === 'revoked') return false;
  if (head.status !== 'draft') return true;
  const touched = head.updated_at ? Date.parse(head.updated_at) : NaN;
  if (Number.isNaN(touched)) return false;
  return now - touched < DRAFT_LINK_LIFETIME_MS;
}

/**
 * Has a DRAFT's window run out?
 *
 * Deliberately narrower than `!proposalLinkIsLive(...)`, which is also true of
 * a revoked proposal. The roster already renders 'revoked' as its own status
 * with its own controls, so a row must not describe a revoked link as an
 * expired one: they are different situations with different remedies (restore
 * it, versus refresh it).
 */
export function draftLinkHasExpired(subject: LinkWindowSubject, now: number = Date.now()): boolean {
  return subject.status === 'draft' && !proposalLinkIsLive(subject, now);
}
