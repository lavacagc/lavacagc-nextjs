'use client';

/**
 * Marketing > Experiments (Phase 2 slice H, EX7): every experiment with its
 * funnel, the probability each variant beats the control, the expected loss,
 * revenue per visitor and the decision; one tap starts, promotes, vetoes or
 * retires, recorded with the admin's id. Below: the homepage hero buttons
 * (the Phase 1 CTA Tests, still editable) with their Phase 1 history, and the
 * hypothesis backlog the weekly agent picks from.
 *
 * Data: GET /api/admin/experiments, POST /api/admin/experiments/<key>
 * (admin session, secret key server-side).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import CtaTestsDashboard from '@/components/admin/home-services/CtaTestsDashboard';
import type { ExperimentReport } from '@/lib/experiments/store.server';

interface BacklogItem {
  id: number;
  page: string;
  element: string;
  hypothesis: string;
  priority: number;
  source: string;
  status: string;
}

interface Payload {
  generated_at: string;
  experiments: ExperimentReport[];
  backlog: BacklogItem[];
}

type Action = { action: 'start' } | { action: 'promote'; winner_key?: string } | { action: 'veto' } | { action: 'retire'; reason?: string };

const STATUS_STYLE: Record<string, string> = {
  running: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  pending_promotion: 'border-amber-300 bg-amber-50 text-amber-900',
  draft: 'border-slate-300 bg-slate-50 text-slate-700',
  concluded: 'border-sky-300 bg-sky-50 text-sky-900',
  retired: 'border-zinc-300 bg-zinc-100 text-zinc-600',
};
const STATUS_LABEL: Record<string, string> = {
  running: 'Running',
  pending_promotion: 'Pending promotion',
  draft: 'Draft',
  concluded: 'Concluded',
  retired: 'Retired',
};
const METRIC_LABEL: Record<string, string> = {
  click: 'clicks',
  request_started: 'requests started',
  request_submitted: 'requests sent',
  quote_accepted: 'quotes accepted',
  job_paid: 'jobs paid',
};

const pct = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? '-' : `${(v * 100).toFixed(digits)}%`);
/** A Monte Carlo probability is never certain: say "more than 99.9%" rather than 100%. */
const chance = (v: number | null | undefined) =>
  v === null || v === undefined ? '-' : v > 0.999 ? '>99.9%' : v < 0.001 ? '<0.1%' : `${(v * 100).toFixed(1)}%`;
const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? '-' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined, cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

function winnerOf(exp: ExperimentReport): string | null {
  const v = exp.evaluation?.verdict;
  return exp.decision?.pending?.winner_key ?? (v && v.kind === 'winner' ? v.winner_key : null);
}

/**
 * The variant Promote offers first: the pending or evaluated winner, else the
 * challenger most likely to beat the control when that is better than even,
 * else the control. Never a challenger that is losing.
 */
function leaderOf(exp: ExperimentReport): { key: string; p: number | null; isWinner: boolean } {
  const winner = winnerOf(exp);
  const arms = exp.evaluation?.arms ?? [];
  if (winner) return { key: winner, p: arms.find((a) => a.key === winner)?.p_beat_control ?? null, isWinner: true };
  const best = arms
    .filter((a) => a.p_beat_control !== null)
    .sort((a, b) => (b.p_beat_control ?? 0) - (a.p_beat_control ?? 0))[0];
  if (best && (best.p_beat_control ?? 0) > 0.5) return { key: best.key, p: best.p_beat_control, isWinner: false };
  return { key: exp.control_key, p: null, isWinner: false };
}

function PendingNotice({ exp }: { exp: ExperimentReport }) {
  const pending = exp.decision?.pending;
  if (!pending) return null;
  if (!pending.veto_sent_at) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900" data-testid="exp-pending-undelivered">
        Veto message not delivered (Telegram: {pending.veto_outcome === 'no_link' ? 'no veto link, INTERNAL_WEBHOOK_SECRET unset' : pending.veto_outcome.replace('_', ' ')},{' '}
        {pending.attempts} attempt{pending.attempts === 1 ? '' : 's'}, last {when(pending.last_attempt_at)}). Variant {pending.winner_key} will not be
        promoted until the message is delivered; the daily 07:30 UTC run tries again. You can promote or veto here.
      </p>
    );
  }
  return (
    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="exp-pending">
      Veto message sent {when(pending.veto_sent_at)}. Unless vetoed, variant {pending.winner_key} becomes the page default at the daily run on{' '}
      {pending.promote_at ? when(pending.promote_at) : '-'}.
    </p>
  );
}

