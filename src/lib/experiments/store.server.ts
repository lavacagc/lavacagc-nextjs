/**
 * Server-side data access for experiments. Secret key only (supabaseRest);
 * the tables have RLS on and no policies, so nothing else can read them.
 *
 * Every read is bounded: experiments by `limit=200`, events only through the
 * grouped `experiment_funnel` function or a per-visitor filter.
 */
import { revalidatePath, revalidateTag, unstable_cache } from 'next/cache';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { forgetActivePairs } from '@/lib/cta/activePairs.server';
import { evaluate, seedFor, type Evaluation } from './evaluate';
import {
  activeVariants,
  EXPERIMENT_COLUMNS,
  FUNNEL_EVENTS,
  LIVE_STATUSES,
  parseVariants,
  type ExperimentRow,
  type ExperimentStatus,
  type FunnelEvent,
} from './types';

export const EXPERIMENTS_TAG = 'experiments';
export const EXPERIMENTS_LIMIT = 200;

function normalise(row: ExperimentRow): ExperimentRow {
  return { ...row, variants: parseVariants(row.variants) };
}

export async function listExperiments(statuses?: readonly ExperimentStatus[]): Promise<ExperimentRow[]> {
  const filter = statuses?.length ? `&status=in.(${statuses.join(',')})` : '';
  const rows = await supabaseRest<ExperimentRow[]>(
    'GET',
    `experiments?select=${EXPERIMENT_COLUMNS}${filter}&order=created_at.desc&limit=${EXPERIMENTS_LIMIT}`,
  );
  return (rows ?? []).map(normalise);
}

export async function getExperiment(key: string): Promise<ExperimentRow | null> {
  const rows = await supabaseRest<ExperimentRow[]>('GET', `experiments?select=${EXPERIMENT_COLUMNS}&key=eq.${encodeURIComponent(key)}&limit=1`);
  return rows?.[0] ? normalise(rows[0]) : null;
}

/** The fields a page needs to render an experiment. */
export type RenderableExperiment = Pick<ExperimentRow, 'key' | 'page' | 'element' | 'variants' | 'control_key' | 'status' | 'concluded_at'>;

const readRenderable = unstable_cache(
  async (): Promise<RenderableExperiment[]> =>
    ((await supabaseRest<RenderableExperiment[]>(
      'GET',
      'experiments?select=key,page,element,variants,control_key,status,concluded_at' +
        `&status=in.(running,pending_promotion,concluded)&order=concluded_at.desc.nullsfirst&limit=${EXPERIMENTS_LIMIT}`,
    )) ?? []).map((r) => ({ ...r, variants: parseVariants(r.variants) })),
  ['experiments-renderable'],
  { tags: [EXPERIMENTS_TAG], revalidate: 60 },
);

/**
 * Running, pending and concluded experiments, cached for a minute under the
 * `experiments` tag (every write expires it). Without a service key (the stub
 * test build) there is no table to read and pages render their code defaults.
 * A failed read also renders the defaults: an experiment must never take a
 * page down.
 */
