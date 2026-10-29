/**
 * Every state change of an experiment, in one place, shared by the Monday
 * cron, the agent routes, the admin tab and the veto link:
 *
 *   draft --start--> running --winner--> pending_promotion --24 h--> concluded (winner is the control)
 *                       |                     |
 *                       |                     +--veto--> concluded (control kept)
 *                       +--every challenger loses--> concluded (control kept)
 *                       +--retire--> retired (the page shows its code default)
 *
 * Promotion writes the winner into the experiment's control (`control_key =
 * winner`) and concludes it, so the page renders the winner's payload as its
 * default from then on (withExperiment serves a concluded experiment's
 * control). Nothing here ever touches a price.
 *
 * Every write is guarded by the row's `updated_at`, so the cron and an admin
 * acting at the same moment cannot overwrite each other; the loser of that
 * race gets `conflict` and nothing changes.
 */
import { sendTelegramMessage, type TelegramOutcome } from '@/lib/notify/telegramMessage';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import {
  concludedMessage,
  losersRetiredMessage,
  promotedMessage,
  retiredMessage,
  startedMessage,
  vetoedMessage,
  winnerProposedMessage,
} from './messages';
import { createVetoToken } from './vetoToken';
import { getExperiment, invalidateExperiments, liveExperimentOnPage, loadFunnel, listExperiments, reportFor, updateExperiment } from './store.server';
import type { Evaluation } from './evaluate';
import { VETO_WINDOW_MS, type ExperimentDecision, type ExperimentRow } from './types';

export type ActionResult =
  | { ok: true; row: ExperimentRow; telegram?: TelegramOutcome; message?: string }
  | { ok: false; status: 404 | 409; error: string };

const HISTORY_CAP = 50;

function withHistory(decision: ExperimentDecision | null, what: string, by: string, now: Date, extra: Partial<ExperimentDecision> = {}): ExperimentDecision {
  const base = decision ?? {};
  const history = [...(base.history ?? []), { at: now.toISOString(), what, by }].slice(-HISTORY_CAP);
  return { ...base, ...extra, history };
}

export function vetoUrl(origin: string, key: string, notifiedAt: string): string | null {
  const token = createVetoToken(key, notifiedAt);
  return token ? `${origin.replace(/\/$/, '')}/experiments/veto/${token}` : null;
}

async function telegram(text: string): Promise<TelegramOutcome> {
  try {
    return await sendTelegramMessage(text);
  } catch {
    return 'failed';
  }
}

const conflict = (): ActionResult => ({ ok: false, status: 409, error: 'The experiment changed while this was being saved. Reload and try again.' });

async function markBacklog(decision: ExperimentDecision | null): Promise<void> {
  const id = Number(decision?.backlog_id);
  if (!Number.isInteger(id) || id <= 0) return;
  await supabaseRest('PATCH', `experiment_backlog?id=eq.${id}`, { status: 'started' }, { prefer: 'return=minimal' }).catch(() => undefined);
}

export async function startExperiment(key: string, by: string, now: Date): Promise<ActionResult> {
  const row = await getExperiment(key);
  if (!row) return { ok: false, status: 404, error: `No experiment ${key}` };
  if (row.status !== 'draft') return { ok: false, status: 409, error: `${key} is ${row.status}; only a draft can start` };
  const busy = await liveExperimentOnPage(row.page, row.key);
  if (busy) return { ok: false, status: 409, error: `${row.page} already has a running experiment (${busy}). One experiment per page.` };
  let updated: ExperimentRow | null;
  try {
    updated = await updateExperiment(
      key,
      { status: 'running', started_at: now.toISOString(), decision: withHistory(row.decision, 'started', by, now) },
      row.updated_at,
    );
  } catch (err) {
    // The partial unique index is the last word on "one running per page".
    if (/23505|duplicate key/i.test(err instanceof Error ? err.message : String(err))) {
      return { ok: false, status: 409, error: `${row.page} already has a running experiment. One experiment per page.` };
    }
    throw err;
  }
  if (!updated) return conflict();
  await markBacklog(updated.decision);
  invalidateExperiments([updated.page]);
  const message = startedMessage(updated, by);
  return { ok: true, row: updated, telegram: await telegram(message), message };
}