function ExperimentCard({ exp, busy, onAction }: { exp: ExperimentReport; busy: boolean; onAction: (key: string, action: Action, done: string) => void }) {
  const arms = new Map((exp.evaluation?.arms ?? []).map((a) => [a.key, a]));
  const leader = leaderOf(exp);
  const challengers = exp.variants.filter((v) => !v.is_control);
  const [promoteKey, setPromoteKey] = useState<string>(leader.key);
  const promoteChance = arms.get(promoteKey)?.p_beat_control ?? null;
  const promoteIsWinner = leader.isWinner && promoteKey === leader.key;
  const live = exp.status === 'running' || exp.status === 'pending_promotion';
  const verdict = exp.evaluation?.verdict;
  const metric = METRIC_LABEL[exp.primary_metric] ?? exp.primary_metric;

  return (
    <Card data-testid={`exp-card-${exp.key}`}>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{exp.key}</CardTitle>
          <Badge variant="outline" className={STATUS_STYLE[exp.status]} data-testid="exp-status">{STATUS_LABEL[exp.status] ?? exp.status}</Badge>
          <span className="text-xs text-muted-foreground">{exp.page} · {exp.element}</span>
        </div>
        <CardDescription className="space-y-1">
          <span className="block"><strong>Hypothesis:</strong> {exp.hypothesis}</span>
          {exp.expected_effect && <span className="block"><strong>Expected effect:</strong> {exp.expected_effect}</span>}
          <span className="block text-xs">
            Judged on {metric} per visitor. Decides after {exp.min_visitors} visitors per variant and {exp.min_days} days.
            {exp.started_at ? ` Started ${when(exp.started_at)}.` : ' Not started.'}
            {exp.concluded_at ? ` Ended ${when(exp.concluded_at)}.` : ''}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Phones: one block per variant, decision numbers first, nothing off screen. */}
        <ul className="space-y-2 md:hidden" data-testid={`exp-arms-phone-${exp.key}`}>
          {exp.variants.map((v) => {
            const arm = arms.get(v.key);
            return (
              <li key={v.key} className={`rounded-md border p-3 text-sm ${v.active ? '' : 'text-muted-foreground'}`}>
                <p className="font-semibold">
                  {v.key} {v.label}
                  {v.is_control && <Badge variant="outline" className="ml-2">control</Badge>}
                  {!v.active && <Badge variant="outline" className="ml-2">off</Badge>}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">Beats control</dt><dd className="text-right tabular-nums">{v.is_control ? '-' : chance(arm?.p_beat_control)}</dd>
                  <dt className="text-muted-foreground">Rate</dt><dd className="text-right tabular-nums">{pct(arm?.rate)}</dd>
                  <dt className="text-muted-foreground">Exp. loss</dt><dd className="text-right tabular-nums">{v.is_control ? '-' : pct(arm?.expected_loss, 2)}</dd>
                  <dt className="text-muted-foreground">Visitors / sent</dt><dd className="text-right tabular-nums">{v.funnel.view} / {v.funnel.request_submitted}</dd>
                  <dt className="text-muted-foreground">Clicks / started</dt><dd className="text-right tabular-nums">{v.funnel.click} / {v.funnel.request_started}</dd>
                  <dt className="text-muted-foreground">Accepted / paid</dt><dd className="text-right tabular-nums">{v.funnel.quote_accepted} / {v.funnel.job_paid}</dd>
                  <dt className="text-muted-foreground">Revenue / visitor</dt><dd className="text-right tabular-nums">{money(arm?.revenue_per_visitor_cents)}</dd>
                </dl>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variant</TableHead>
                <TableHead className="text-right">Visitors</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Started</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Accepted</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Beats control</TableHead>
                <TableHead className="text-right">Exp. loss</TableHead>
                <TableHead className="text-right">Revenue / visitor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exp.variants.map((v) => {
                const arm = arms.get(v.key);
                return (
                  <TableRow key={v.key} data-testid={`exp-row-${exp.key}-${v.key}`} className={v.active ? '' : 'text-muted-foreground'}>
                    <TableCell className="min-w-[180px]">
                      <span className="font-semibold">{v.key}</span> {v.label}
                      {v.is_control && <Badge variant="outline" className="ml-2">control</Badge>}
                      {!v.active && <Badge variant="outline" className="ml-2">off</Badge>}
                      {exp.winner_key === v.key && exp.status === 'concluded' && <Badge variant="outline" className="ml-2 border-sky-300">winner</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{v.funnel.view}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.funnel.click}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.funnel.request_started}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.funnel.request_submitted}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.funnel.quote_accepted}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.funnel.job_paid}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(arm?.rate)}</TableCell>
                    <TableCell className="text-right tabular-nums" data-testid={`exp-p-${exp.key}-${v.key}`}>{v.is_control ? '-' : chance(arm?.p_beat_control)}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.is_control ? '-' : pct(arm?.expected_loss, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(arm?.revenue_per_visitor_cents)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {verdict && live && (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm" data-testid="exp-verdict">
            {verdict.reason}
            {verdict.kind === 'not_enough_data' && verdict.ready_on ? ` Expected to be ready around ${verdict.ready_on}.` : ''}
          </p>
        )}
        <PendingNotice exp={exp} />
        {exp.decision?.promoted && (
          <p className="text-sm text-muted-foreground" data-testid="exp-decision">
            Promoted {exp.decision.promoted.winner_key} on {when(exp.decision.promoted.at)} by {exp.decision.promoted.by} (previous control {exp.decision.promoted.previous_control}).
          </p>
        )}
        {exp.decision?.vetoed && (
          <p className="text-sm text-muted-foreground" data-testid="exp-decision">
            Vetoed {exp.decision.vetoed.winner_key} on {when(exp.decision.vetoed.at)} by {exp.decision.vetoed.by}; the control stayed.
          </p>
        )}
        {exp.decision?.retired && (
          <p className="text-sm text-muted-foreground" data-testid="exp-decision">
            Retired on {when(exp.decision.retired.at)} by {exp.decision.retired.by}{exp.decision.retired.reason ? `: ${exp.decision.retired.reason}` : '.'}
          </p>
        )}
        {exp.decision?.evaluated_at && (
          <p className="text-xs text-muted-foreground">Last weekly evaluation {when(exp.decision.evaluated_at)}: {exp.decision.verdict?.reason ?? '-'}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {exp.status === 'draft' && (
            <Button size="sm" disabled={busy} onClick={() => onAction(exp.key, { action: 'start' }, `${exp.key} started`)} data-testid="exp-start">Start</Button>
          )}
          {live && challengers.length > 0 && (
            <>
              <label className="sr-only" htmlFor={`promote-${exp.key}`}>Variant to promote</label>
              <select
                id={`promote-${exp.key}`}
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={promoteKey}
                onChange={(e) => setPromoteKey(e.target.value)}
              >
                {exp.variants.map((v) => <option key={v.key} value={v.key}>{v.key}{v.is_control ? ' (control)' : ''}</option>)}
              </select>
              <Button
                size="sm"
                variant={promoteIsWinner ? 'default' : 'outline'}
                disabled={busy || !promoteKey}
                onClick={() => onAction(exp.key, { action: 'promote', winner_key: promoteKey }, `${promoteKey} promoted on ${exp.key}`)}
                data-testid="exp-promote"
              >
                Promote {promoteKey}
                {promoteKey !== exp.control_key ? ` (${chance(promoteChance)} chance it beats ${exp.control_key})` : ' (keep the control)'}
              </Button>
            </>
          )}
          {exp.status === 'pending_promotion' && (
            <Button size="sm" variant="outline" className="border-amber-400" disabled={busy} onClick={() => onAction(exp.key, { action: 'veto' }, `Promotion vetoed on ${exp.key}`)} data-testid="exp-veto">Veto</Button>
          )}
          {(live || exp.status === 'draft') && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAction(exp.key, { action: 'retire' }, `${exp.key} retired`)} data-testid="exp-retire">Retire</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ExperimentsDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await call<Payload>('/api/admin/experiments'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the experiments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: setState happens after the await, not synchronously.
    void call<Payload>('/api/admin/experiments')
      .then((d) => { setData(d); setError(null); })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the experiments'))
      .finally(() => setLoading(false));
  }, []);

  const onAction = useCallback((key: string, action: Action, done: string) => {
    setBusy(true);
    void call<{ telegram?: string }>(`/api/admin/experiments/${encodeURIComponent(key)}`, { method: 'POST', body: JSON.stringify(action) })
      .then((r) => {
        toast({ title: done, description: r.telegram ? `Telegram: ${r.telegram.replace('_', ' ')}` : undefined });
        return load();
      })
      .catch((err: unknown) => toast({ title: 'Not done', description: err instanceof Error ? err.message : 'Something went wrong', variant: 'destructive' }))
      .finally(() => setBusy(false));
  }, [load]);

  const groups = useMemo(() => {
    const all = data?.experiments ?? [];
    return {
      live: all.filter((e) => e.status === 'running' || e.status === 'pending_promotion'),
      drafts: all.filter((e) => e.status === 'draft'),
      ended: all.filter((e) => e.status === 'concluded' || e.status === 'retired'),
    };
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading experiments...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Experiments</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Copy, layout and images under test. Prices are never tested. Every Monday at 07:30 UTC the evaluator checks
            each running experiment: a variant wins at a 95% chance of beating the control with at most 0.5% expected
            loss, once every variant has its minimum visitors and days. The winner is proposed on Telegram with a veto
            link and promoted by the daily 07:30 UTC run 24 hours after the message is delivered, unless vetoed; an
            undelivered message is retried daily and nothing is promoted until it arrives. One experiment per page.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || busy}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{data ? `Last refresh failed: ${error}` : error}</p>}

      <section className="space-y-3" aria-labelledby="exp-live">
        <h3 id="exp-live" className="text-lg font-semibold">Running and pending ({groups.live.length})</h3>
        {groups.live.length === 0 && <p className="text-sm text-muted-foreground">Nothing is running.</p>}
        {groups.live.map((e) => <ExperimentCard key={e.key} exp={e} busy={busy} onAction={onAction} />)}
      </section>

      <section className="space-y-3" aria-labelledby="exp-drafts">
        <h3 id="exp-drafts" className="text-lg font-semibold">Drafts ({groups.drafts.length})</h3>
        {groups.drafts.length === 0 && <p className="text-sm text-muted-foreground">No drafts.</p>}
        {groups.drafts.map((e) => <ExperimentCard key={e.key} exp={e} busy={busy} onAction={onAction} />)}
      </section>

      <section className="space-y-3" aria-labelledby="exp-ended">
        <h3 id="exp-ended" className="text-lg font-semibold">Concluded and retired ({groups.ended.length})</h3>
        {groups.ended.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        {groups.ended.map((e) => <ExperimentCard key={e.key} exp={e} busy={busy} onAction={onAction} />)}
      </section>

      <section aria-labelledby="exp-backlog">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle id="exp-backlog" className="text-base">Backlog</CardTitle>
            <CardDescription>Hypotheses the weekly agent picks from, highest priority first, for a page with nothing running.</CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.backlog ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Empty.</p>
            ) : (
              <ul className="divide-y text-sm">
                {(data?.backlog ?? []).map((b) => (
                  <li key={b.id} className="flex flex-wrap items-baseline gap-2 py-2">
                    <Badge variant="outline">{b.status}</Badge>
                    <span className="tabular-nums text-muted-foreground">P{b.priority}</span>
                    <span className="text-muted-foreground">{b.page} · {b.element}</span>
                    <span className="min-w-0 flex-1">{b.hypothesis}</span>
                    <span className="text-xs text-muted-foreground">{b.source}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="exp-hero" className="border-t pt-8">
        <CtaTestsDashboard />
      </section>
    </div>
  );
}
