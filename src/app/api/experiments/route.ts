/**
 * POST /api/experiments - create an experiment DRAFT (the weekly agent, or any
 * caller holding PROJECT_INGEST_TOKEN). Never starts it; see ./[key]/start.
 *
 * Body: src/lib/experiments/schemas.ts `createExperimentSchema`: key, page,
 * element, hypothesis, expected_effect, variants (2 to 7, both languages on a
 * bilingual surface, the same slots in every variant), control_key,
 * primary_metric, min_visitors, min_days, backlog_id.
 *
 * 400 for a bad body, and for any payload that names a price field (prices
 * are never an experiment variable, decision 005); 409 when the page already
 * has a running experiment (one per page) or the key exists. Answers
 * { experiment, adminUrl, previewUrls }. Auth: src/lib/experiments/auth.server.ts.
 * Docs: docs/experiments.md.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, validationResponse, type BodyError } from '@/lib/projects/http';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { authorizeExperiments, siteOrigin } from '@/lib/experiments/auth.server';
import { createExperimentSchema, priceFieldsIn, PRICE_REFUSAL } from '@/lib/experiments/schemas';
import { getExperiment, invalidateExperiments, liveExperimentOnPage } from '@/lib/experiments/store.server';
import { EXPERIMENT_COLUMNS, type ExperimentRow } from '@/lib/experiments/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const caller = await authorizeExperiments(request);
  if (caller.ok === false) return caller.response;

  let raw: unknown;
  try {
    raw = await readJsonBody(request, 64 * 1024);
  } catch (err) {
    const e = err as BodyError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 400 });
  }

  const priceFields = priceFieldsIn((raw as { variants?: unknown } | null)?.variants);
  if (priceFields.length) return NextResponse.json({ error: `${PRICE_REFUSAL} ${priceFields.join(', ')}` }, { status: 400 });

  const parsed = createExperimentSchema.safeParse(raw);
  if (!parsed.success) return validationResponse(parsed.error);
  const body = parsed.data;

  try {
    const busy = await liveExperimentOnPage(body.page);
    if (busy) {
      return NextResponse.json({ error: `${body.page} already has a running experiment (${busy}). One experiment per page.` }, { status: 409 });
    }
    if (await getExperiment(body.key)) return NextResponse.json({ error: `An experiment called ${body.key} already exists` }, { status: 409 });

    const created = await supabaseRest<ExperimentRow[]>('POST', `experiments?select=${EXPERIMENT_COLUMNS}`, [{
      key: body.key,
      page: body.page,
      element: body.element,
      hypothesis: body.hypothesis,
      expected_effect: body.expected_effect,
      variants: body.variants.map((v) => ({ ...v, active: true })),
      control_key: body.control_key,
      status: 'draft',
      primary_metric: body.primary_metric,
      min_visitors: body.min_visitors,
      min_days: body.min_days,
      created_by: caller.by,
      decision: {
        ...(body.backlog_id ? { backlog_id: body.backlog_id } : {}),
        history: [{ at: new Date().toISOString(), what: 'created', by: caller.by }],
      },
    }]);
    const experiment = created?.[0];
    invalidateExperiments();
    const origin = siteOrigin(request);
    return NextResponse.json(
      {
        experiment,
        adminUrl: `${origin}/vaca-mgmt?tab=experiments`,
        previewUrls: body.variants.map((v) => `${origin}${body.page}?exp=${body.key}:${v.key}`),
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/23505|duplicate key/i.test(message)) return NextResponse.json({ error: `An experiment called ${body.key} already exists` }, { status: 409 });
    console.error('experiments create failed:', message);
    return NextResponse.json({ error: 'Could not create the experiment' }, { status: 500 });
  }
}
