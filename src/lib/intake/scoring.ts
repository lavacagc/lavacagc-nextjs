/**
 * Scoring and bucketing a COMPLETED intake (WEB-019).
 *
 * Deliberately separate from `scoreLead()`, which runs at form-submit time and
 * stays untouched. Two reasons:
 *
 * 1. The signals WEB-019 names - town, scope tier, timeline, photos - are
 *    mostly unknown when the form is submitted. They only exist once the lead
 *    has answered, which is why the criterion says "every COMPLETED CHAT
 *    produces a hot or cold bucket".
 *
 * 2. `scoreLead()` cannot route. Project type alone contributes 50-95 points
 *    against an 80-point hot threshold, so a bathroom lead from Princeton with
 *    no phone number scores 105 and buckets hot. Adding these signals to it
 *    would add points to an already-saturated scale rather than separate
 *    anything.
 *
 * The submit-time tier keeps its three values and its meaning; this bucket is
 * two-valued because routing is a two-way decision.
 */
import { cityInServiceArea } from '@/lib/leadScoring';
import { hasPriceAnchor } from './pricing';
import { normalizeTown } from './serviceArea';

export type IntakeBucket = 'hot' | 'cold';

export interface IntakeScoringInput {
  answers: Record<string, string>;
  /**
   * null when the count could not be read, which is NOT zero. Scoring an
   * unreadable count as "no photos" costs the lead 10 points and writes a false
   * statement onto the lead row permanently, and with HOT_AT at 55 that misroutes
   * any lead scoring 55-64 on a transient Supabase blip - the precise outcome
   * this module exists to prevent. See the bucket, where the doubt is settled.
   *
   * Required, not optional: null means "we tried and could not tell" and earns
   * the unavailable signal and the benefit of the doubt, so a caller who simply
   * forgot to pass a count must not be able to claim either by omission.
   */
  photoCount: number | null;
  /**
   * The lead's project type, because it decides whether the price question was
   * ever PUT to them - `hasPriceAnchor` is the same predicate the flow uses to
   * skip the step for work with no honest starting number.
   *
   * Required for the same reason `photoCount` is. A lead who was never asked is
   * judged on a smaller scale, so a caller who omitted the type would be handing
   * out that smaller scale - and the signal that says why - by accident.
   */
  projectType: string | null;
}

export interface IntakeScoringResult {
  score: number;
  /**
   * The most this particular lead could have scored. 100 normally, 80 where the
   * flow never asked about price - a denominator, so a score is never read
   * against a scale it was not measured on.
   */
  outOf: number;
  /** The threshold actually applied, scaled to `outOf`. */
  hotAt: number;
  bucket: IntakeBucket;
  /** Human-readable, one per contributing signal. Written to the lead. */
  signals: string[];
}

/**
 * Thresholds, with the arithmetic stated so they can be tuned without being
 * re-derived from scratch.
 *
 * Maximum reachable is 100: town 20, scope 25, timeline 25, photos 10,
 * price reaction 20. HOT_AT 55 means a lead needs roughly two strong signals
 * plus a weak one, and cannot get there on any single input.
 *
 * A lead the flow never asked about price reaches 80, not 100, and is judged
 * against `hotThresholdFor(80)` - see below.
 *
 * Exported because the completion brief has to be able to recognise a bucket
 * that disagrees with its own score - see the benefit of the doubt below.
 */
export const HOT_AT = 55;

const MAX_SCORE = 100;

/** What photos are worth - and so how much doubt an unreadable count creates. */
const PHOTO_POINTS = 10;

/** What the price reaction is worth, and so how much scale it takes with it. */
const PRICE_POINTS_MAX = 20;

/**
 * The threshold for a lead who could not reach 100.
 *
 * The price step is skipped by design for work with no honest starting number -
 * Whole Home Remodeling, Interior Finishing, anything unrecognised - so those
 * leads have 80 points available and judging them against a threshold built for
 * 100 scores "we never asked" exactly like "well above what I planned". That
 * made the highest-value project type in the business the one structurally
 * hardest to route hot. The threshold moves with the reachable maximum instead,
 * so a lead is judged on the signals they were actually asked about.
 */
export function hotThresholdFor(outOf: number): number {
  return Math.round((HOT_AT * outOf) / MAX_SCORE);
}

