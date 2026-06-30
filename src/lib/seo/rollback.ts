/**
 * SEO Autonomy — Phase 3 guardrail: 14-day post-publish CTR rollback (decision logic).
 *
 * Pure — no I/O — so it's unit-testable. The cron supplies a post's trailing
 * 14-day CTR plus (for a refresh) the pre-change baseline CTR, and this decides
 * whether to revert, keep, or hold for lack of signal.
 *
 * Safety: a post with NO baseline (a brand-new autogen article) is NEVER
 * auto-reverted — there's nothing to revert to and 14 days is too short to
 * declare a new page dead. Those are reported in the digest instead. Only a
 * refreshed post (which has a snapshot of its prior content) can auto-revert.
 */

export type RollbackVerdict = 'revert' | 'keep' | 'insufficient_data';

export interface RollbackInput {
  /** True when a pre-change content snapshot + baseline CTR exist (a refresh). */
  hasBaseline: boolean;
  baselineCtr: number | null;
  currentCtr: number;
  impressions: number;
  /** Minimum 14-day impressions before a revert decision is trusted. */
  minImpressions?: number;
  /** Relative CTR drop that triggers a revert (0.2 = 20%). */
  dropThreshold?: number;
}

export interface RollbackAssessment {
  verdict: RollbackVerdict;
  reason: string;
}

export function assessRollback(input: RollbackInput): RollbackAssessment {
  const minImpressions = input.minImpressions ?? 30;
  const drop = input.dropThreshold ?? 0.2;

  // New post (no prior content / baseline) — report only, never auto-revert.
  if (!input.hasBaseline || input.baselineCtr == null) {
    return { verdict: 'insufficient_data', reason: 'New post — no prior baseline to compare; reported, not reverted.' };
  }

  if (input.impressions < minImpressions) {
    return {
      verdict: 'insufficient_data',
      reason: `Only ${input.impressions} impressions in 14 days — not enough signal to judge.`,
    };
  }

  const floor = input.baselineCtr * (1 - drop);
  if (input.currentCtr < floor) {
    return {
      verdict: 'revert',
      reason: `CTR ${(input.currentCtr * 100).toFixed(2)}% fell >${Math.round(drop * 100)}% below the pre-change baseline ${(input.baselineCtr * 100).toFixed(2)}%.`,
    };
  }
  return { verdict: 'keep', reason: `CTR ${(input.currentCtr * 100).toFixed(2)}% held vs baseline ${(input.baselineCtr * 100).toFixed(2)}%.` };
}

/** Sum clicks/impressions for a set of GSC rows and derive CTR. */
export function windowMetrics(rows: Array<{ clicks: number; impressions: number; position: number | null }>): {
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number | null;
} {
  let clicks = 0;
  let impressions = 0;
  const positions: number[] = [];
  for (const r of rows) {
    clicks += r.clicks || 0;
    impressions += r.impressions || 0;
    if (r.position != null && Number.isFinite(Number(r.position))) positions.push(Number(r.position));
  }
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const avg_position = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null;
  return { clicks, impressions, ctr, avg_position };
}
