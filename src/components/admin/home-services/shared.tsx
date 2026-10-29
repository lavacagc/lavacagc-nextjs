'use client';

/**
 * Small pieces the Service Requests, Subs and Pricing Report screens share:
 * a JSON fetch that surfaces the server's own error text, the status badge,
 * a labelled native select, and the service catalog (names, prices) read from
 * the home_services table through GET /api/admin/home-services.
 */
import { useEffect, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Badge } from '@/components/ui/badge';
import { SERVICE_SLUGS, TRADE_LABEL, type Trade } from '@/lib/home-services/catalog';
import type { HomeServiceRow } from '@/lib/home-services/catalogRow';
import { STATUS_LABEL, type RequestStatus } from '@/lib/home-services/requestsAdmin';

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

const STATUS_STYLE: Record<RequestStatus, string> = {
  held: 'bg-amber-100 text-amber-900 border-amber-300',
  new: 'bg-blue-100 text-blue-900 border-blue-300',
  contacted: 'bg-slate-100 text-slate-900 border-slate-300',
  bid_sent: 'bg-violet-100 text-violet-900 border-violet-300',
  assigned: 'bg-teal-100 text-teal-900 border-teal-300',
  won: 'bg-green-100 text-green-900 border-green-300',
  lost: 'bg-zinc-200 text-zinc-800 border-zinc-300',
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${STATUS_STYLE[status]}`} data-testid="request-status">
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/**
 * Every service row, active or not, so an old request keeps its names after a
 * service is switched off. One fetch per admin session; the Services & Prices
 * editor calls `refreshServiceRows()` after a save.
 */
let rowsPromise: Promise<HomeServiceRow[]> | null = null;
const listeners = new Set<(rows: HomeServiceRow[]) => void>();

export function loadServiceRows(): Promise<HomeServiceRow[]> {
  if (!rowsPromise) {
    rowsPromise = fetchJson<{ services: HomeServiceRow[] }>('/api/admin/home-services')
      .then((d) => d.services)
      .catch((err) => {
        rowsPromise = null;
        throw err;
      });
  }
  return rowsPromise;
}

export function refreshServiceRows(rows: HomeServiceRow[]): void {
  rowsPromise = Promise.resolve(rows);
  for (const listener of listeners) listener(rows);
}

/** The service rows; null until loaded (and on a failed load, which leaves slugs on screen). */
export function useServiceRows(): HomeServiceRow[] | null {
  const [rows, setRows] = useState<HomeServiceRow[] | null>(null);
  useEffect(() => {
    let live = true;
    loadServiceRows().then((r) => live && setRows(r)).catch(() => undefined);
    listeners.add(setRows);
    return () => {
      live = false;
      listeners.delete(setRows);
    };
  }, []);
  return rows;
}

/** `slug -> English name`, falling back to the slug until the rows load. */
export function useServiceName(): (slug: string) => string {
  const rows = useServiceRows();
  return (slug: string) => rows?.find((r) => r.slug === slug)?.name_en ?? slug;
}

/** Filter options in landing order; slugs until the names load. */
export function useServiceOptions(): Array<{ value: string; label: string }> {
  const name = useServiceName();
  return SERVICE_SLUGS.map((slug) => ({ value: slug, label: name(slug) }));
}

export function tradeName(trade: string): string {
  return TRADE_LABEL[trade as Trade]?.en ?? trade;
}

export const TRADE_OPTIONS = Object.entries(TRADE_LABEL).map(([value, l]) => ({ value, label: l.en }));

export const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50';

export function LabeledSelect({
  id, label, children, ...props
}: { id: string; label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <select id={id} className={selectCls} {...props}>{children}</select>
    </div>
  );
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }).format(new Date(iso));
}

/** "sent" / "not_configured" / ... as a compact, honest label. */
export function channelLabel(status: string): string {
  switch (status) {
    case 'sent': return 'sent';
    case 'not_configured': return 'not configured';
    case 'skipped': return 'skipped (no address)';
    case 'failed': return 'FAILED';
    case 'pending': return 'pending';
    default: return status;
  }
}
