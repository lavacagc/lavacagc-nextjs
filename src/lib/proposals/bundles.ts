/**
 * Proposal Pod - Slice 2: bundle composition (pure).
 *
 * A bundle is one client-facing line composed from several imported lines: the
 * admin's name, ONE price (the members' sum), and the member titles as the
 * "includes" list. Member PRICES are admin-side only - the client page renders
 * titles and the single bundle price, nothing else.
 *
 * Pure module so the admin preview (browser) and the acceptance tests share
 * the exact same rules:
 *  - the price is the members' sum, integer cents in, integer cents out;
 *  - the badge follows the fail-safe: any locked MEMBER locks the bundle, and
 *    only an all-optional bundle gets the client toggle (all-or-nothing - the
 *    "no cherry-picking inside a package" posture the owner asked for). The
 *    members are the flattened list, so `optional` and lockedMemberTitles are
 *    two readings of one fact at every level of nesting;
 *  - the category label comes from the first locked input (structure wins,
 *    same direction as the registry), else the first input;
 *  - nesting flattens: bundling a bundle re-uses its members, so members are
 *    always original CSV lines and a sum can never double-count.
 */
import { categorizeLine } from './categories';

/** The PERSISTED member shape: a title and a price, and nothing else. */
export interface BundleMember {
  title: string;
  price_cents: number;
}

/**
 * The member as the admin's browser holds it: the persisted shape plus the two
 * things the preview knows and storage deliberately does not.
 *
 * `description` makes unbundling lossless. `optional` is the member's EFFECTIVE
 * verdict at the moment it was bundled - the registry's, or the admin's own
 * per-line override on top of it - and it is the single source of truth for
 * what "locked member" means, because it is the same value composeBundle reads
 * to decide whether the bundle itself is locked. Re-deriving that verdict from
 * the title instead lets the two disagree exactly where it matters: a line the
 * admin locked by hand still reads optional in the registry.
 *
 * Neither field is EVER persisted (toStoredMembers strips both, and the store's
 * schema would strip them again): the storage contract for bundle_members is
 * titles and prices only.
 */
export interface PreviewBundleMember extends BundleMember {
  description?: string;
  optional?: boolean;
}

/** Narrow preview members to the shape bundle_members is allowed to store. */
export function toStoredMembers(members: PreviewBundleMember[]): BundleMember[] {
  return members.map((m) => ({ title: m.title, price_cents: m.price_cents }));
}

export interface BundleInput {
  title: string;
  description?: string;
  priceCents: number;
  optional: boolean;
  category: string;
  members?: PreviewBundleMember[];
}

export interface ComposedBundle {
  title: string;
  priceCents: number;
  optional: boolean;
  category: string;
  members: PreviewBundleMember[];
}

export function composeBundle(inputs: BundleInput[], name?: string): ComposedBundle | null {
  if (inputs.length < 2) return null;
  const members = inputs.flatMap((r) =>
    r.members && r.members.length > 0
      ? r.members
      : [{
        title: r.title,
        price_cents: r.priceCents,
        description: r.description,
        // The SAME flag the bundle's own verdict is computed from below.
        optional: r.optional,
      }]);
  return {
    title: name ?? `Bundle (${members.length} items)`,
    priceCents: members.reduce((a, m) => a + m.price_cents, 0),
    // The FLATTENED members decide, not the top-level inputs: they are the same
    // list lockedMemberTitles reads, so the badge and the guard cannot say
    // different things about the same bundle. Reading the inputs instead broke
    // exactly one step down - a bundle whose own flag had been flipped by hand
    // still carried a locked member, and bundling it again produced an OPTIONAL
    // package holding structural work with nothing asked.
    optional: lockedMemberTitles(members).length === 0,
    category: inputs.find((r) => !r.optional)?.category ?? inputs[0].category,
    members,
  };
}

/**
 * The members a client would gain the power to decline if this bundle were
 * flipped optional by hand.
 *
 * composeBundle's fail-safe locks a bundle the moment any input is locked, and
 * the admin's per-line override can undo that - deliberately, it is the
 * designed backstop - but a bundle names only itself on screen, so the override
 * otherwise hides which structural work it just put behind a client toggle.
 *
 * The verdict read here is the member's own effective flag: the exact value
 * composeBundle summed to decide the bundle was locked in the first place, so
 * the guard cannot disagree with the badge it is guarding. Re-deriving it from
 * the registry silently missed the case the guard exists for - a line the admin
 * locked BY HAND, which the registry still calls optional, locking the bundle
 * and then flipping it with nothing asked. The registry is the fallback only
 * for members with no flag (a bundle read back from storage, which kept titles
 * and prices only), and there an unrecognized title still counts as locked.
 */
export function lockedMemberTitles(members: PreviewBundleMember[]): string[] {
  return members
    .filter((m) => !(m.optional ?? categorizeLine(m.title).optional))
    .map((m) => m.title);
}

/**
 * Restore a bundle's members as standalone lines.
 *
 * A member the preview still holds comes back exactly as it went in, override
 * and all: bundling and unbundling is a round trip the admin should be able to
 * take without losing the verdicts they set by hand. Only a member with no flag
 * - a bundle read back from storage, where the CLIENT-facing contract kept
 * titles and prices alone - is re-badged by the registry, on the same fail-safe:
 * unknown restores locked. The category always comes from the registry, which
 * is the only thing that ever set it. The description comes back when the
 * preview still carries it, and restores empty when it does not.
 */
export function restoreMembers(members: PreviewBundleMember[]): {
  title: string; description: string; priceCents: number; optional: boolean; category: string;
}[] {
  return members.map((m) => {
    const verdict = categorizeLine(m.title);
    return {
      title: m.title,
      description: m.description ?? '',
      priceCents: m.price_cents,
      optional: m.optional ?? verdict.optional,
      category: verdict.key,
    };
  });
}