const SCOPE_POINTS: Record<string, number> = {
  full_gut: 25,
  major_update: 18,
  refresh: 8,
  // They took the trouble to describe it rather than pick. That is engagement,
  // not absence, so it scores mid rather than zero.
  own_details: 15,
};

const TIMELINE_POINTS: Record<string, number> = {
  asap: 25,
  '1_3_months': 22,
  '3_6_months': 12,
  later_this_year: 5,
  planning: 0,
};

/**
 * The price reaction, scored heaviest of the five.
 *
 * WEB-019 lists four signals because it was written before this question
 * existed. A lead who said "well above what I planned" is materially colder
 * than one who said "about what I expected", whatever the other four say, and
 * leaving that out to match a list would be pedantry. Recorded in the AC doc as
 * a deliberate addition.
 */
const PRICE_POINTS: Record<string, number> = {
  below_expected: 20,
  about_expected: 20,
  a_bit_more: 10,
  well_above: 0,
};

const SCOPE_LABEL: Record<string, string> = {
  full_gut: 'full gut',
  major_update: 'major update',
  refresh: 'refresh only',
  own_details: 'described their own scope',
};

const TIMELINE_LABEL: Record<string, string> = {
  asap: 'wants to start as soon as possible',
  '1_3_months': 'starting in 1 to 3 months',
  '3_6_months': 'starting in 3 to 6 months',
  later_this_year: 'later this year',
  planning: 'just planning',
};

const PRICE_LABEL: Record<string, string> = {
  below_expected: 'our starting price was under what they expected',
  about_expected: 'our starting price landed where they expected',
  a_bit_more: 'our starting price is a bit more than they planned',
  well_above: 'our starting price is well above what they planned',
};

export function scoreIntake(input: IntakeScoringInput): IntakeScoringResult {
  const a = input.answers ?? {};
  const signals: string[] = [];
  let score = 0;

  // 1. Town. Same predicate the flow uses to decide whether "ten minutes from
  //    us" is true, so a lead greeted as a neighbour is never scored as distant.
  const town = a.city ? normalizeTown(a.city) : '';
  if (town && cityInServiceArea(town)) {
    score += 20;
    signals.push(`In the service area (${a.city.trim()})`);
  } else if (town) {
    signals.push(`Outside the service area (${a.city.trim()})`);
  }

  // 2. Scope tier.
  const scope = a.scope_tier;
  if (scope && scope in SCOPE_POINTS) {
    score += SCOPE_POINTS[scope];
    signals.push(`Scope: ${SCOPE_LABEL[scope]}`);
  }

  // 3. Timeline.
  const timeline = a.project_timeline;
  if (timeline && timeline in TIMELINE_POINTS) {
    score += TIMELINE_POINTS[timeline];
    signals.push(`Timeline: ${TIMELINE_LABEL[timeline]}`);
  }

  // 4. Photos. An unknown count scores nothing either way, because "they sent
  //    none" and "we could not tell" are different facts and only one of them
  //    is safe to write down. Its signal is written below, once it is known
  //    whether the doubt mattered.
  const photos = input.photoCount;
  const photosUnknown = photos === null;
  const photoSignalAt = signals.length;
  if (!photosUnknown) {
    if (photos > 0) {
      score += PHOTO_POINTS;
      signals.push(`Sent ${photos} photo${photos === 1 ? '' : 's'}`);
    } else {
      signals.push('No photos');
    }
  }

  // 5. Price reaction - but only where the flow had a starting number to react
  //    to. Where it did not, this is not a signal that came back weak: it is a
  //    question nobody put to them, so it comes off the scale rather than
  //    scoring zero like the worst possible answer. Last of the five, so the
  //    note that replaces it belongs at the end of the natural order.
  const priceAsked = hasPriceAnchor(input.projectType);
  const outOf = priceAsked ? MAX_SCORE : MAX_SCORE - PRICE_POINTS_MAX;
  const hotAt = hotThresholdFor(outOf);
  const price = a.price_reaction;
  if (priceAsked && price && price in PRICE_POINTS) {
    score += PRICE_POINTS[price];
    signals.push(`Price: ${PRICE_LABEL[price]}`);
  }

  // The bucket. Where an unreadable photo count would have decided the outcome,
  // the lead gets the benefit of the doubt: the two errors do not cost the same
  // - a wrongly hot lead costs one phone call, a wrongly cold one is lost. The
  // count is never invented, so the score stands as scored; what the record says
  // is which way the doubt was resolved, and never that the bucket was computed
  // as though no photos existed.
  let bucket: IntakeBucket = score >= hotAt ? 'hot' : 'cold';
  const photosDecided = photosUnknown && bucket === 'cold' && score + PHOTO_POINTS >= hotAt;
  if (photosDecided) bucket = 'hot';

  const photoNote = !photosUnknown
    ? null
    : photosDecided
      ? `Photo count unavailable - not scored, and photos would have decided this one `
        + `(${score} of the ${hotAt} needed), so it is routed hot rather than risk losing it`
      : 'Photo count unavailable - not scored, and it could not have changed the bucket';
  const priceNote = priceAsked
    ? null
    : `Price not asked for this project type - scored out of ${outOf}, where ${hotAt} is hot`;

  if (priceNote) signals.push(priceNote);
  if (photoNote) signals.splice(photoSignalAt, 0, photoNote);

  // Whichever of the two explains a bucket the score does not obviously support
  // leads the list: `routeIntake` quotes the leading signals into
  // `routing_reason` and the brief reads the first, and a score under the
  // familiar 55 beside a hot bucket is the thing the reader has to be told
  // about. The photo note wins when both apply - it is the tighter account of
  // the same decision, and it carries the scaled threshold in its own text.
  const leading = photosDecided ? photoNote : score < HOT_AT && bucket === 'hot' ? priceNote : null;
  if (leading) {
    signals.splice(signals.indexOf(leading), 1);
    signals.unshift(leading);
  }

  return { score, outOf, hotAt, bucket, signals };
}

