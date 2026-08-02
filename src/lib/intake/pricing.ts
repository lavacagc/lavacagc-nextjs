/**
 * The starting prices the intake flow is allowed to say out loud.
 *
 * These are the owner's real numbers, given on 1 Aug 2026. They are starting
 * prices, not ranges, which is why screen 7 states one and asks how it lands
 * rather than offering a menu of bands: a band I invented could be quoted back
 * at us six weeks later, and would deserve to be.
 *
 * A project type with no honest number gets NO anchor and the question is
 * skipped entirely. Inventing one to keep the flow symmetrical would be the
 * worst option available.
 */

export type AnchorUnit = 'total' | 'per_sqft';

export interface PriceAnchor {
  /** Dollars. Either a starting total or a starting rate, per `unit`. */
  amount: number;
  unit: AnchorUnit;
  /** The full sentence shown to the lead, already phrased. */
  sentence: string;
}

/**
 * Keyed by the project_type values the lead forms actually submit.
 * Lookup is case-insensitive and tolerant of the singular/plural drift between
 * "Home Addition" (the form) and "Home Additions" (how the owner writes it).
 */
const ANCHORS: Record<string, PriceAnchor> = {
  'kitchen remodeling': {
    amount: 35000,
    unit: 'total',
    sentence:
      'A kitchen with a new layout, cabinetry, stone and lighting starts at $35,000, and goes up from there with size and finish level.',
  },
  'bathroom renovation': {
    amount: 16000,
    unit: 'total',
    sentence:
      'A bathroom with new tile, fixtures, waterproofing and a vanity starts at $16,000, and goes up from there with size and finish level.',
  },
  'basement finishing': {
    amount: 30000,
    unit: 'total',
    sentence:
      'Finishing a basement into real living space, with egress and a full build-out, starts at $30,000.',
  },
  'home addition': {
    amount: 350,
    unit: 'per_sqft',
    sentence:
      "Additions start around $350 a square foot, because you're paying for structure and new square footage, not just finishes.",
  },
};

/** Spelling variants that mean the same thing as a key above. */
const ALIASES: Record<string, string> = {
  'home additions': 'home addition',
  kitchen: 'kitchen remodeling',
  'kitchen remodel': 'kitchen remodeling',
  bathroom: 'bathroom renovation',
  'bathroom remodel': 'bathroom renovation',
  basement: 'basement finishing',
};

/**
 * The anchor for a project type, or null when there is no honest number.
 *
 * Null is a real answer, not a failure: Interior Finishing varies too much by
 * scope, and Whole Home Remodeling has no starting figure the owner gave. Both
 * skip the price question rather than receive a fabricated one.
 */
export function priceAnchorFor(projectType: string | null | undefined): PriceAnchor | null {
  if (!projectType) return null;
  const key = projectType.trim().toLowerCase();
  const resolved = ALIASES[key] ?? key;
  return ANCHORS[resolved] ?? null;
}

/** True when the price step should be shown at all. */
export function hasPriceAnchor(projectType: string | null | undefined): boolean {
  return priceAnchorFor(projectType) !== null;
}

/**
 * What the flow says instead, when there is no anchor. Said out loud rather
 * than skipped silently, so the lead is not left wondering whether we dodged
 * the money question.
 */
export const NO_ANCHOR_SENTENCE =
  "Work like that varies far too much by scope for me to put a number on it, and I'd rather say so than guess. Alex will give you a real one.";
