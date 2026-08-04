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
 * Some keywords name the work itself and stand alone: "demolition", "vent",
 * "cabinet", and the removal verbs, because taking a thing out IS the demolition.
 * Others name only a MANNER - "relocate", "move", "shift", "reroute" - and say
 * nothing about what is being moved. Those are read in TWO LAYERS, and the two
 * must not be confused, because gating one on the other reversed the fail-safe:
 *
 *   LAYER 1, LOCKING. A verb of manner present as a whole word ALWAYS locks the
 *      line, on its own, with nothing else required. Moving or taking out a
 *      thing is structural work whatever the thing is: moving an outlet is
 *      electrical rough-in, relocating a vent hood is a duct run and a hole in
 *      the roof, moving a vanity is moving the drain. A finish noun in the same
 *      title NEVER overrides this. Scoping the lock instead - counting the verb
 *      only when a plumbing noun sat beside it - handed the client a toggle on
 *      every one of those, because the finish noun was then the only hit left.
 *   LAYER 2, LABELING. Which locked category the line wears - its slug and its
 *      WEB-024 icon - is cosmetic, and THAT is what a trade's subject vocabulary
 *      picks: plumbing nouns label it rough plumbing, wiring nouns electrical,
 *      duct and vent nouns mechanical, and a title naming none of them takes the
 *      generic locked slug. The word may sit anywhere in the title, not beside
 *      the verb, so a line naming two trades takes the first of them in registry
 *      order. A cosmetic label is the most this layer can get wrong, and the
 *      admin sees the line in the import preview either way.
 *
 * A trade's subject vocabulary is its own `keywords` plus the finishes it
 * `serves`, folded in code. It is NOT a list of its own, and that is load-
 * bearing: a separate one held words that name the work itself - "outlet",
 * "receptacle", "pipe" - which licensed a verb but produced no hit, so a title
 * like "New outlets at backsplash" had the finish noun as its only hit and the
 * client got a toggle on the circuit. Words that name work are keywords, and
 * lock. Words that only label are the finishes, and every one of them is a
 * keyword of an OPTIONAL category, so labeling without locking is possible only
 * for the client's own selections.
 *
 * The cost of Layer 1 is a line like "Move-in cleaning", which locks on the verb
 * and wears the generic slug. That is the fail-safe pointing the safe way: one
 * badge for the admin to flip, against a toggle that deletes a gas line.
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
 * THE VOCABULARY IS NON-EXHAUSTIVE, AND A MISSING WORD IS NOT FREE. No keyword
 * list can name every phrasing an estimator writes, but the locked fail-safe
 * only catches a title that matches NOTHING, and a structural line almost
 * always names the finish it acts on: "Strip existing tile", "Plumbing for
 * farmhouse sink", "Level floor under tile". For those the finish noun is the
 * only hit, so the word this registry lacks does not fall through to the
 * fail-safe - it resolves the WRONG WAY, optional over structural work, with a
 * plausible badge on it. That is the defect class, and every phrasing found
 * matching that way is worth a keyword here.
 *
 * What makes the remainder survivable is not this file: the admin sees every
 * imported line in the import preview and can flip any badge before a proposal
 * is sent. That review is the guarantee; this registry is assistance for it.
 */

