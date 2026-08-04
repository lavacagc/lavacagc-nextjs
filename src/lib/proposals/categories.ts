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
 * When several keywords hit, two rules settle it, in this order:
 *
 *   1. A hit whose matched text sits entirely INSIDE a longer hit is not
 *      evidence of its own category and is dropped. This is what separates
 *      "Garbage disposal", a kitchen appliance, from the demolition keyword
 *      "disposal" it contains.
 *   2. Of what survives, STRUCTURE WINS - any locked category beats any
 *      optional one, whatever the keyword lengths are. "Demo old counter top"
 *      is demolition; "Refrigerator water supply line" is rough plumbing.
 *      Comparing keyword lengths globally instead handed the client a toggle
 *      on the demolition, because "demo" is shorter than "counter top".
 *
 * Ties inside a tier go to the earlier category, and the locked categories are
 * listed first. Structure wins, the same fail-safe direction as the
 * unknown-title default.
 *
 * THE VOCABULARY IS DELIBERATELY NON-EXHAUSTIVE. No keyword list can name every
 * phrasing an estimator writes, and this one is not trying to: a title it does
 * not recognize resolves LOCKED, and the admin flips any line's badge in the
 * import preview before the proposal is sent. Those two together are the
 * completeness backstop, by design. So a word the registry is missing is
 * operating cost - one more badge to flip - and not a defect; what IS a defect
 * is a title that matches the WRONG WAY, resolving optional when the work is
 * structural, because the fail-safe never runs and the admin sees a plausible
 * badge. Measure this registry against that line: adding vocabulary is how the
 * second kind gets fixed, and the first kind is a judgement about how much
 * flipping the admin should have to do.
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
  // Taking-out work is written as a verb at least as often as a noun ("Remove
  // existing tile", "Cabinet removal", "Haul away old countertops"). Every one
  // of those titles also names a finish, so a registry that knows only
  // "demolition" reads the finish and hands the client a toggle on the demo.
  {
    key: 'demolition',
    icon: 'hammer',
    optional: false,
    keywords: [
      'demolition', 'demolish', 'demolishing', 'demo', 'gut', 'gutting',
      'tear-out', 'tearing out', 'rip out', 'ripping out',
      'strip out', 'stripping out', 'remove', 'removal', 'removing',
      'haul away', 'hauling away', 'haul off', 'hauling off',
      'disposal', 'debris', 'dumpster',
    ],
  },
  { key: 'prep', icon: 'layers', optional: false, keywords: ['prep', 'preparation', 'protect', 'protecting', 'protective', 'protection', 'subfloor', 'sub-floor', 'leveling', 'framing', 'blocking', 'drywall', 'insulation'] },
  // Moving a service is rough work whatever it serves, and the title names what
  // it serves: "Move sink plumbing", "Relocate range gas line", "Shift toilet
  // 12 inches". Reading the fixture and skipping the verb handed the client a
  // toggle that deletes a drain relocation. The named line runs are here for the
  // same reason - "supply line" alone missed "water line" and "gas line".
  {
    key: 'plumbing_rough',
    icon: 'wrench',
    optional: false,
    keywords: [
      'rough-in', 'supply line', 'water line', 'gas line', 'drain line', 'waste line',
      'drain', 'valve', 'waterproofing',
      'relocate', 'relocating', 'relocation', 'reroute', 'rerouting',
      'move', 'moving', 'shift', 'shifting',
    ],
  },
  { key: 'electrical_rough', icon: 'zap', optional: false, keywords: ['electrical panel', 'wiring', 'circuit', 'gfci'] },
  // Venting and ducting are a roof or wall penetration and a run through the
  // framing, so they are never the client's to remove - but the title almost
  // always names the appliance they serve ("Range hood vent to exterior"), and
  // an appliance keyword alone read that as a toggle. The appliance itself stays
  // optional through the containment rule: "vent" inside the phrase "vent hood"
  // is the appliance's own name, not evidence of duct work, exactly as
  // "disposal" inside "garbage disposal" is not evidence of demolition.
  {
    key: 'mechanical',
    icon: 'air-vent',
    optional: false,
    keywords: ['vent', 'venting', 'duct', 'ductwork', 'ducting', 'exhaust', 'flue'],
  },
  { key: 'compliance', icon: 'clipboard-check', optional: false, keywords: ['permit', 'inspection'] },
  // --- finish selections: optional ---
  { key: 'cabinets', icon: 'columns-3', optional: true, keywords: ['cabinet', 'vanity', 'vanities'] },
  { key: 'countertops', icon: 'square', optional: true, keywords: ['countertop', 'counter top', 'quartz top', 'granite top'] },
  { key: 'tile', icon: 'grid-3x3', optional: true, keywords: ['tile', 'backsplash'] },
  { key: 'fixtures', icon: 'shower-head', optional: true, keywords: ['fixture', 'faucet', 'shower door', 'toilet', 'sink'] },
  { key: 'lighting', icon: 'lamp', optional: true, keywords: ['lighting', 'sconce', 'chandelier', 'recessed light'] },
  { key: 'hardware', icon: 'grip', optional: true, keywords: ['hardware', 'pull', 'knob', 'towel bar'] },
  { key: 'appliances', icon: 'refrigerator', optional: true, keywords: ['appliance', 'garbage disposal', 'range hood', 'vent hood', 'range', 'dishwasher', 'refrigerator', 'microwave', 'hood'] },
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
 *
 * The leading `(?:^| )` consumes the separating space, so the keyword's own
 * span starts one character in whenever the match did not begin at the string
 * start - the containment rule below compares the keyword text, not the space.
 */
