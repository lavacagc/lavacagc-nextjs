'use client';

/**
 * Customers > Service Requests (AD1, AD7, BD5).
 *
 * Two views: the request list (newest first, with filters, a Held view and
 * the 30-day summary card) and the Sub Responses inbox. Clicking a request
 * opens its detail panel, where status, notes, Won/Lost and "Send bid
 * request" live.
 *
 * Every read goes through /api/admin/* (SEC5); the browser never touches the
 * home services tables.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, PhoneOff, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { REQUEST_STATUSES, STATUS_LABEL, ageLabel, ALL_REQUEST_COUNTIES, type RequestStatus, type RequestSummary } from '@/lib/home-services/requestsAdmin';
import { LabeledSelect, SERVICE_OPTIONS, StatusBadge, fetchJson, serviceName } from './shared';
import RequestDetail from './RequestDetail';
import SubResponsesInbox from './SubResponsesInbox';

interface ListRow {
  id: string;
  status: RequestStatus;
  services: string[];
  first_name: string;
  last_name: string;
  town: string;
  county: string | null;
  source: string;
  phone_verified: boolean;
  created_at: string;
  merged_count: number;
  offers: Record<string, number>;
}

interface ListResponse {
  requests: ListRow[];
  truncated: boolean;
  heldCount: number;
  sources: string[];
  summary: RequestSummary;
}

type View = 'requests' | 'responses';

export default function ServiceRequestsManager() {
  const [view, setView] = useState<View>('requests');
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [service, setService] = useState('');
  const [source, setSource] = useState('');
  const [county, setCounty] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [inboxCount, setInboxCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      if (service) q.set('service', service);
      if (source) q.set('source', source);
      if (county) q.set('county', county);
      setData(await fetchJson<ListResponse>(`/api/admin/service-requests?${q}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load requests');
    } finally {
      setLoading(false);
    }
  }, [status, service, source, county]);

  const loadInboxCount = useCallback(async () => {
    try {
      const inbox = await fetchJson<{ counters: unknown[]; details: unknown[]; declineCalls: unknown[] }>('/api/admin/offers/responses');
      setInboxCount(inbox.counters.length + inbox.details.length + inbox.declineCalls.length);
    } catch {
      setInboxCount(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadInboxCount(); }, [loadInboxCount]);

  const refreshAll = () => { void load(); void loadInboxCount(); };

  return (
    <div className="space-y-4" data-testid="service-requests">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold">Service Requests</h2>
        <Button variant="outline" size="sm" onClick={refreshAll}><RefreshCw className="mr-1.5 h-4 w-4" aria-hidden /> Refresh</Button>
      </div>

      <div role="tablist" aria-label="Service Requests views" className="inline-flex rounded-lg border bg-muted p-1">
        {(['requests', 'responses'] as View[]).map((v) => (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid={`sr-view-${v}`}
          >
            {v === 'requests' ? 'Requests' : 'Sub Responses'}
            {v === 'responses' && inboxCount ? <Badge className="ml-2 h-5 px-1.5" data-testid="inbox-count">{inboxCount}</Badge> : null}
          </button>
        ))}
      </div>

      {view === 'responses' ? (
        <SubResponsesInbox onChanged={refreshAll} />
      ) : (
        <>
          {data && <SummaryCard summary={data.summary} />}

          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Quick views">
                <Button size="sm" variant={status === '' ? 'default' : 'outline'} onClick={() => setStatus('')} data-testid="sr-tab-all">All</Button>
                <Button size="sm" variant={status === 'held' ? 'default' : 'outline'} onClick={() => setStatus('held')} data-testid="sr-tab-held">
                  Held{data ? ` (${data.heldCount})` : ''}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <LabeledSelect id="sr-filter-status" label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  {REQUEST_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
                </LabeledSelect>
                <LabeledSelect id="sr-filter-service" label="Service" value={service} onChange={(e) => setService(e.target.value)}>
                  <option value="">All services</option>
                  {SERVICE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </LabeledSelect>
                <LabeledSelect id="sr-filter-source" label="Source" value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">All sources</option>
                  {(data?.sources ?? []).map((src) => <option key={src} value={src}>{src}</option>)}
                </LabeledSelect>
                <LabeledSelect id="sr-filter-county" label="County" value={county} onChange={(e) => setCounty(e.target.value)}>
                  <option value="">All counties</option>
                  {ALL_REQUEST_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="none">Unknown county</option>
                </LabeledSelect>
              </div>
            </CardContent>
          </Card>

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-destructive" role="alert">
              The requests could not be read, so this is not an empty list: {error}
            </p>
          ) : loading && !data ? (
            <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>
          ) : data && data.requests.length === 0 ? (
            <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No requests match these filters.</p>
          ) : (
            <ul className="space-y-2" data-testid="sr-list" aria-busy={loading}>
              {data?.requests.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(r.id)}
                    className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="sr-row"
                    data-request-id={r.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold">{`${r.first_name} ${r.last_name}`.trim() || 'No name'}</span>
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-muted-foreground" title={new Date(r.created_at).toLocaleString()}>{ageLabel(r.created_at)}</span>
                    </div>
                    <div className="mt-1 text-sm">{r.services.map(serviceName).join(', ')}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{r.town || 'No town'}{r.county ? ` · ${r.county}` : ''}</span>
                      <Badge variant="secondary" className="font-normal">{r.source}</Badge>
                      {r.phone_verified ? (
                        <span className="inline-flex items-center gap-1 text-green-700"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> phone verified</span>
                      ) : (
                        <span className="inline-flex items-center gap-1"><PhoneOff className="h-3.5 w-3.5" aria-hidden /> unverified</span>
                      )}
                      {r.merged_count > 0 && <Badge variant="outline">merged x{r.merged_count}</Badge>}
                      {r.offers.open ? <Badge variant="outline" className="border-violet-300 text-violet-900">{r.offers.open} offer{r.offers.open > 1 ? 's' : ''} open</Badge> : null}
                      {r.offers.expired && r.status === 'bid_sent' && !r.offers.open && !r.offers.assigned ? (
                        <Badge variant="outline" className="border-red-300 text-red-800"><AlertTriangle className="mr-1 h-3 w-3" aria-hidden /> offer expired - resend</Badge>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data?.truncated && <p className="text-xs text-muted-foreground">Showing the newest 300. Narrow the filters to see older requests.</p>}
        </>
      )}

      <Sheet open={!!openId} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Service request</SheetTitle>
            <SheetDescription className="sr-only">Every field of the request, its photos, offers and actions.</SheetDescription>
          </SheetHeader>
          {openId && <RequestDetail id={openId} onChanged={refreshAll} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryCard({ summary }: { summary: RequestSummary }) {
  const rate = summary.closeRate === null ? 'n/a' : `${Math.round(summary.closeRate * 100)}%`;
  return (
    <Card data-testid="sr-summary">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Last {summary.windowDays} days</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Close rate (won / new or later)</p>
          <p className="text-3xl font-bold" data-testid="sr-close-rate">{rate}</p>
          <p className="text-xs text-muted-foreground" data-testid="sr-close-detail">{summary.won} won of {summary.qualified} · {summary.total} requests</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">By source</p>
          <ul className="mt-1 space-y-0.5 text-sm" data-testid="sr-by-source">
            {summary.bySource.length === 0 && <li className="text-muted-foreground">None yet</li>}
            {summary.bySource.map((s) => <li key={s.key} className="flex justify-between gap-2"><span className="truncate">{s.key}</span><span className="font-medium tabular-nums">{s.count}</span></li>)}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">By service</p>
          <ul className="mt-1 space-y-0.5 text-sm" data-testid="sr-by-service">
            {summary.byService.length === 0 && <li className="text-muted-foreground">None yet</li>}
            {summary.byService.map((s) => <li key={s.key} className="flex justify-between gap-2"><span className="truncate">{serviceName(s.key)}</span><span className="font-medium tabular-nums">{s.count}</span></li>)}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