export async function renderableExperiments(): Promise<RenderableExperiment[]> {
  if (!process.env.SUPABASE_SECRET_KEY) return [];
  try {
    return await readRenderable();
  } catch (err) {
    console.error('experiments: read failed, rendering defaults:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

/** The experiment a (page, element) shows now: the live one, else the latest concluded one. */
export function pickExperiment(all: readonly RenderableExperiment[], page: string, element: string): RenderableExperiment | null {
  const here = all.filter((e) => e.page === page && e.element === element);
  return here.find((e) => (LIVE_STATUSES as readonly string[]).includes(e.status)) ?? here.find((e) => e.status === 'concluded') ?? null;
}

/** Concrete paths for a page pattern, for revalidatePath. */
function pathsFor(page: string): string[] {
  return page.includes('[') ? [] : [page];
}

/** Expire the cached read and the pages the given experiments render on. */
export function invalidateExperiments(pages: readonly string[] = []): void {
  revalidateTag(EXPERIMENTS_TAG, { expire: 0 });
  forgetActivePairs();
  for (const page of new Set(pages)) for (const path of pathsFor(page)) revalidatePath(path);
}

/**
 * PATCH one experiment. With `expectedUpdatedAt`, only while the row is
 * unchanged since it was read (two admins, or the cron and an admin, cannot
 * overwrite each other's variants); null on that conflict.
 */
export async function updateExperiment(
  key: string,
  patch: Partial<Omit<ExperimentRow, 'key' | 'created_at' | 'updated_at'>>,
  expectedUpdatedAt?: string,
): Promise<ExperimentRow | null> {
  const guard = expectedUpdatedAt ? `&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}` : '';
  const rows = await supabaseRest<ExperimentRow[]>(
    'PATCH',
    `experiments?key=eq.${encodeURIComponent(key)}${guard}&select=${EXPERIMENT_COLUMNS}`,
    patch,
  );
  return rows?.[0] ? normalise(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface EventRow {
  experiment_key: string;
  variant_key: string;
  visitor_id: string;
  event: FunnelEvent;
  value_cents?: number | null;
}

/** Insert events; a repeat for the same (experiment, variant, visitor, event) is silently absorbed. */
export async function recordEvents(rows: EventRow[]): Promise<void> {
  if (rows.length === 0) return;
  await supabaseRest('POST', 'experiment_events', rows, {
    onConflict: 'experiment_key,variant_key,visitor_id,event',
    prefer: 'resolution=ignore-duplicates,return=minimal',
  });
}

/** The (experiment, variant) pairs this visitor has an `event` for. One visitor's rows: bounded by the filter and a cap. */
export async function visitorPairs(visitorId: string, event: FunnelEvent): Promise<Array<{ experiment_key: string; variant_key: string }>> {
  return (
    (await supabaseRest<Array<{ experiment_key: string; variant_key: string }>>(
      'GET',
      `experiment_events?select=experiment_key,variant_key&visitor_id=eq.${visitorId}&event=eq.${event}&limit=200`,
    )) ?? []
  );
}

/** Live (running or pending) experiment keys among these, read fresh (not the render cache). */
export async function liveKeys(keys: readonly string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const list = keys.map((k) => encodeURIComponent(k)).join(',');
  const rows = await supabaseRest<Array<{ key: string }>>(
    'GET',
    `experiments?select=key&key=in.(${list})&status=in.(${LIVE_STATUSES.join(',')})&limit=${EXPERIMENTS_LIMIT}`,
  );
  return new Set((rows ?? []).map((r) => r.key));
}

// ---------------------------------------------------------------------------
// Funnel and report
// ---------------------------------------------------------------------------

export type VariantFunnel = Record<FunnelEvent, number> & { revenue_cents: number };
/** experiment key -> variant key -> counts. */
export type Funnel = Map<string, Map<string, VariantFunnel>>;

function emptyFunnel(): VariantFunnel {
  const out = { revenue_cents: 0 } as VariantFunnel;
  for (const e of FUNNEL_EVENTS) out[e] = 0;
  return out;
}

export async function loadFunnel(keys: readonly string[]): Promise<Funnel> {
  const funnel: Funnel = new Map();
  if (keys.length === 0) return funnel;
  const rows = await supabaseRest<Array<{ experiment_key: string; variant_key: string; event: FunnelEvent; visitors: number; value_cents: number }>>(
    'POST',
    'rpc/experiment_funnel',
    { p_keys: keys.slice(0, EXPERIMENTS_LIMIT) },
  );
  for (const r of rows ?? []) {
    if (!(FUNNEL_EVENTS as readonly string[]).includes(r.event)) continue;
    const byVariant = funnel.get(r.experiment_key) ?? new Map<string, VariantFunnel>();
    const counts = byVariant.get(r.variant_key) ?? emptyFunnel();
    counts[r.event] = Number(r.visitors) || 0;
    // Revenue is what was paid: job_paid carries the job's price.
    if (r.event === 'job_paid') counts.revenue_cents = Number(r.value_cents) || 0;
    byVariant.set(r.variant_key, counts);
    funnel.set(r.experiment_key, byVariant);
  }
  return funnel;
}

export interface VariantReport {
  key: string;
  label: string;
  active: boolean;
  is_control: boolean;
  funnel: VariantFunnel;
}

export interface ExperimentReport extends Omit<ExperimentRow, 'variants'> {
  variants: Array<VariantReport & { payload: ExperimentRow['variants'][number]['payload'] }>;
  evaluation: Evaluation | null;
}

/** The experiment with its funnel and, once started, its evaluation (computed now, never stored here). */
export function reportFor(row: ExperimentRow, funnel: Funnel, now: Date): ExperimentReport {
  const counts = funnel.get(row.key) ?? new Map<string, VariantFunnel>();
  const variants = [...row.variants]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((v) => ({
      key: v.key,
      label: v.label,
      active: v.active !== false,
      is_control: v.key === row.control_key,
      payload: v.payload,
      funnel: counts.get(v.key) ?? emptyFunnel(),
    }));
  const live = activeVariants(row.variants).map((v) => v.key);
  const evaluation = row.started_at
    ? evaluate({
        control_key: row.control_key,
        arms: variants
          .filter((v) => live.includes(v.key) || v.is_control)
          .map((v) => ({ key: v.key, visitors: v.funnel.view, conversions: v.funnel[row.primary_metric], revenue_cents: v.funnel.revenue_cents })),
        min_visitors: row.min_visitors,
        min_days: row.min_days,
        started_at: row.started_at,
        now,
        seed: seedFor(row.key),
      })
    : null;
  return { ...row, variants, evaluation };
}

export async function loadReport(now: Date, statuses?: readonly ExperimentStatus[]): Promise<ExperimentReport[]> {
  const rows = await listExperiments(statuses);
  const funnel = await loadFunnel(rows.map((r) => r.key));
  return rows.map((r) => reportFor(r, funnel, now));
}

/** A page already has a live experiment (other than `exceptKey`). */
export async function liveExperimentOnPage(page: string, exceptKey?: string): Promise<string | null> {
  const rows = await supabaseRest<Array<{ key: string }>>(
    'GET',
    `experiments?select=key&page=eq.${encodeURIComponent(page)}&status=in.(${LIVE_STATUSES.join(',')})&limit=10`,
  );
  return (rows ?? []).map((r) => r.key).find((k) => k !== exceptKey) ?? null;
}
