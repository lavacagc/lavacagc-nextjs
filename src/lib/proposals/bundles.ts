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
 *    "no cherry-picking inside a package" posture the owner asked for);
 *  - the category label comes from the first locked member (structure wins,
 *    same direction as the registry), else the first member;
 *  - nesting flattens: bundling a bundle re-uses its members, so members are
 *    always original CSV lines and a sum can never double-count.
 *
 * TWO FACTS, and keeping them apart is what makes the rules above hold at every
 * depth:
 *
 *   INTRINSIC - a member's own `optional`, fixed at the moment it was bundled:
 *      the registry's verdict as overridden per-line by the admin BEFORE
 *      combining. Nothing done to a bundle ever writes it. It is what
 *      composeBundle, lockedMemberTitles and restoreMembers all read, so those
 *      three cannot disagree about which work is structural.
 *   PRESENTATION - the bundle row's own `optional`, initialized here from the
 *      intrinsic facts (locked when any member is) and flippable afterwards by
 *      the admin, behind a confirm in the exposing direction. It is a statement
 *      about THIS package and travels no further: re-bundling initializes the
 *      new package from the intrinsic facts again, and unbundling gives every
 *      member back its own.
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
 * `description` makes unbundling lossless. `optional` is the INTRINSIC verdict
 * of the header - the registry's, or the admin's own per-line override on top
 * of it, as it stood when this member was combined. Re-deriving it from the
 * title instead lets it disagree with what the bundle was judged on: a line the
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

/**
 * Is this member structural?
 *
 * Its own intrinsic flag answers whenever it has one. The registry is the
 * fallback for a member that does not - a bundle read back from storage, where
 * the client-facing contract kept titles and prices alone - and there an
 * unrecognized title still counts as locked. ONE predicate, because every
 * reading of "locked member" in this module has to be the same reading.
 */
function isLockedMember(member: PreviewBundleMember): boolean {
  return !(member.optional ?? categorizeLine(member.title).optional);
}

/**
 * A row the admin picked, as composeBundle needs to read it. No category: the
 * composed bundle's label is derived from the registry off the member that
 * decided the badge, so a category carried in here would be a field with no
 * reader - and on a nested bundle, a stale one describing a different package.
 */
export interface BundleInput {
  title: string;
  description?: string;
  priceCents: number;
  optional: boolean;
  members?: PreviewBundleMember[];
}

export interface ComposedBundle {
  title: string;
  priceCents: number;
  optional: boolean;
  category: string;
  members: PreviewBundleMember[];
}

/**
 * Compose one bundle from rows the admin picked.
 *
 * A plain line becomes a member carrying its intrinsic verdict; a bundle
 * contributes its MEMBERS and never its own presentation flag, so members are
 * always original CSV lines and re-bundling initializes the new package from
 * the same intrinsic facts as the first time.
 *
 * Everything the bundle says about itself is then read off that flattened list:
 * the badge, the category, and the sum. The top-level inputs decide nothing -
 * reading them let a package say one thing while its members said another.
 */
export function composeBundle(inputs: BundleInput[], name?: string): ComposedBundle | null {
  if (inputs.length < 2) return null;
  const members = inputs.flatMap((r) =>
    r.members && r.members.length > 0
      ? r.members
      : [{
        title: r.title,
        price_cents: r.priceCents,
        description: r.description,
        optional: r.optional,
      }]);
  const locked = members.filter(isLockedMember);
  return {
    title: name ?? `Bundle (${members.length} items)`,
    priceCents: members.reduce((a, m) => a + m.price_cents, 0),
    optional: locked.length === 0,
    // Structure names the package, the same direction as the registry, and off
    // the same member the badge was decided by. The registry is what set every
    // category in the first place, so it is what answers here too.
    category: categorizeLine((locked[0] ?? members[0]).title).key,
    members,
  };
}

/**
 * The members a client would gain the power to decline if this bundle were
 * flipped optional by hand.
 *
 * composeBundle's fail-safe locks a bundle the moment any member is locked, and
 * the admin can undo that on the bundle row - deliberately, it is the designed
 * backstop - but a bundle names only itself on screen, so the override
 * otherwise hides which structural work it just put behind a client toggle.
 *
 * Intrinsic facts, through the one predicate composeBundle judged the bundle
 * with, so the guard cannot disagree with the badge it is guarding. It follows
 * that this asks nothing about a package whose members are all intrinsically
 * optional, however its own badge came to read locked.
 */
export function lockedMemberTitles(members: PreviewBundleMember[]): string[] {
  return members.filter(isLockedMember).map((m) => m.title);
}

/**
 * Restore a bundle's members as standalone lines.
 *
 * Each one comes back on its own intrinsic verdict, which is the verdict it
 * went in with: the registry's, or the admin's per-line override of it. A flip
 * on the BUNDLE is a statement about that package and does not travel here, so
 * unbundling can neither free structural work the client was never meant to
 * decline nor quietly take away a selection the estimator marked optional.
 *
 * Only a member with no flag - a bundle read back from storage, where the
 * CLIENT-facing contract kept titles and prices alone - is re-badged by the
 * registry, on the same fail-safe: unknown restores locked. The category always
 * comes from the registry, which is the only thing that ever set it. The
 * description comes back when the preview still carries it, and restores empty
 * when it does not.
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
