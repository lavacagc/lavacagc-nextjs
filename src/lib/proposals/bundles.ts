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
 *  - the badge follows the fail-safe: any locked input locks the bundle, and
 *    only an all-optional bundle gets the client toggle (all-or-nothing - the
 *    "no cherry-picking inside a package" posture the owner asked for);
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
 * The member as the admin's browser holds it: the persisted shape plus the
 * description the CSV supplied. The description exists so that unbundling is
 * lossless in the preview - it is NEVER persisted (toStoredMembers strips it,
 * and the store's schema would strip it again), because the storage contract
 * for bundle_members is titles and prices only.
 */
export interface PreviewBundleMember extends BundleMember {
  description?: string;
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
      : [{ title: r.title, price_cents: r.priceCents, description: r.description }]);
  return {
    title: name ?? `Bundle (${members.length} items)`,
    priceCents: members.reduce((a, m) => a + m.price_cents, 0),
    optional: inputs.every((r) => r.optional),
    category: inputs.find((r) => !r.optional)?.category ?? inputs[0].category,
    members,
  };
}

/**
 * Restore a bundle's members as standalone lines, re-badged by the registry
 * (the member title is all the CLIENT-facing contract kept, so its verdict is
 * recomputed - same fail-safe: unknown restores locked). The description comes
 * back when the preview still carries it; a bundle read back from storage has
 * none, so it restores empty.
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
      optional: verdict.optional,
      category: verdict.key,
    };
  });
}
