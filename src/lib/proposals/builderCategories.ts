/**
 * The proposal BUILDER's category library (round 4, 2026-08-08).
 *
 * The CSV importer's registry (categories.ts) exists to GUESS a category from
 * an estimator line's wording - keywords, verbs, fail-safes. The builder needs
 * no guessing: the admin picks the category outright. So the builder's library
 * is a flat list of {key, label, optional-default}, made of:
 *
 *  1. the registry's own 14 categories, with their lock verdicts imported so
 *     the two surfaces can never disagree about what is structural;
 *  2. a wider set of common construction cost categories the owner asked for
 *     ("a pretty hefty amount of main categories");
 *  3. whatever the admin has added to public.proposal_categories on the fly
 *     (fetched by /api/admin/proposal-categories and merged by the picker).
 *
 * Lock rule carried over from the spec: STRUCTURE IS LOCKED for the client;
 * only finish-selection categories default to client-optional, and anything
 * unclear stays locked (the registry's fail-safe posture).
 */
import { PROPOSAL_CATEGORIES } from './categories';

export interface BuilderCategory {
  key: string;
  label: string;
  /** Default client-toggle verdict for lines in this category. */
  optional: boolean;
  /** True when the admin created it (proposal_categories row), not built-in. */
  custom?: boolean;
}

function titleCase(key: string): string {
  return key
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** The registry's categories, verdicts included, as builder entries. */
const REGISTRY_CATEGORIES: BuilderCategory[] = PROPOSAL_CATEGORIES.map((c) => ({
  key: c.key,
  label: titleCase(c.key),
  optional: c.optional,
}));

/**
 * The wider trade list. Keys that ALSO exist in the registry are excluded here
 * (the registry's verdict wins); everything below is builder-only. Structure
 * and site work locked; finish-selection categories optional.
 */
const EXTENDED_CATEGORIES: BuilderCategory[] = [
  // --- site + structure: locked ---
  { key: 'permits-fees', label: 'Permits & Fees', optional: false },
  { key: 'design-engineering', label: 'Design & Engineering', optional: false },
  { key: 'excavation', label: 'Excavation & Site Work', optional: false },
  { key: 'foundation', label: 'Foundation', optional: false },
  { key: 'framing', label: 'Framing', optional: false },
  { key: 'roofing', label: 'Roofing', optional: false },
  { key: 'siding', label: 'Siding & Exterior Trim', optional: false },
  { key: 'windows-doors', label: 'Windows & Doors', optional: false },
  { key: 'insulation', label: 'Insulation', optional: false },
  { key: 'drywall', label: 'Drywall & Plaster', optional: false },
  { key: 'plumbing', label: 'Plumbing', optional: false },
  { key: 'electrical', label: 'Electrical', optional: false },
  { key: 'hvac', label: 'HVAC', optional: false },
  { key: 'waterproofing', label: 'Waterproofing', optional: false },
  { key: 'masonry', label: 'Masonry & Concrete', optional: false },
  { key: 'structural-steel', label: 'Structural Steel', optional: false },
  { key: 'cleanup', label: 'Cleanup & Protection', optional: false },
  { key: 'contingency', label: 'Contingency', optional: false },
  // --- finish selections: client-optional by default ---
  { key: 'flooring', label: 'Flooring', optional: true },
  { key: 'decking', label: 'Decking & Outdoor Living', optional: true },
  { key: 'landscaping', label: 'Landscaping', optional: true },
  { key: 'smart-home', label: 'Smart Home & AV', optional: true },
  { key: 'closets-storage', label: 'Closets & Storage', optional: true },
  { key: 'specialty-finishes', label: 'Specialty Finishes', optional: true },
];

const registryKeys = new Set(REGISTRY_CATEGORIES.map((c) => c.key));

export const BUILDER_CATEGORIES: readonly BuilderCategory[] = Object.freeze([
  ...REGISTRY_CATEGORIES,
  ...EXTENDED_CATEGORIES.filter((c) => !registryKeys.has(c.key)),
]);

/** Case-insensitive lookup across a merged library (built-in + custom). */
export function findCategory(
  library: readonly BuilderCategory[],
  query: string,
): BuilderCategory | undefined {
  const q = query.trim().toLowerCase();
  return library.find((c) => c.key === q || c.label.toLowerCase() === q);
}
