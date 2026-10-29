/**
 * POST /api/admin/experiments/<key> - one tap in the admin Experiments tab,
 * recorded with the admin's user id:
 *   { action: 'promote', winner_key? }  the winner (default: the pending one,
 *                                       else the evaluator's) becomes the page
 *                                       default now; Alex is the veto, so no
 *                                       24 hour window.
 *   { action: 'retire', reason? }       the page shows its default again.
 *   { action: 'veto' }                  a pending promotion is cancelled; the
 *                                       control stays and the experiment concludes.
 *   { action: 'start' }                 a draft starts (one per page).
 * Admin session enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { actingAdminId, readJson } from '@/lib/home-services/adminRoute';
import { promote, retireExperiment, startExperiment, vetoExperiment } from '@/lib/experiments/decide.server';
import { adminActionSchema } from '@/lib/experiments/schemas';
import { getExperiment, loadFunnel, reportFor } from '@/lib/experiments/store.server';
import { EXPERIMENT_KEY_RE } from '@/lib/experiments/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ key: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { key } = await params;
  if (!EXPERIMENT_KEY_RE.test(key) || key.length > 60) return NextResponse.json({ error: 'Bad key' }, { status: 400 });
  const read = await readJson(request, 2048);
  if (read.ok === false) return read.response;
  const parsed = adminActionSchema.safeParse(read.body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 });
  const body = parsed.data;
  const adminId = await actingAdminId();
  const by = `admin:${adminId ?? 'unknown'}`;
  const now = new Date();

  try {
    if (body.action === 'start') {
      const result = await startExperiment(key, by, now);
      if (result.ok === false) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json({ experiment: result.row, telegram: result.telegram });
    }
    const row = await getExperiment(key);
    if (!row) return NextResponse.json({ error: `No experiment ${key}` }, { status: 404 });

    let result;
    if (body.action === 'retire') {
      result = await retireExperiment(row, by, now, body.reason || 'Retired from the admin.');
    } else if (body.action === 'veto') {
      result = await vetoExperiment(row, by, now);
    } else {
      const verdict = reportFor(row, await loadFunnel([row.key]), now).evaluation?.verdict;
      const winner = body.winner_key ?? row.decision?.pending?.winner_key ?? (verdict?.kind === 'winner' ? verdict.winner_key : undefined);
      if (!winner) return NextResponse.json({ error: 'Name the variant to promote: there is no pending or evaluated winner.' }, { status: 400 });
      result = await promote(row, winner, by, now);
    }
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ experiment: result.row, telegram: result.telegram });
  } catch (err) {
    console.error(`admin experiment ${body.action} failed:`, err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: `Could not ${body.action} the experiment` }, { status: 500 });
  }
}