/** Running -> pending_promotion, with the Telegram veto link. A winner equal to the control concludes at once (nothing changes on the page). */
export async function proposeWinner(row: ExperimentRow, winnerKey: string, by: string, now: Date, origin: string, evaluation: Evaluation | null): Promise<ActionResult> {
  if (!row.variants.some((v) => v.key === winnerKey)) return { ok: false, status: 409, error: `${row.key} has no variant ${winnerKey}` };
  if (winnerKey === row.control_key) return concludeKeepControl(row, by, now, 'The control won.', []);
  if (row.status !== 'running') return { ok: false, status: 409, error: `${row.key} is ${row.status}; only a running experiment can propose a winner` };
  const notifiedAt = now.toISOString();
  const promoteAfter = new Date(now.getTime() + VETO_WINDOW_MS).toISOString();
  const updated = await updateExperiment(
    row.key,
    {
      status: 'pending_promotion',
      decision: withHistory(row.decision, `winner ${winnerKey} proposed`, by, now, {
        pending: { winner_key: winnerKey, notified_at: notifiedAt, promote_after: promoteAfter, by },
      }),
    },
    row.updated_at,
  );
  if (!updated) return conflict();
  invalidateExperiments([updated.page]);
  const message = winnerProposedMessage({ row: updated, winnerKey, evaluation, promoteAfter, vetoUrl: vetoUrl(origin, row.key, notifiedAt), by });
  return { ok: true, row: updated, telegram: await telegram(message), message };
}

/** The winner becomes the control and the experiment concludes. */
export async function promote(row: ExperimentRow, winnerKey: string, by: string, now: Date): Promise<ActionResult> {
  if (!['running', 'pending_promotion'].includes(row.status)) return { ok: false, status: 409, error: `${row.key} is ${row.status}; nothing to promote` };
  if (!row.variants.some((v) => v.key === winnerKey)) return { ok: false, status: 409, error: `${row.key} has no variant ${winnerKey}` };
  const updated = await updateExperiment(
    row.key,
    {
      status: 'concluded',
      control_key: winnerKey,
      winner_key: winnerKey,
      concluded_at: now.toISOString(),
      decision: withHistory(row.decision, `promoted ${winnerKey}`, by, now, {
        pending: null,
        promoted: { at: now.toISOString(), by, winner_key: winnerKey, previous_control: row.control_key },
      }),
    },
    row.updated_at,
  );
  if (!updated) return conflict();
  invalidateExperiments([updated.page]);
  const message = promotedMessage(updated, winnerKey, by);
  return { ok: true, row: updated, telegram: await telegram(message), message };
}

export async function concludeKeepControl(row: ExperimentRow, by: string, now: Date, reason: string, retireKeys: string[]): Promise<ActionResult> {
  if (!['running', 'pending_promotion'].includes(row.status)) return { ok: false, status: 409, error: `${row.key} is ${row.status}; nothing to conclude` };
  const variants = row.variants.map((v) => (retireKeys.includes(v.key) && v.key !== row.control_key ? { ...v, active: false } : v));
  const updated = await updateExperiment(
    row.key,
    {
      status: 'concluded',
      variants,
      winner_key: row.control_key,
      concluded_at: now.toISOString(),
      decision: withHistory(row.decision, `concluded, control ${row.control_key} kept`, by, now, { pending: null }),
    },
    row.updated_at,
  );
  if (!updated) return conflict();
  invalidateExperiments([updated.page]);
  const message = concludedMessage(updated, reason, by);
  return { ok: true, row: updated, telegram: await telegram(message), message };
}

export async function retireExperiment(row: ExperimentRow, by: string, now: Date, reason: string): Promise<ActionResult> {
  if (!['draft', 'running', 'pending_promotion'].includes(row.status)) return { ok: false, status: 409, error: `${row.key} is already ${row.status}` };
  const updated = await updateExperiment(
    row.key,
    {
      status: 'retired',
      concluded_at: now.toISOString(),
      decision: withHistory(row.decision, 'retired', by, now, { pending: null, retired: { at: now.toISOString(), by, reason } }),
    },
    row.updated_at,
  );
  if (!updated) return conflict();
  invalidateExperiments([updated.page]);
  const message = retiredMessage(updated, reason, by);
  return { ok: true, row: updated, telegram: await telegram(message), message };
}

/** Veto a pending promotion: the control stays and the experiment concludes. */
export async function vetoExperiment(row: ExperimentRow, by: string, now: Date): Promise<ActionResult> {
  const pending = row.decision?.pending;
  if (row.status !== 'pending_promotion' || !pending) return { ok: false, status: 409, error: `${row.key} has no promotion waiting` };
  const updated = await updateExperiment(
    row.key,
    {
      status: 'concluded',
      winner_key: row.control_key,
      concluded_at: now.toISOString(),
      decision: withHistory(row.decision, `vetoed ${pending.winner_key}`, by, now, {
        pending: null,
        vetoed: { at: now.toISOString(), by, winner_key: pending.winner_key },
      }),
    },
    row.updated_at,
  );
  if (!updated) return conflict();
  invalidateExperiments([updated.page]);
  const message = vetoedMessage(updated, pending.winner_key, by);
  return { ok: true, row: updated, telegram: await telegram(message), message };
}

