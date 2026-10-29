/**
 * GET /api/cron/experiments-evaluate - the weekly evaluator (Monday 07:30 UTC,
 * vercel.json). Auth: Bearer CRON_SECRET (also enforced by middleware on
 * /api/cron/*).
 *
 * For every running experiment: evaluate (src/lib/experiments/evaluate.ts),
 * write the decision, and act on it - a winner goes to pending_promotion with
 * a Telegram message carrying the one-tap veto link; a loser is retired; when
 * every challenger loses the control is kept and the experiment concludes.
 * For every pending one whose 24 hours have passed without a veto: promote
 * (the winner becomes the control, the experiment concludes).
 *
 * Answers { now, results: [{ key, action, verdict, status_after, telegram, message }] }.
 * `?now=<iso>` moves the clock off production (src/lib/experiments/auth.server.ts),
 * which is how the spec runs it twice a day apart; `?keys=a,b` (same rule)
 * limits a run to the spec's own experiments on the shared rig.
 */
import { NextRequest, NextResponse } from 'next/server';
import { clock, onlyKeys, siteOrigin } from '@/lib/experiments/auth.server';
import { runEvaluation } from '@/lib/experiments/decide.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const now = clock(request);
  try {
    const results = await runEvaluation(now, siteOrigin(request), 'cron', onlyKeys(request));
    console.log('[experiments-evaluate]', JSON.stringify(results.map((r) => ({ key: r.key, action: r.action, verdict: r.verdict, telegram: r.telegram }))));
    return NextResponse.json({ now: now.toISOString(), results });
  } catch (err) {
    console.error('experiments-evaluate failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Evaluation failed' }, { status: 500 });
  }
}
