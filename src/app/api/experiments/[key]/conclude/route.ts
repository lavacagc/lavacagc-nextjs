/**
 * POST /api/experiments/<key>/conclude
 *   { winner_key, note? }  a winner that is not the control goes to
 *                          pending_promotion with the 24 hour Telegram veto
 *                          link (the agent never promotes without that
 *                          window, decision 005 Q15); the control as winner
 *                          concludes at once (nothing on the page changes).
 *   { retire: true, reason } retires it now; the page shows its default.
 * 409 when the experiment is not running (or pending, for retire).
 * Auth: ingest token or admin session (src/lib/experiments/auth.server.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { validationResponse } from '@/lib/projects/http';
import { authorizeExperiments, clock, readOptionalJson, siteOrigin } from '@/lib/experiments/auth.server';
import { proposeWinner, retireExperiment } from '@/lib/experiments/decide.server';
import { concludeSchema } from '@/lib/experiments/schemas';
import { getExperiment, loadFunnel, reportFor } from '@/lib/experiments/store.server';
import { EXPERIMENT_KEY_RE } from '@/lib/experiments/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ key: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const caller = await authorizeExperiments(request);
  if (caller.ok === false) return caller.response;
  const { key } = await params;
  if (!EXPERIMENT_KEY_RE.test(key) || key.length > 60) return NextResponse.json({ error: 'Bad key' }, { status: 400 });

  const body = await readOptionalJson(request, 4 * 1024);
  if (body.ok === false) return body.response;
  const parsed = concludeSchema.safeParse(body.value);
  if (!parsed.success) return validationResponse(parsed.error);
  const now = clock(request);

  try {
    const row = await getExperiment(key);
    if (!row) return NextResponse.json({ error: `No experiment ${key}` }, { status: 404 });
    const result = 'retire' in parsed.data
      ? await retireExperiment(row, caller.by, now, parsed.data.reason)
      : await proposeWinner(
          row,
          parsed.data.winner_key,
          caller.by,
          now,
          siteOrigin(request),
          reportFor(row, await loadFunnel([row.key]), now).evaluation,
        );
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ experiment: result.row, telegram: result.telegram, message: result.message });
  } catch (err) {
    console.error('experiments conclude failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not conclude the experiment' }, { status: 500 });
  }
}
