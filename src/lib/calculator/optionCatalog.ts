/**
 * Bridges the calculator UI's hardcoded option catalog to the production
 * calculator_option_items table.
 *
 * History (verified live 2026-07-13): the UI sends kebab-case ids
 * ('heated-floor') but the calculate-estimate edge fn matched
 * calculator_option_items.NAME ('Heated Floors'), so NO selection ever
 * matched - calculator_lead_selections stayed empty and every estimate
 * omitted all option costs. Name-matching was also unsafe: the seeded catalog
 * contains duplicate rows per name, and a matched name double-counted its
 * cost (one "Soaking Tub" pick added $11,200 instead of $5,600).
 *
 * The fix: the client maps each UI option to a specific DB row UUID where the
 * correspondence is unambiguous (prices are the owner-seeded catalog values),
 * and sends everything else - unmapped options, the quality level, the
 * additional-features picks (all previously DISCARDED) - as explicit
 * "unmatched" selections that the fn records as zero-cost
 * calculator_lead_selections rows ("priced at consultation"). Nothing a
 * visitor picks is silently dropped anymore.
 *
 * The UUIDs are production rows (stable since the 2025-10-21 seed). In an
 * environment without them (preview DB), the fn simply finds no rows and the
 * selection degrades to unmatched - recorded, not lost.
 *
 * If the catalog is ever re-seeded or curated (see the follow-up to render
 * the UI from the DB), update this map or delete it in favor of DB-driven
 * options.
 */

/** UI option id -> production calculator_option_items.id */
export const OPTION_DB_MAP: Record<string, string> = {
  'soaking-tub': 'd119ebf1-a4ac-424f-9082-e173261592be', // Soaking Tub ($5,600)
  'heated-floor': '076bd80a-e385-4263-8207-80c934469ee0', // Heated Floors ($2,500)
  'custom-tile': 'da9b85f1-3e50-46a7-bdcb-081276f20ddc', // Custom Tile Work ($4,000)
  'dual-sink': 'c1e73b56-36c9-4b75-99d5-af6311c8e853', // Double Vanity ($4,400)
  'custom-cabinets': '34d44ca0-fa58-4754-a9f4-78e781518e9f', // Custom Cabinets ($16,000)
  'quartz-countertops': '4161b62e-f2f6-4b64-b491-e89b1725582f', // Quartz Countertops ($6,500)
};

/** Human labels + categories for every UI option id (for unmatched recording). */
export const OPTION_LABELS: Record<string, { label: string; category: string }> = {
  // Bathroom
  'luxury-vanity': { label: 'Luxury Vanity', category: 'Fixtures' },
  'dual-sink': { label: 'Dual Sink Vanity', category: 'Fixtures' },
  'soaking-tub': { label: 'Soaking Tub', category: 'Fixtures' },
  'rainfall-shower': { label: 'Rainfall Shower Head', category: 'Fixtures' },
  'custom-tile': { label: 'Custom Tile Work', category: 'Finishes' },
  'heated-floor': { label: 'Heated Floor', category: 'Finishes' },
  'led-mirror': { label: 'LED Mirror', category: 'Features' },
  'bluetooth-fan': { label: 'Bluetooth Exhaust Fan', category: 'Features' },
  // Kitchen
  'custom-cabinets': { label: 'Custom Cabinetry', category: 'Cabinets & Storage' },
  'soft-close-drawers': { label: 'Soft-Close Drawers', category: 'Cabinets & Storage' },
  'pantry-system': { label: 'Walk-In Pantry', category: 'Cabinets & Storage' },
  'quartz-countertops': { label: 'Quartz Countertops', category: 'Countertops & Surfaces' },
  'tile-backsplash': { label: 'Designer Backsplash', category: 'Countertops & Surfaces' },
  'waterfall-edge': { label: 'Waterfall Edge Island', category: 'Countertops & Surfaces' },
  'stainless-appliances': { label: 'Stainless Steel Appliance Package', category: 'Appliances & Fixtures' },
  'farmhouse-sink': { label: 'Farmhouse Sink', category: 'Appliances & Fixtures' },
  'pot-filler': { label: 'Pot Filler Faucet', category: 'Appliances & Fixtures' },
  // Living space
  'hardwood-floors': { label: 'Hardwood Flooring', category: 'Flooring' },
  'luxury-vinyl': { label: 'Luxury Vinyl Plank', category: 'Flooring' },
  'crown-molding': { label: 'Crown Molding', category: 'Walls & Ceilings' },
  'accent-wall': { label: 'Accent Wall Treatment', category: 'Walls & Ceilings' },
  'coffered-ceiling': { label: 'Coffered Ceiling', category: 'Walls & Ceilings' },
  'built-in-shelving': { label: 'Built-In Shelving', category: 'Built-Ins & Features' },
  'fireplace-surround': { label: 'Fireplace Surround', category: 'Built-Ins & Features' },
  'recessed-lighting': { label: 'Recessed LED Lighting', category: 'Built-Ins & Features' },
  // AdditionalFeaturesStep
  'custom-cabinetry': { label: 'Custom Cabinetry', category: 'Additional Features' },
  'premium-hardware': { label: 'Premium Hardware & Accessories', category: 'Additional Features' },
  'mirror-upgrade': { label: 'Custom Mirror or Medicine Cabinet', category: 'Additional Features' },
  'glass-enclosure': { label: 'Frameless Glass Shower Enclosure', category: 'Additional Features' },
};

const QUALITY_LABELS: Record<string, string> = {
  budget: 'Budget',
  'mid-range': 'Mid-Range',
  premium: 'Premium',
};

export interface UnmatchedSelection {
  category: string;
  label: string;
}

export interface SelectionPayload {
  /** DB row UUIDs the fn prices from the catalog (deduped). */
  selected_option_ids: string[];
  /** Everything else the visitor picked - recorded as zero-cost selections. */
  unmatched_selections: UnmatchedSelection[];
}

export function buildSelectionPayload(args: {
  materialOptionIds: string[];
  qualityLevel?: string | null;
  additionalFeatureIds?: string[];
}): SelectionPayload {
  const ids = new Set<string>();
  const unmatched: UnmatchedSelection[] = [];
  const seenUnmatched = new Set<string>();
  const addUnmatched = (selection: UnmatchedSelection) => {
    const key = `${selection.category}\u0000${selection.label}`;
    if (seenUnmatched.has(key)) return;
    seenUnmatched.add(key);
    unmatched.push(selection);
  };

  for (const optionId of args.materialOptionIds) {
    const dbId = OPTION_DB_MAP[optionId];
    if (dbId) {
      ids.add(dbId);
    } else {
      const meta = OPTION_LABELS[optionId];
      addUnmatched(meta ?? { category: 'Options', label: optionId });
    }
  }
  for (const featureId of args.additionalFeatureIds ?? []) {
    const meta = OPTION_LABELS[featureId];
    addUnmatched(meta ?? { category: 'Additional Features', label: featureId });
  }
  if (args.qualityLevel) {
    addUnmatched({
      category: 'Quality Level',
      label: QUALITY_LABELS[args.qualityLevel] ?? args.qualityLevel,
    });
  }

  return { selected_option_ids: [...ids], unmatched_selections: unmatched };
}