export interface ProposalCategory {
  /** Slug stored on proposal_lines.category. */
  readonly key: string;
  /** lucide icon name the client page renders for this category. */
  readonly icon: string;
  /** Whether lines in this category default to a client-movable toggle. */
  readonly optional: boolean;
  /** Whole-word (case-insensitive) phrases of the line title that select this category on their own. */
  readonly keywords: readonly string[];
  /**
   * Phrases that select this category ONLY when the title also names the
   * category's subject - its own `keywords`, or one of the finishes it
   * `serves`. This is Layer 2, labeling, and nothing else: a verb of manner
   * always locks the line through RELOCATION_VERBS below, and these entries
   * only decide which locked category it wears. Moving a gas line reads as
   * rough plumbing here; moving an outlet reads as electrical instead, and
   * moving something the registry cannot place still reads as locked.
   */
  readonly scopedKeywords?: readonly string[];
  /**
   * The FINISHES this trade acts on, for labeling only: "Shift toilet 12
   * inches" is rough plumbing because a toilet is what plumbing serves.
   * Anywhere in the title counts - adjacency is not checked.
   *
   * Every entry here must be a keyword of an OPTIONAL category, and AC5e
   * asserts it. That is the whole guard: a word that labels without locking is
   * safe only when it names a client selection. A word that names the WORK -
   * "outlet", "pipe", "duct" - must be a `keyword` instead, or the finish noun
   * beside it answers for the line and the client gets a toggle on a circuit.
   * There is deliberately no third list: the vocabulary that licenses a verb is
   * `keywords` plus `serves`, folded in code, so a word cannot sit in a locked
   * category and quietly fail to lock.
   */
  readonly serves?: readonly string[];
}

/** What the registry answers with: a category's verdict, without its keywords. */
export type ProposalCategoryVerdict = Pick<ProposalCategory, 'key' | 'icon' | 'optional'>;

/**
 * The verbs of manner (Layer 1). Each one locks the line wherever it appears as
 * a whole word: they are listed on the generic locked category below, so the
 * lock is structural rather than a rule applied on top, and repeated as
 * `scopedKeywords` on the trades that can claim a better slug for them, where
 * they label only and never decide the lock.
 *
 * The removal verbs - remove, strip out, haul away, gut, tear out - are not
 * here: they name demolition itself, so they sit in that category's own
 * keywords and lock AND label from there.
 */
const RELOCATION_VERBS: readonly string[] = [
  'relocate', 'relocating', 'relocation', 'reroute', 'rerouting',
  'move', 'moving', 'shift', 'shifting',
];

/**
 * Structural work with no trade named: Layer 1's floor in the registry, and the
 * verdict an unrecognized title falls through to. ONE literal, because those two
 * have to say the same thing - a second copy could drift, and then the same slug
 * would answer with two different WEB-024 icons depending on which path reached it.
 */
const GENERAL_LOCKED: ProposalCategoryVerdict = Object.freeze({
  key: 'general',
  icon: 'house',
  optional: false,
});

/**
 * Locked categories first (structure wins ties), then the optional finish
 * categories from the approved plan, in display-priority order.
 *
 * Order decides Layer 2 only: the first locked hit names the line, so the
 * trades come before the generic locked slug that catches a verb naming none.
 */
