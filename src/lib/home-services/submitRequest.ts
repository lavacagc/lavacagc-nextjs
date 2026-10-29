/**
 * Browser helper: POST the request flow to /api/home-services/request, with
 * the reCAPTCHA v2 checkbox fallback. Mirrors src/lib/submitLead.ts (which is
 * bound to /api/leads/submit and stays untouched):
 *
 *  1. POST with the v3 token.
 *  2. On 200 { challenge: 'recaptcha_v2' } ask for the checkbox via
 *     `requestChallenge`, then re-POST the same payload with its token.
 *  3. Return a normalised result the flow can branch on.
 */
import { RECAPTCHA_SITE_KEY } from '@/lib/recaptcha-config';

export interface HomeServiceRequestResponse {
  ok: true;
  request_id: string | null;
  status: string;
  verification: 'sent' | 'skipped';
  merged: boolean;
}

export type SubmitRequestResult =
  | { kind: 'ok'; data: HomeServiceRequestResponse }
  | { kind: 'out_of_area' }
  | { kind: 'rate_limited' }
  | { kind: 'cancelled' }
  | { kind: 'error' };

async function post(payload: Record<string, unknown>): Promise<{ res: Response; data: Record<string, unknown> }> {
  const res = await fetch('/api/home-services/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

export async function submitHomeServiceRequest(
  payload: Record<string, unknown>,
  requestChallenge: () => Promise<string | null>,
): Promise<SubmitRequestResult> {
  try {
    let { res, data } = await post(payload);
    if (res.ok && data?.challenge === 'recaptcha_v2') {
      const v2Token = await requestChallenge();
      if (!v2Token) return { kind: 'cancelled' };
      ({ res, data } = await post({ ...payload, recaptchaV2Token: v2Token }));
    }
    if (res.status === 429) return { kind: 'rate_limited' };
    if (res.status === 403 && data?.error === 'out_of_area') return { kind: 'out_of_area' };
    if (!res.ok || data?.ok !== true) return { kind: 'error' };
    return { kind: 'ok', data: data as unknown as HomeServiceRequestResponse };
  } catch {
    return { kind: 'error' };
  }
}

const SCRIPT_ID = 'recaptcha-script';

/** Load the Enterprise v3 script once (same id as the other forms, so it is never loaded twice). */
export function loadRecaptcha(): void {
  if (typeof document === 'undefined' || document.getElementById(SCRIPT_ID) || !RECAPTCHA_SITE_KEY) return;
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

/** A v3 token for this action, or null when the script is missing or refuses. Never hangs past 8 s. */
export function executeRecaptcha(action: string): Promise<string | null> {
  return new Promise((resolve) => {
    const enterprise = typeof window !== 'undefined' ? window.grecaptcha?.enterprise : undefined;
    if (!enterprise) return resolve(null);
    const timer = setTimeout(() => resolve(null), 8000);
    enterprise.ready(() => {
      enterprise
        .execute(RECAPTCHA_SITE_KEY, { action })
        .then((token: string) => {
          clearTimeout(timer);
          resolve(token);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(null);
        });
    });
  });
}
