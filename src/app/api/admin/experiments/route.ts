/**
 * GET /api/admin/experiments - the admin Experiments tab: every experiment
 * with its funnel, live evaluation and stored decision, and the open backlog.
 * Admin session enforced by middleware on /api/admin/*. Secret key only.
 */
import { NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { loadReport } from '@/lib/experiments/store.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const now = new Date();
    const [experiments, backlog] = await Promise.all([
      loadReport(now),
      supabaseRest<unknown[]>('GET', 'experiment_backlog?select=id,page,element,hypothesis,priority,source,status,created_at&order=status.asc,priority.desc,id.asc&limit=100'),
    ]);
    return NextResponse.json({ generated_at: now.toISOString(), experiments, backlog: backlog ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('admin experiments report failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not load the experiments' }, { status: 500 });
  }
}