const MATCHERS = new Map<string, RegExp>();
function matcherFor(keyword: string): RegExp {
  let matcher = MATCHERS.get(keyword);
  if (!matcher) {
    matcher = new RegExp(`(?:^| )${normalizeWords(keyword)}(?:e?s)?(?= |$)`, 'g');
    MATCHERS.set(keyword, matcher);
  }
  return matcher;
}

/** Where one keyword matched the title, and which category claimed it. */
interface KeywordHit {
  cat: ProposalCategory;
  start: number;
  end: number;
}

function collectHits(haystack: string): KeywordHit[] {
  const hits: KeywordHit[] = [];
  for (const cat of PROPOSAL_CATEGORIES) {
    for (const keyword of cat.keywords) {
      const matcher = matcherFor(keyword);
      matcher.lastIndex = 0;
      let m: RegExpExecArray;
      while ((m = matcher.exec(haystack)) !== null) {
        hits.push({
          cat,
          start: m.index + (m[0].charAt(0) === ' ' ? 1 : 0),
          end: m.index + m[0].length,
        });
        if (matcher.lastIndex === m.index) matcher.lastIndex++;
      }
    }
  }
  return hits;
}

/** True when a strictly longer hit covers this one: "disposal" in "garbage disposal". */
function isSwallowed(hit: KeywordHit, hits: KeywordHit[]): boolean {
  return hits.some((other) => other.end - other.start > hit.end - hit.start
    && other.start <= hit.start && other.end >= hit.end);
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
  if (!haystack) return { ...UNRECOGNIZED_CATEGORY };
  const hits = collectHits(haystack).filter((hit, _i, all) => !isSwallowed(hit, all));
  // Hits arrive in registry order, locked categories first, so the first
  // structural survivor is the answer whenever there is one.
  const best = hits.find((hit) => !hit.cat.optional) || hits[0];
  if (!best) return { ...UNRECOGNIZED_CATEGORY };
  return { key: best.cat.key, icon: best.cat.icon, optional: best.cat.optional };
}

/**
 * The lucide icon a category renders with (WEB-024). The registry is the one
 * source of truth for it: nothing downstream stores a second copy that can
 * drift. Unknown slugs get the same icon as the unrecognized verdict.
 */
export function iconForCategory(key: string): string {
  const cat = PROPOSAL_CATEGORIES.find((c) => c.key === key);
  return cat ? cat.icon : UNRECOGNIZED_CATEGORY.icon;
}
