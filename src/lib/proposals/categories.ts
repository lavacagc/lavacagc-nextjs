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
 * Matching is on the LINE TITLE only, case-insensitive, and WORD-AWARE: a
 * keyword matches whole words (plus a simple plural), never a fragment inside
 * a longer word. Bare substring matching read "Arrange delivery" as the
 * appliance keyword "range" and handed the client a toggle on it.
 *
 * When several keywords hit, the MOST SPECIFIC one wins - the longest keyword,
 * measured in characters. That is what separates "Garbage disposal", a kitchen
 * appliance, from the demolition keyword "disposal" it contains. Ties go to
 * the earlier category, and the locked categories are listed first, so a title
 * that reads as both structure and finish stays locked: "Demolition of old
 * cabinets" matches "demolition" (10) over "cabinet" (7). Structure wins,
 * the same fail-safe direction as the unknown-title default.
 */

export interface ProposalCategory {
  /** Slug stored on proposal_lines.category. */
  readonly key: string;
  /** lucide icon name the client page renders for this category. */
  readonly icon: string;
  /** Whether lines in this category default to a client-movable toggle. */
  readonly optional: boolean;
  /** Whole-word (case-insensitive) phrases of the line title that select this category. */
  readonly keywords: readonly string[];
}

/** What the registry answers with: a category's verdict, without its keywords. */
export type ProposalCategoryVerdict = Pick<ProposalCategory, 'key' | 'icon' | 'optional'>;

/**
 * Locked categories first (structure wins ties), then the optional finish
 * categories from the approved plan, in display-priority order.
 */
const REGISTRY: ProposalCategory[] = [
  // --- structure: locked ---
  { key: 'demolition', icon: 'hammer', optional: false, keywords: ['demolition', 'demo', 'gut', 'tear-out', 'disposal', 'debris', 'dumpster'] },
  { key: 'prep', icon: 'layers', optional: false, keywords: ['prep', 'preparation', 'protection', 'subfloor', 'sub-floor', 'leveling', 'framing', 'blocking', 'drywall', 'insulation'] },
  { key: 'plumbing_rough', icon: 'wrench', optional: false, keywords: ['rough-in', 'supply line', 'drain', 'valve', 'waterproofing'] },
  { key: 'electrical_rough', icon: 'zap', optional: false, keywords: ['electrical panel', 'wiring', 'circuit', 'gfci'] },
  { key: 'compliance', icon: 'clipboard-check', optional: false, keywords: ['permit', 'inspection'] },
  // --- finish selections: optional ---
  { key: 'cabinets', icon: 'columns-3', optional: true, keywords: ['cabinet', 'vanity', 'vanities'] },
  { key: 'countertops', icon: 'square', optional: true, keywords: ['countertop', 'counter top', 'quartz top', 'granite top'] },
  { key: 'tile', icon: 'grid-3x3', optional: true, keywords: ['tile', 'backsplash'] },
  { key: 'fixtures', icon: 'shower-head', optional: true, keywords: ['fixture', 'faucet', 'shower door', 'toilet', 'sink'] },
  { key: 'lighting', icon: 'lamp', optional: true, keywords: ['lighting', 'sconce', 'chandelier', 'recessed light'] },
  { key: 'hardware', icon: 'grip', optional: true, keywords: ['hardware', 'pull', 'knob', 'towel bar'] },
  { key: 'appliances', icon: 'refrigerator', optional: true, keywords: ['appliance', 'garbage disposal', 'range', 'dishwasher', 'refrigerator', 'microwave', 'hood'] },
];

/**
 * Frozen, and handed out only as copies below. The registry is the fail-safe;
 * one stray write to a shared object would outlive the request and reverse it
 * for every line the server categorizes afterwards.
 */
export const PROPOSAL_CATEGORIES: readonly ProposalCategory[] = Object.freeze(
  REGISTRY.map((cat) => Object.freeze({ ...cat, keywords: Object.freeze([...cat.keywords]) })),
);

/** The fail-safe verdict for a title nothing in the registry recognizes. */
export const UNRECOGNIZED_CATEGORY: ProposalCategoryVerdict = Object.freeze({
  key: 'general',
  icon: 'house',
  optional: false,
});

/** Down to lowercase words separated by single spaces: "Rough-In" -> "rough in". */
function normalizeWords(value: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Whole-word phrase match, tolerating a trailing plural so the registry does
 * not need both "cabinet" and "cabinets". Built once per keyword.
 */
const MATCHERS = new Map<string, RegExp>();
function matcherFor(keyword: string): RegExp {
  let matcher = MATCHERS.get(keyword);
  if (!matcher) {
    matcher = new RegExp(`(?:^| )${normalizeWords(keyword)}(?:e?s)?(?= |$)`);
    MATCHERS.set(keyword, matcher);
  }
  return matcher;
}

/**
 * The registry verdict for one line title: its category, icon, and whether it
 * defaults to optional. Never throws; the unknown answer is the locked one.
 *
 * Always a FRESH object, never the shared constant: the admin overrides a
 * verdict per line in the import preview, and that write must not travel.
 */
export function categorizeLine(title: string): ProposalCategoryVerdict {
  const haystack = normalizeWords(title);
  let best: ProposalCategory = null;
  let bestSpecificity = 0;
  if (haystack) {
    for (const cat of PROPOSAL_CATEGORIES) {
      for (const keyword of cat.keywords) {
        // Strictly longer to win, so an equally specific tie keeps the earlier
        // (structural) category.
        const specificity = normalizeWords(keyword).length;
        if (specificity <= bestSpecificity) continue;
        if (matcherFor(keyword).test(haystack)) {
          best = cat;
          bestSpecificity = specificity;
        }
      }
    }
  }
  if (!best) return { ...UNRECOGNIZED_CATEGORY };
  return { key: best.key, icon: best.icon, optional: best.optional };
}
