/**
 * Resolve a veto token to the experiment it may veto, or say why not.
 * Shared by the veto page (GET, read-only) and the veto route (POST).
 */
import { getExperiment } from './store.server';
import type { ExperimentRow } from './types';
import { verifyVetoToken } from './vetoToken';

export type VetoLookup =
  | { ok: true; row: ExperimentRow; winnerKey: string; promoteAfter: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'not_pending' };

export async function lookupVeto(token: string, now: Date = new Date()): Promise<VetoLookup> {
  const check = verifyVetoToken(token, now);
  if (check.ok === false) return { ok: false, reason: check.reason === 'expired' ? 'expired' : 'invalid' };
  const row = await getExperiment(check.experimentKey);
  if (!row) return { ok: false, reason: 'invalid' };
  const pending = row.decision?.pending;
  // Only the proposal this link was sent for: a later proposal has a later notified_at.
  if (row.status !== 'pending_promotion' || !pending || Math.floor(Date.parse(pending.notified_at) / 1000) !== check.notifiedAtUnix) {
    return { ok: false, reason: 'not_pending' };
  }
  return { ok: true, row, winnerKey: pending.winner_key, promoteAfter: pending.promote_after };
}
