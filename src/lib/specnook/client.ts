/**
 * SpecNook client - the website's only door into SpecNook.
 *
 * Contract (docs/home-services/acceptance-criteria.md, "SpecNook"):
 *   isSpecNookConfigured()
 *   getSubStatus(specnookSubId) => 'approved' | 'pending' | 'unknown'
 *   pushJob(payload)            => { status: 'sent' | 'skipped' | 'failed' }
 * Env: SPECNOOK_API_URL, SPECNOOK_API_KEY, SPECNOOK_SIGNUP_URL.
 *
 * SpecNook has no API this site can call yet (audit decision C10), so the wire
 * shape below is the website's half of a contract SpecNook will implement:
 *   GET  <SPECNOOK_API_URL>/subs/<id>  -> { status: 'approved' | 'pending' | ... }
 *   POST <SPECNOOK_API_URL>/jobs       <- JobPushPayload, 2xx = accepted
 * Both with `Authorization: Bearer <SPECNOOK_API_KEY>`.
 *
 * NEVER THROWS. Unconfigured is a normal state: getSubStatus answers 'unknown'
 * (callers then fall back to subs.status, which Alex sets in admin) and pushJob
 * answers 'skipped'. Env is read per call so a late variable is seen.
 */
import { cleanEnv } from '@/lib/envClean';

export type SpecNookSubStatus = 'approved' | 'pending' | 'unknown';
export type SpecNookPushStatus = 'sent' | 'skipped' | 'failed';

export const DEFAULT_SPECNOOK_SIGNUP_URL = 'https://specnook.com/signup';

function readConfig(): { url: string; key: string } | null {
  const url = cleanEnv(process.env.SPECNOOK_API_URL);
  const key = cleanEnv(process.env.SPECNOOK_API_KEY);
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

export function isSpecNookConfigured(): boolean {
  return readConfig() !== null;
}

/** The signup link every offer email and offer page carries, tagged with trade and offer. */
export function specNookSignupUrl(trade: string, offerId: string): string {
  const base = cleanEnv(process.env.SPECNOOK_SIGNUP_URL) || DEFAULT_SPECNOOK_SIGNUP_URL;
  const url = new URL(base);
  url.searchParams.set('trade', trade);
  url.searchParams.set('ref', offerId);
  return url.toString();
}

export async function getSubStatus(specnookSubId: string | null | undefined): Promise<SpecNookSubStatus> {
  const config = readConfig();
  if (!config || !specnookSubId) return 'unknown';
  try {
    const res = await fetch(`${config.url}/subs/${encodeURIComponent(specnookSubId)}`, {
      headers: { Authorization: `Bearer ${config.key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (res.status === 404) return 'pending';
    if (!res.ok) return 'unknown';
    const data = (await res.json()) as { status?: unknown };
    if (data.status === 'approved') return 'approved';
    return 'pending';
  } catch {
    return 'unknown';
  }
}

export interface JobPushPayload {
  /** job_offers.id - SpecNook's idempotency key for this job. */
  offerId: string;
  requestId: string;
  trade: string;
  customer: { firstName: string; lastName: string; phone: string; email: string };
  address: { street: string; town: string; zip: string };
  scope: string;
  answers: string[];
  /** Signed photo links, valid for 7 days. */
  photos: string[];
  customerPriceCents: number;
  subPayCents: number;
  sub: { id: string; specnookSubId: string | null; businessName: string };
  targetStart: string | null;
  targetEnd: string | null;
  /** Plain-English job order, ready to paste into the SpecNook job. */
  jobOrderText: string;
}

export async function pushJob(payload: JobPushPayload): Promise<{ status: SpecNookPushStatus; error?: string }> {
  const config = readConfig();
  if (!config) return { status: 'skipped' };
  try {
    const res = await fetch(`${config.url}/jobs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': payload.offerId,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { status: 'failed', error: `SpecNook ${res.status}` };
    return { status: 'sent' };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}
