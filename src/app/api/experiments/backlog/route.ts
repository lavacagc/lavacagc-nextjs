/**
 * The hypothesis backlog the weekly agent picks from (seeded from decision
 * 005 by the slice 0 migration).
 *
 * GET  -> { backlog: [{ id, page, element, hypothesis, priority, source, status, created_at }] }
 *         open items first by priority; `?status=all` includes started and dropped. Capped at 200.
 * POST { page, element, hypothesis, priority?, source? } -> 201 { item }.
 *         A hypothesis that states an amount, the phone or the license is refused (never tested).
 * Auth: ingest token or admin session (src/lib/experiments/auth.server.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { validationResponse } from '@/lib/projects/http';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { authorizeExperiments, readOptionalJson } from '@/lib/experiments/auth.server';
import { backlogCreateSchema } from '@/lib/experiments/schemas';
import { forbiddenClaim } from '@/lib/experiments/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COLUMNS = 'id,page,element,hypothesis,priority,source,status,created_at';

export async function GET(request: NextRequest) {
  const caller = await authorizeExperiments(request);
  if (caller.ok === false) return caller.response;
  const all = request.nextUrl.searchParams.get('status') === 'all';
  try {
    const rows = await supabaseRest<unknown[]>(
      'GET',
      `experiment_backlog?select=${COLUMNS}${all ? '' : '&status=eq.open'}&order=priority.desc,id.asc&limit=200`,
    );
    return NextResponse.json({ backlog: rows ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('experiments backlog read failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not read the backlog' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const caller = await authorizeExperiments(request);
  if (caller.ok === false) return caller.response;
  const body = await readOptionalJson(request, 8 * 1024);
  if (body.ok === false) return body.response;
  const parsed = backlogCreateSchema.safeParse(body.value);
  if (!parsed.success) return validationResponse(parsed.error);
  const claim = forbiddenClaim(parsed.data.hypothesis);
  if (claim) return NextResponse.json({ error: claim }, { status: 400 });
  try {
    const created = await supabaseRest<unknown[]>('POST', `experiment_backlog?select=${COLUMNS}`, [
      { ...parsed.data, source: parsed.data.source === 'agent' && caller.by !== 'agent' ? caller.by.slice(0, 40) : parsed.data.source, status: 'open' },
    ]);
    return NextResponse.json({ item: created?.[0] ?? null }, { status: 201 });
  } catch (err) {
    console.error('experiments backlog create failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not add to the backlog' }, { status: 500 });
  }
}