export interface RoutingDecision {
  bucket: IntakeBucket;
  /** Who the lead goes to. 'nurture' is a destination, not a bin. */
  routedTo: string;
  /** Plain words, because this is read by a person in an alert, not parsed. */
  reason: string;
}

const VISIT_OWNERS = 'Alex and Veronica';

/**
 * WEB-01A. Hot goes to a human for the visit, cold enters nurture, and both are
 * recorded so the decision can be reviewed rather than reconstructed.
 */
export function routeIntake(result: IntakeScoringResult): RoutingDecision {
  const top = result.signals.slice(0, 3).join('; ');
  // The denominator travels with the score. Two leads can be scored on two
  // different scales, and "Scored 50, hot" read against the usual 100 is the
  // ambiguity that made a whole-home lead look like a scoring bug.
  const out = `Scored ${result.score} of ${result.outOf}`;
  if (result.bucket === 'hot') {
    return {
      bucket: 'hot',
      routedTo: VISIT_OWNERS,
      reason: `${out}, hot. ${top}`,
    };
  }
  return {
    bucket: 'cold',
    routedTo: 'nurture',
    reason: `${out}, cold. ${top}`,
  };
}

/**
 * WEB-01B. A lead who submitted the form and never opened the chat.
 *
 * Non-engagement is a signal in its own right, recorded rather than inferred
 * later from an absence.
 */
export function lowIntentDecision(): RoutingDecision {
  return {
    bucket: 'cold',
    routedTo: 'nurture',
    reason: 'Never opened the intake link. Lower intent - worth one manual follow-up before nurture takes over.',
  };
}

/**
 * The same lead, found too late to be worth telling anybody about.
 *
 * Still recorded, because these are the rows whose non-engagement is the most
 * certain there is - never opened, and days gone - and a lead left with no
 * verdict at all is indistinguishable on the row from one still mid-intake.
 *
 * Its own words rather than `lowIntentDecision`'s: "worth one manual follow-up"
 * is the stale advice the retirement exists to suppress, and a row that carries
 * it would imply a chase that was deliberately never made.
 */
export function retiredChaseDecision(hours: number): RoutingDecision {
  return {
    bucket: 'cold',
    routedTo: 'nurture',
    reason:
      `Never opened the intake link, and aged out of the chase after ${hours} hours. ` +
      'Retired without an alert - too old to follow up on, so into nurture.',
  };
}
