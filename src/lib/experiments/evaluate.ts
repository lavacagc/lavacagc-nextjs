/**
 * The weekly evaluator. Pure (no I/O, no clock, no Math.random): the same
 * input always gives the same answer, which is what makes it unit-testable
 * and the Monday decision reproducible from the stored counts.
 *
 * Per arm: visitors (distinct `view`s) and conversions (distinct events of the
 * primary metric). Each arm's conversion rate gets a Beta(1 + conversions,
 * 1 + visitors - conversions) posterior. A seeded Monte Carlo (10,000 draws)
 * gives, for each challenger against the control:
 *   p_beat_control = P(rate_challenger > rate_control)
 *   expected_loss  = E[max(rate_control - rate_challenger, 0)]
 *                    (what switching to the challenger costs, in conversion
 *                    rate, in the worlds where it is actually worse).
 *
 * Decision (docs/phase-2/acceptance-criteria.md, "Experiments"):
 *  - the sample guard: every arm has >= min_visitors visitors AND the
 *    experiment is >= min_days old. Nothing is decided before it holds;
 *    the answer is "not enough data" with the date it is expected to hold.
 *  - a winner: p_beat_control >= 0.95 and expected_loss <= 0.005.
 *  - a loser: p_beat_control <= 0.05; it is retired. When every challenger
 *    loses, the control wins.
 * Revenue per visitor (sum of `value_cents` / visitors) is reported, never
 * decided on: prices are not a variable (decision 005, Q14).
 */
import { LOSE_PROBABILITY, MAX_EXPECTED_LOSS, MONTE_CARLO_DRAWS, WIN_PROBABILITY } from './types';

export interface ArmCounts {
  key: string;
  visitors: number;
  conversions: number;
  /** Sum of value_cents on job_paid events (revenue), for reporting only. */
  revenue_cents: number;
}

export interface EvaluateInput {
  control_key: string;
  arms: ArmCounts[];
  min_visitors: number;
  min_days: number;
  started_at: string | null;
  now: Date;
  draws?: number;
  seed?: number;
}

export interface ArmResult extends ArmCounts {
  rate: number | null;
  /** Null for the control. */
  p_beat_control: number | null;
  /** Null for the control. */
  expected_loss: number | null;
  revenue_per_visitor_cents: number | null;
}

export type Verdict =
  | { kind: 'single_variant'; reason: string }
  | { kind: 'not_enough_data'; reason: string; ready_on: string | null }
  | { kind: 'winner'; reason: string; winner_key: string }
  | { kind: 'control_wins'; reason: string; winner_key: string; retire: string[] }
  | { kind: 'retire_losers'; reason: string; retire: string[] }
  | { kind: 'keep_running'; reason: string };

