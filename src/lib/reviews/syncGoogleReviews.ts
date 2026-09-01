import { supabaseRest } from '@/lib/notify/supabase-rest';
import { cleanEnv } from '@/lib/envClean';

/**
 * Google review sync, done honestly.
 *
 * WHAT WAS WRONG (diagnosed 2026-08-08, against production):
 *
 * A pg_cron job `monthly-google-reviews-sync` ran `public.sync_google_reviews()`
 * at 02:00 on the 1st of each month. That function did two things wrong.
 *
 *  1. It called the edge function's `sync-reviews` WITHOUT refreshing the
 *     Google access token first. A Google access token lives one hour, so
 *     every scheduled run reached Google with an hour-old-at-best credential
 *     and was refused: HTTP 401, "Expected OAuth 2 access token"
 *     (UNAUTHENTICATED). Reviews had therefore not synced on a schedule at
 *     all - only when somebody pressed Refresh token and then Sync by hand in
 *     the admin, minutes apart.
 *
 *  2. It reported success regardless. `net.http_post` is fire-and-forget: it
 *     queues the request and returns immediately, so the function marked its
 *     `review_sync_log` row `status='success'` without ever seeing the
 *     response. Every monthly row read "success" with `reviews_synced: 0` -
 *     which is exactly what a silent failure looks like, and why nothing on
 *     any screen said the integration was broken.
 *
 * WHAT THIS DOES INSTEAD: refresh first, then sync, then READ both answers and
 * write what actually happened. A failure is recorded as a failure with
 * Google's own message, so the next look at the admin tells the truth.
 *
 * It calls the existing `google-my-business` edge function rather than talking
 * to Google directly, deliberately: that function holds the OAuth client id
 * and secret as Supabase secrets, and its refresh endpoint is proven to work
 * (it is what the admin's own button calls). Rebuilding the OAuth dance
 * first-party would mean copying those credentials into Vercel for no gain
 * today - worth doing only as part of retiring the source-less edge functions,
 * which is its own piece of work.
 */

/** How long a whole sync may take before we stop waiting on it. */
const STEP_TIMEOUT_MS = 20_000;

export interface ReviewSyncResult {
  status: 'success' | 'error' | 'skipped';
  /** Reviews Google returned on a successful sync. */
  reviewCount: number | null;
  /** Which step failed, for a log line that names the cause. */
  failedStep: 'refresh' | 'sync' | null;
  /** Google's own message where there is one - never invented here. */
  message: string | null;
}

function edgeFunctionBase(): string | null {
  const url = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!url) return null;
  return `${url.replace(/\/$/, '')}/functions/v1/google-my-business`;
}

/**
 * Call one edge-function endpoint and return its parsed answer.
 *
 * The status is read before the body for the reason the proposals routes give:
 * a gateway failure answers HTML, and parsing that first turns a diagnosable
 * outage into a JSON parser's complaint.
 */
async function callEdge(
  base: string, key: string, path: string,
): Promise<{ ok: boolean; body: Record<string, unknown> | null; status: number }> {
  const res = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: '{}',
    signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: res.ok, body, status: res.status };
}

/** Google's error text out of the edge function's envelope, if it carried one. */
function googleMessage(body: Record<string, unknown> | null, status: number): string {
  const details = body?.details as { error?: { message?: unknown; status?: unknown } } | undefined;
  const inner = details?.error;
  if (typeof inner?.message === 'string') {
    return typeof inner.status === 'string' ? `${inner.status}: ${inner.message}` : inner.message;
  }
  if (typeof body?.error === 'string') return body.error;
  return `HTTP ${status}`;
}

/**
 * Refresh the token, sync the reviews, and record what happened.
 *
 * Every outcome writes a `review_sync_log` row - including the failures the
 * old job hid - because that table is what the admin's Sync history reads, and
 * a log that only records successes is worse than no log at all.
 */
export async function syncGoogleReviews(triggeredBy: string): Promise<ReviewSyncResult> {
  const base = edgeFunctionBase();
  const key = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!base || !key) {
    return {
      status: 'skipped',
      reviewCount: null,
      failedStep: null,
      message: 'Supabase URL or publishable key not configured',
    };
  }

  const startedAt = new Date().toISOString();
  let result: ReviewSyncResult;
  try {
    // Step 1 - the step the old job skipped, and the reason it always failed.
    const refresh = await callEdge(base, key, 'refresh-token');
    if (!refresh.ok) {
      result = {
        status: 'error',
        reviewCount: null,
        failedStep: 'refresh',
        message: googleMessage(refresh.body, refresh.status),
      };
    } else {
      const sync = await callEdge(base, key, 'sync-reviews');
      const count = typeof sync.body?.reviewCount === 'number' ? sync.body.reviewCount : null;
      result = sync.ok
        ? { status: 'success', reviewCount: count, failedStep: null, message: null }
        : {
          status: 'error',
          reviewCount: null,
          failedStep: 'sync',
          message: googleMessage(sync.body, sync.status),
        };
    }
  } catch (err) {
    // A timeout or a dead socket is a failed sync, not a missing one.
    result = {
      status: 'error',
      reviewCount: null,
      failedStep: 'sync',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // The log write must never turn a good sync into a failed request, so it is
  // reported and swallowed - the reviews are already in the table by now.
  try {
    await supabaseRest('POST', 'review_sync_log', [{
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status: result.status,
      reviews_synced: result.reviewCount ?? 0,
      error_message: result.failedStep
        ? `${result.failedStep} step failed - ${result.message}`
        : null,
      triggered_by: triggeredBy,
    }]);
  } catch (err) {
    console.error('review sync log write failed:', err instanceof Error ? err.message : err);
  }

  return result;
}
