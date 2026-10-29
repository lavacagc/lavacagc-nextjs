/**
 * GET /api/experiments/report - every experiment (up to 200, newest first)
 * with its variants, funnel per variant (view, click, request_started,
 * request_submitted, quote_accepted, job_paid, revenue_cents), the live
 * evaluation (p_beat_control, expected_loss, revenue per visitor, verdict),
 * the last stored decision, plus the open backlog, the surfaces an
 * experiment can run on, and the copy each surface shows today. The weekly agent's first read.
 *
 * Auth: ingest token or admin session (src/lib/experiments/auth.server.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { authorizeExperiments, clock } from '@/lib/experiments/auth.server';
import { loadReport } from '@/lib/experiments/store.server';
import { SURFACES } from '@/lib/experiments/surfaces';
import { currentCopy } from '@/lib/experiments/currentCopy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const caller = await authorizeExperiments(request);
  if (caller.ok === false) return caller.response;
  const now = clock(request);
  try {
    const [experiments, backlog] = await Promise.all([
      loadReport(now),
      supabaseRest<unknown[]>('GET', 'experiment_backlog?select=id,page,element,hypothesis,priority,source,status,created_at&status=eq.open&order=priority.desc,id.asc&limit=100'),
    ]);
    const live = experiments.filter((e) => e.status === 'running' || e.status === 'pending_promotion');
    return NextResponse.json(
      {
        generated_at: now.toISOString(),
        pages_with_running_experiment: [...new Set(live.map((e) => e.page))],
        experiments,
        backlog: backlog ?? [],
        surfaces: SURFACES,
        // What each surface shows today: paste it as the control of a new experiment.
        current_copy: currentCopy(experiments),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('experiments report failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not build the report' }, { status: 500 });
  }
}
