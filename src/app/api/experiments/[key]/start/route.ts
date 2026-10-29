/**
 * POST /api/experiments/<key>/start - draft -> running. 409 when it is not a
 * draft or its page already has a running experiment (one per page). Sends
 * the "Experiment started" Telegram with the hypothesis and the variants.
 * Body: none, or `{}`. Answers { experiment, telegram }.
 * Auth: ingest token or admin session (src/lib/experiments/auth.server.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { validationResponse } from '@/lib/projects/http';
import { authorizeExperiments, clock, readOptionalJson } from '@/lib/experiments/auth.server';
import { startExperiment } from '@/lib/experiments/decide.server';
import { startSchema } from '@/lib/experiments/schemas';
import { EXPERIMENT_KEY_RE } from '@/lib/experiments/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = { params: Promise<{ key: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const caller = await authorizeExperiments(request);
  if (caller.ok === false) return caller.response;
  const { key } = await params;
  if (!EXPERIMENT_KEY_RE.test(key) || key.length > 60) return NextResponse.json({ error: 'Bad key' }, { status: 400 });

  const body = await readOptionalJson(request, 1024);
  if (body.ok === false) return body.response;
  const parsed = startSchema.safeParse(body.value);
  if (!parsed.success) return validationResponse(parsed.error);

  try {
    const result = await startExperiment(key, caller.by, clock(request));
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ experiment: result.row, telegram: result.telegram, message: result.message });
  } catch (err) {
    console.error('experiments start failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not start the experiment' }, { status: 500 });
  }
}