async function retireLosers(row: ExperimentRow, losers: string[], by: string, now: Date, decision: ExperimentDecision): Promise<ActionResult> {
  const variants = row.variants.map((v) => (losers.includes(v.key) && v.key !== row.control_key ? { ...v, active: false } : v));
  const updated = await updateExperiment(
    row.key,
    { variants, decision: withHistory(decision, `retired ${losers.join(', ')}`, by, now) },
    row.updated_at,
  );
  if (!updated) return conflict();
  invalidateExperiments([updated.page]);
  const message = losersRetiredMessage(updated, losers);
  return { ok: true, row: updated, telegram: await telegram(message), message };
}

export interface EvaluationOutcome {
  key: string;
  status_before: string;
  action: 'promoted' | 'proposed' | 'concluded' | 'retired_losers' | 'waiting_for_veto_window' | 'recorded' | 'conflict' | 'error';
  verdict?: string;
  reason?: string;
  status_after?: string;
  telegram?: TelegramOutcome;
  message?: string;
}

/**
 * The Monday run: every running or pending experiment, in turn.
 *  - pending_promotion: promote once its 24 hours have passed (a vetoed one is
 *    no longer pending, so it is never promoted).
 *  - running: evaluate, write the decision, then act on the verdict.
 */
export async function runEvaluation(now: Date, origin: string, by = 'cron', onlyKeys?: readonly string[]): Promise<EvaluationOutcome[]> {
  const rows = (await listExperiments(['running', 'pending_promotion'])).filter((r) => !onlyKeys || onlyKeys.includes(r.key));
  const funnel = await loadFunnel(rows.map((r) => r.key));
  const out: EvaluationOutcome[] = [];

  for (const row of rows) {
    try {
      if (row.status === 'pending_promotion') {
        const pending = row.decision?.pending;
        if (!pending) {
          out.push({ key: row.key, status_before: row.status, action: 'error', reason: 'pending_promotion without a pending winner' });
          continue;
        }
        if (now.getTime() < Date.parse(pending.promote_after)) {
          out.push({ key: row.key, status_before: row.status, action: 'waiting_for_veto_window', reason: `promotes after ${pending.promote_after}` });
          continue;
        }
        const r = await promote(row, pending.winner_key, `${by} (after the 24 hour veto window)`, now);
        if (r.ok === false) out.push({ key: row.key, status_before: row.status, action: 'conflict', reason: r.error });
        else out.push({ key: row.key, status_before: row.status, action: 'promoted', status_after: r.row.status, telegram: r.telegram, message: r.message });
        continue;
      }

      const report = reportFor(row, funnel, now);
      const evaluation = report.evaluation;
      if (!evaluation) {
        out.push({ key: row.key, status_before: row.status, action: 'error', reason: 'running without started_at' });
        continue;
      }
      const decision: ExperimentDecision = {
        ...(row.decision ?? {}),
        evaluated_at: now.toISOString(),
        verdict: evaluation.verdict,
        arms: evaluation.arms.map((a) => ({
          key: a.key,
          visitors: a.visitors,
          conversions: a.conversions,
          rate: a.rate,
          p_beat_control: a.p_beat_control,
          expected_loss: a.expected_loss,
          revenue_per_visitor_cents: a.revenue_per_visitor_cents,
        })),
      };
      const v = evaluation.verdict;
      // Record first, so the decision is on the row whatever the next step does.
      const recorded = await updateExperiment(row.key, { decision }, row.updated_at);
      if (!recorded) {
        out.push({ key: row.key, status_before: row.status, action: 'conflict', verdict: v.kind });
        continue;
      }
      let result: ActionResult | null = null;
      if (v.kind === 'winner') result = await proposeWinner(recorded, v.winner_key, by, now, origin, evaluation);
      else if (v.kind === 'control_wins') result = await concludeKeepControl(recorded, by, now, v.reason, v.retire);
      else if (v.kind === 'retire_losers') result = await retireLosers(recorded, v.retire, by, now, recorded.decision ?? decision);
      if (!result) {
        out.push({ key: row.key, status_before: row.status, action: 'recorded', verdict: v.kind, reason: v.reason, status_after: recorded.status });
      } else if (result.ok === false) {
        out.push({ key: row.key, status_before: row.status, action: 'conflict', verdict: v.kind, reason: result.error });
      } else {
        out.push({
          key: row.key,
          status_before: row.status,
          action: v.kind === 'winner' ? 'proposed' : v.kind === 'control_wins' ? 'concluded' : 'retired_losers',
          verdict: v.kind,
          reason: v.reason,
          status_after: result.row.status,
          telegram: result.telegram,
          message: result.message,
        });
      }
    } catch (err) {
      console.error(`experiments: evaluating ${row.key} failed:`, err instanceof Error ? err.message : String(err));
      out.push({ key: row.key, status_before: row.status, action: 'error', reason: 'evaluation failed; see the server log' });
    }
  }
  return out;
}
