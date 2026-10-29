/**
 * Browser calls to the homepage buttons admin API (Experiments tab). Every non-2xx is turned into an
 * Error carrying the server's human message, so callers can toast it.
 */
import type { CtaReport } from '@/lib/cta/report';
import type { CtaButton, CtaVariantKey } from '@/lib/cta/types';

export interface CtaHistoryRow {
  button: CtaButton;
  variant_key: string;
  wording: string | null;
  views: number;
  clicks: number;
}

export type CtaReportResponse = CtaReport & { requests_truncated: boolean; generated_at: string; history: CtaHistoryRow[] };

export interface VariantPatch {
  wording?: string;
  subtext?: string | null;
  color?: string | null;
  active?: boolean;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    cache: 'no-store',
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON (e.g. an auth redirect page) falls through to the status message.
  }
  if (!res.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : '';
    throw new Error(message || `Request failed (${res.status})`);
  }
  return body as T;
}

export const ctaApi = {
  report: () => call<CtaReportResponse>('/api/admin/cta/report'),
  create: (button: CtaButton, input: { wording: string; subtext?: string; color?: string; active?: boolean }) =>
    call('/api/admin/cta/variants', { method: 'POST', body: JSON.stringify({ button, ...input }) }),
  update: (button: CtaButton, variantKey: CtaVariantKey, patch: VariantPatch) =>
    call('/api/admin/cta/variants', { method: 'PATCH', body: JSON.stringify({ button, variant_key: variantKey, ...patch }) }),
  setMinVisitors: (value: number) =>
    call('/api/admin/cta/settings', { method: 'PATCH', body: JSON.stringify({ cta_min_visitors: value }) }),
};