const REGISTRY: ProposalCategory[] = [
  // --- structure: locked ---
  // Taking-out work is written as a verb at least as often as a noun ("Remove
  // existing tile", "Cabinet removal", "Haul away old countertops"). Every one
  // of those titles also names a finish, so a registry that knows only
  // "demolition" reads the finish and hands the client a toggle on the demo.
  //
  // The verbs are listed BARE, not in the particle forms an estimator happens
  // to write: "strip out" and "strip", "tear out" and "tear off" and "tear
  // down" are the same work, and listing only the particle forms locked
  // "Strip out backsplash" while handing the client a toggle on "Strip
  // existing tile". "pull" and "take" are the exception - bare they are the
  // cabinet hardware and "take delivery", so they go in as phrases.
  {
    key: 'demolition',
    icon: 'hammer',
    optional: false,
    keywords: [
      'demolition', 'demolish', 'demolishing', 'demo', 'gut', 'gutting',
      'tear', 'tearing', 'rip', 'ripping', 'strip', 'stripping',
      'haul', 'hauling', 'remove', 'removal', 'removing',
      'pull out', 'pulling out', 'take out', 'taking out',
      'take down', 'taking down',
      'dispose', 'disposing', 'disposal', 'debris', 'dumpster',
    ],
  },
  // Substrate work: what goes under or behind the finish, and it is the finish
  // that gets named ("Level floor under tile", "Backer board for tile").
  // Waterproofing is here rather than with rough plumbing because a shower pan
  // membrane is substrate, not a pipe.
  {
    key: 'prep',
    icon: 'layers',
    optional: false,
    keywords: [
      'prep', 'preparation', 'protect', 'protecting', 'protective', 'protection',
      'subfloor', 'sub-floor', 'level', 'leveling', 'levelling',
      'backer board', 'cement board', 'waterproof', 'waterproofing',
      'framing', 'blocking', 'drywall', 'insulation',
    ],
  },
  // Moving a service is rough work whatever it serves, and the title names what
  // it serves: "Move sink plumbing", "Relocate range gas line", "Shift toilet
  // 12 inches". Reading the fixture and skipping the verb handed the client a
  // toggle that deletes a drain relocation. The named line runs are here for the
  // same reason - "supply line" alone missed "water line" and "gas line".
  //
  // The verbs are listed here as SCOPED because they are true of any trade, and
  // this is only the claim on the slug: taking them as plumbing on their own put
  // a wrench icon on "Relocate outlet and wiring" and on "Move-in cleaning".
  // Bare "line" is in no list at all, or "Move dryer vent line" would take a
  // wrench off the word "line"; the named runs carry it instead.
  //
  // The trade's own name is a keyword too, and so is its pipework. A word that
  // only licenses a verb produces no hit of its own, so the fixture in the same
  // title answered for the whole line and the client got a toggle on the
  // rough-in: that was true of "plumbing" ("Plumbing for farmhouse sink") and
  // just as true of "pipe" ("Trench and pipe for island sink"). Only the
  // FIXTURES the trade serves label without locking, below.
  {
    key: 'plumbing_rough',
    icon: 'wrench',
    optional: false,
    keywords: [
      'plumbing', 'rough-in', 'supply line', 'water line', 'gas line',
      'drain line', 'waste line', 'drain', 'valve', 'pipe', 'piping',
    ],
    scopedKeywords: RELOCATION_VERBS,
    serves: ['sink', 'toilet'],
  },
  // Moving an outlet, a circuit or a light is rough electrical, and the title
  // names the fitting rather than the trade ("Move backsplash outlet"). The
  // fittings are keywords for the same reason the pipework is: a receptacle or
  // a switch is never a client selection, and leaving them label-only handed
  // the client a toggle on "New outlets at backsplash".
  //
  // The panel goes in as phrases, not bare: a bare "panel" is the shaker door
  // and the panel-ready refrigerator, which are selections. "switch" does go in
  // bare, and locks "Switch to matte black hardware" with it - the safe
  // direction, and one badge for the admin, against reading "Switch and dimmer
  // for recessed lights" as a light the client may drop.
  {
    key: 'electrical_rough',
    icon: 'zap',
    optional: false,
    keywords: [
      'electrical', 'wiring', 'circuit', 'gfci', 'outlet', 'receptacle',
      'switch', 'electrical panel', 'sub panel', 'panel upgrade',
    ],
    scopedKeywords: RELOCATION_VERBS,
    serves: ['light', 'lighting', 'sconce', 'chandelier'],
  },
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
    scopedKeywords: RELOCATION_VERBS,
    serves: ['hood'],
  },
  { key: 'compliance', icon: 'clipboard-check', optional: false, keywords: ['permit', 'inspection'] },
  // Layer 1's floor, and the last locked category so every trade above claims a
  // better slug first. A verb of manner naming no trade at all still locks here:
  // "Relocate medicine cabinet" is moving a cabinet off a wall, not a selection
  // the client may drop. Bare "rough" sits here for the same reason - rough work
  // is structural whatever it is roughing in, and the trades above take it off
  // this category whenever the title names one ("Electrical rough for recessed
  // lights"). The verdict is the unrecognized one, because it says the same
  // thing: structural work, trade unstated.
  { ...GENERAL_LOCKED, keywords: [...RELOCATION_VERBS, 'rough'] },
  // --- finish selections: optional ---
  { key: 'cabinets', icon: 'columns-3', optional: true, keywords: ['cabinet', 'vanity', 'vanities'] },
  { key: 'countertops', icon: 'square', optional: true, keywords: ['countertop', 'counter top', 'quartz top', 'granite top'] },
  { key: 'tile', icon: 'grid-3x3', optional: true, keywords: ['tile', 'backsplash'] },
  { key: 'fixtures', icon: 'shower-head', optional: true, keywords: ['fixture', 'faucet', 'shower door', 'toilet', 'sink'] },
  { key: 'lighting', icon: 'lamp', optional: true, keywords: ['lighting', 'light', 'sconce', 'chandelier', 'recessed light'] },
  { key: 'hardware', icon: 'grip', optional: true, keywords: ['hardware', 'pull', 'knob', 'towel bar'] },
  { key: 'appliances', icon: 'refrigerator', optional: true, keywords: ['appliance', 'garbage disposal', 'range hood', 'vent hood', 'range', 'dishwasher', 'refrigerator', 'microwave', 'hood'] },
];