export interface Evaluation {
  arms: ArmResult[];
  verdict: Verdict;
  sample: { min_visitors_per_arm: number; days_running: number; guard_met: boolean };
  thresholds: { win: number; lose: number; max_expected_loss: number; min_visitors: number; min_days: number };
  draws: number;
  seed: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** mulberry32: a small, well-mixed 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal by Box-Muller (one value per call; simple beats clever here). */
function normal(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) for shape >= 1, Marsaglia and Tsang (2000). Every shape here is >= 1. */
function gamma(shape: number, rand: () => number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rand);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rand();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function betaSample(alpha: number, beta: number, rand: () => number): number {
  const x = gamma(alpha, rand);
  const y = gamma(beta, rand);
  return x / (x + y);
}

/** A stable 32-bit seed from a string (FNV-1a), so each experiment gets its own repeatable stream. */
export function seedFor(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * When the sample guard is expected to hold: the later of the min_days mark
 * and the day the smallest arm reaches min_visitors at its rate so far.
 * Null when there is no rate to project from (no start, or no visitors yet).
 */
export function projectReadyOn(input: { started_at: string | null; now: Date; min_days: number; min_visitors: number; smallest_arm: number }): string | null {
  const { started_at, now, min_days, min_visitors, smallest_arm } = input;
  if (!started_at) return null;
  const start = Date.parse(started_at);
  if (!Number.isFinite(start)) return null;
  const daysMark = start + min_days * DAY_MS;
  if (smallest_arm >= min_visitors) return isoDate(Math.max(daysMark, now.getTime()));
  const elapsed = Math.max(now.getTime() - start, DAY_MS / 24);
  if (smallest_arm <= 0) return null;
  const perMs = smallest_arm / elapsed;
  const visitorsMark = now.getTime() + (min_visitors - smallest_arm) / perMs;
  return isoDate(Math.max(daysMark, visitorsMark));
}

export function evaluate(input: EvaluateInput): Evaluation {
  const draws = input.draws ?? MONTE_CARLO_DRAWS;
  const seed = input.seed ?? 20261030;
  const thresholds = {
    win: WIN_PROBABILITY,
    lose: LOSE_PROBABILITY,
    max_expected_loss: MAX_EXPECTED_LOSS,
    min_visitors: input.min_visitors,
    min_days: input.min_days,
  };
  const arms = [...input.arms].sort((a, b) => a.key.localeCompare(b.key));
  const control = arms.find((a) => a.key === input.control_key);
  const smallest = arms.length ? Math.min(...arms.map((a) => a.visitors)) : 0;
  const started = input.started_at ? Date.parse(input.started_at) : NaN;
  const daysRunning = Number.isFinite(started) ? Math.max(0, (input.now.getTime() - started) / DAY_MS) : 0;
  const guardMet = arms.length >= 2 && smallest >= input.min_visitors && daysRunning >= input.min_days;
  const sample = { min_visitors_per_arm: smallest, days_running: Math.round(daysRunning * 100) / 100, guard_met: guardMet };

  const base = (a: ArmCounts): ArmResult => ({
    ...a,
    rate: a.visitors > 0 ? a.conversions / a.visitors : null,
    p_beat_control: null,
    expected_loss: null,
    revenue_per_visitor_cents: a.visitors > 0 ? a.revenue_cents / a.visitors : null,
  });

  if (!control || arms.length < 2) {
    return {
      arms: arms.map(base),
      verdict: { kind: 'single_variant', reason: 'Only one active variant: nothing to compare.' },
      sample,
      thresholds,
      draws,
      seed,
    };
  }

  // One shared stream, arms drawn in key order inside each draw, so adding
  // draws refines the same estimate rather than reshuffling it.
  const rand = mulberry32(seed);
  const challengers = arms.filter((a) => a.key !== control.key);
  const wins = new Array(challengers.length).fill(0);
  const loss = new Array(challengers.length).fill(0);
  const posterior = (a: ArmCounts) => [1 + Math.min(a.conversions, a.visitors), 1 + Math.max(0, a.visitors - a.conversions)] as const;
  const [ca, cb] = posterior(control);
  const params = challengers.map(posterior);
  for (let i = 0; i < draws; i++) {
    const c = betaSample(ca, cb, rand);
    for (let j = 0; j < challengers.length; j++) {
      const x = betaSample(params[j][0], params[j][1], rand);
      if (x > c) wins[j] += 1;
      else loss[j] += c - x;
    }
  }

  const results: ArmResult[] = arms.map((a) => {
    const j = challengers.indexOf(a);
    if (j < 0) return base(a);
    return { ...base(a), p_beat_control: wins[j] / draws, expected_loss: loss[j] / draws };
  });

  let verdict: Verdict;
  if (!guardMet) {
    const needs: string[] = [];
    if (smallest < input.min_visitors) needs.push(`${smallest} of ${input.min_visitors} visitors in the smallest variant`);
    if (daysRunning < input.min_days) needs.push(`${Math.floor(daysRunning)} of ${input.min_days} days`);
    verdict = {
      kind: 'not_enough_data',
      reason: `Not enough data yet (${needs.join(', ')}).`,
      ready_on: projectReadyOn({ started_at: input.started_at, now: input.now, min_days: input.min_days, min_visitors: input.min_visitors, smallest_arm: smallest }),
    };
  } else {
    const scored = results.filter((r) => r.p_beat_control !== null);
    const winners = scored
      .filter((r) => (r.p_beat_control as number) >= WIN_PROBABILITY && (r.expected_loss as number) <= MAX_EXPECTED_LOSS)
      .sort((a, b) => (b.p_beat_control as number) - (a.p_beat_control as number) || (a.expected_loss as number) - (b.expected_loss as number));
    const losers = scored.filter((r) => (r.p_beat_control as number) <= LOSE_PROBABILITY).map((r) => r.key);
    if (winners.length > 0) {
      const w = winners[0];
      verdict = {
        kind: 'winner',
        winner_key: w.key,
        reason: `Variant ${w.key} beats control ${control.key} with probability ${pct(w.p_beat_control)} and expected loss ${pct(w.expected_loss, 2)}.`,
      };
    } else if (losers.length === challengers.length) {
      verdict = {
        kind: 'control_wins',
        winner_key: control.key,
        retire: losers,
        reason: `Every challenger (${losers.join(', ')}) beats control ${control.key} with probability ${LOSE_PROBABILITY * 100}% or less: the control stays.`,
      };
    } else if (losers.length > 0) {
      verdict = { kind: 'retire_losers', retire: losers, reason: `Retiring ${losers.join(', ')}: probability of beating control ${LOSE_PROBABILITY * 100}% or less.` };
    } else {
      verdict = { kind: 'keep_running', reason: 'No variant has crossed the win or lose threshold yet.' };
    }
  }

  return { arms: results, verdict, sample, thresholds, draws, seed };
}

function pct(value: number | null, digits = 1): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(digits)}%`;
}
