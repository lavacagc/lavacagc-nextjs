/**
 * Proposal Page Pod - the category registry (spec WEB-021, WEB-024).
 *
 * One keyword registry decides, in code, which estimate lines render as
 * optional (toggles the client can move) and which render locked. The spec's
 * rule: finish selections are optional, structure is locked - with a fail-safe
 * the owner approved on the 8/3 plan: A TITLE THE REGISTRY DOES NOT RECOGNIZE
 * IS LOCKED. A typo can never make demolition optional; the admin can flip any
 * line's badge in the import preview before sending.
 *
 * Each category also carries its lucide icon name (WEB-024): the client page
 * derives imagery from the category, so the estimator never supplies it.
 * Icons are lucide, per house rule - never emoji.
 *
 * Matching is on the LINE TITLE only, case-insensitive, first match wins in
 * the order below. Locked keywords are checked FIRST so a title like
 * "Demolition of old cabinets" stays locked: when a line reads as both
 * structure and finish, structure wins - the same fail-safe direction as the
 * unknown-title default.
 */

export interface ProposalCategory {
  /** Slug stored on proposal_lines.category. */
  key: string;
  /** lucide icon name the client page renders for this category. */
  icon: string;
  /** Whether lines in this category default to a client-movable toggle. */
  optional: boolean;
  /** Case-insensitive substrings of the line title that select this category. */
  keywords: string[];
}

/**
 * Locked categories first (structure wins ties), then the optional finish
 * categories from the approved plan, in display-priority order.
 */
export const PROPOSAL_CATEGORIES: ProposalCategory[] = [
  // --- structure: locked ---
  { key: 'demolition', icon: 'hammer', optional: false, keywords: ['demolition', 'demo ', 'gut ', 'tear-out', 'tear out', 'disposal', 'dumpster'] },
  { key: 'prep', icon: 'layers', optional: false, keywords: ['prep', 'protection', 'subfloor', 'leveling', 'framing', 'blocking', 'drywall', 'insulation'] },
  { key: 'plumbing_rough', icon: 'wrench', optional: false, keywords: ['rough-in', 'rough in', 'supply line', 'drain', 'valve', 'waterproofing'] },
  { key: 'electrical_rough', icon: 'zap', optional: false, keywords: ['electrical panel', 'wiring', 'circuit', 'gfci'] },
  { key: 'compliance', icon: 'clipboard-check', optional: false, keywords: ['permit', 'inspection'] },
  // --- finish selections: optional ---
  { key: 'cabinets', icon: 'columns-3', optional: true, keywords: ['cabinet', 'vanity'] },
  { key: 'countertops', icon: 'square', optional: true, keywords: ['countertop', 'counter top', 'quartz top', 'granite top'] },
  { key: 'tile', icon: 'grid-3x3', optional: true, keywords: ['tile', 'backsplash'] },
  { key: 'fixtures', icon: 'shower-head', optional: true, keywords: ['fixture', 'faucet', 'shower door', 'toilet', 'sink'] },
  { key: 'lighting', icon: 'lamp', optional: true, keywords: ['lighting', 'sconce', 'chandelier', 'recessed light'] },
  { key: 'hardware', icon: 'grip', optional: true, keywords: ['hardware', 'pull', 'knob', 'towel bar'] },
  { key: 'appliances', icon: 'refrigerator', optional: true, keywords: ['appliance', 'range', 'dishwasher', 'refrigerator', 'microwave', 'hood'] },
];

/** The fail-safe verdict for a title nothing in the registry recognizes. */
export const UNRECOGNIZED_CATEGORY: Pick<ProposalCategory, 'key' | 'icon' | 'optional'> = {
  key: 'general',
  icon: 'house',
  optional: false,
};

/**
 * The registry verdict for one line title: its category, icon, and whether it
 * defaults to optional. Never throws; the unknown answer is the locked one.
 */
export function categorizeLine(title: string): Pick<ProposalCategory, 'key' | 'icon' | 'optional'> {
  const t = (title || '').toLowerCase();
  for (const cat of PROPOSAL_CATEGORIES) {
    if (cat.keywords.some((k) => t.includes(k))) {
      return { key: cat.key, icon: cat.icon, optional: cat.optional };
    }
  }
  return UNRECOGNIZED_CATEGORY;
}