/**
 * Frozen, and handed out only as copies below. The registry is the fail-safe;
 * one stray write to a shared object would outlive the request and reverse it
 * for every line the server categorizes afterwards.
 */
export const PROPOSAL_CATEGORIES: readonly ProposalCategory[] = Object.freeze(
  REGISTRY.map((cat) => Object.freeze({
    ...cat,
    keywords: Object.freeze([...cat.keywords]),
    scopedKeywords: Object.freeze([...(cat.scopedKeywords || [])]),
    serves: Object.freeze([...(cat.serves || [])]),
  })),
);

/**
 * The fail-safe verdict for a title nothing in the registry recognizes: the
 * `general` category above, and the same object, so the two can never diverge.
 */
export const UNRECOGNIZED_CATEGORY: ProposalCategoryVerdict = GENERAL_LOCKED;

/** Down to lowercase words separated by single spaces: "Rough-In" -> "rough in". */
function normalizeWords(value: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Whole-word phrase match, tolerating a trailing plural so the registry does
 * not need both "cabinet" and "cabinets". Built once per keyword.
 *
 * The plural allowed is the one ENGLISH forms from that keyword, and only that
 * one: "-es" after a sibilant ("backsplash" -> "backsplashes"), plain "-s"
 * otherwise. Offering both to every keyword matched words the registry never
 * named - "strip" read "Tile stripes accent band" as demolition - which is the
 * fragment matching this whole function exists to prevent, one letter further
 * out.
 *
 * The leading `(?:^| )` consumes the separating space, so the keyword's own
 * span starts one character in whenever the match did not begin at the string
 * start - the containment rule below compares the keyword text, not the space.
 */
const MATCHERS = new Map<string, RegExp>();
function matcherFor(keyword: string): RegExp {
  let matcher = MATCHERS.get(keyword);
  if (!matcher) {
    const phrase = normalizeWords(keyword);
    const plural = /(?:s|x|z|ch|sh)$/.test(phrase) ? '(?:es)?' : 's?';
    matcher = new RegExp(`(?:^| )${phrase}${plural}(?= |$)`, 'g');
    MATCHERS.set(keyword, matcher);
  }
  return matcher;
}

/** Whether the title names any of these phrases as whole words. */
function mentionsAny(haystack: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => {
    const matcher = matcherFor(phrase);
    matcher.lastIndex = 0;
    return matcher.test(haystack);
  });
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
    // A verb of manner claims THIS category's slug only when the title also
    // names the category's subject - its own keywords, or a finish it serves -
    // anywhere in the title. The two lists are folded HERE rather than written
    // out as a third one, so every word that licenses a verb either locks on
    // its own or is a client selection, and there is no third state.
    //
    // Sitting the verb out costs the line nothing but a label: the generic
    // locked category lists the same verbs unscoped, so Layer 1 has locked it.
    const licensed = cat.scopedKeywords.length
      && (mentionsAny(haystack, cat.keywords) || mentionsAny(haystack, cat.serves));
    const keywords = licensed ? [...cat.keywords, ...cat.scopedKeywords] : cat.keywords;
    for (const keyword of keywords) {
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
