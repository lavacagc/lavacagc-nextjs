import { createClient } from '@supabase/supabase-js';

/**
 * Shared per-key fixed-window rate limiter, backed by the existing
 * public.rate_limits table (columns: ip_address, count, last_reset).
 *
 * The `bucket` value is stored in `ip_address` and namespaces each caller so
 * different endpoints don't share a counter — e.g. "lead-submit:<ip>" and
 * "chat:<hash>" are independent rows. This reuses the table the edge functions
 * already use, so no migration/DDL is required.
 *
 * FAILS OPEN: any missing config or DB error returns allowed=true. Rate
 * limiting here is availability-protective, not an auth gate, so a backend
 * hiccup must never block a real user.
 *
 * Note: read-then-write is not atomic, so under heavy concurrency the count can
 * undercount slightly (errs toward allowing) — acceptable for this purpose and
 * consistent with the existing edge-function limiter.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets, when blocked. */
  retryAfter?: number;
}

/** Extract the client IP from forwarding headers (leftmost x-forwarded-for). */
export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey || !SUPABASE_URL) return { allowed: true }; // fail open

  const supabase = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false } });
  const now = Date.now();

  try {
    const { data: rows, error } = await supabase
      .from('rate_limits')
      .select('id, count, last_reset')
      .eq('ip_address', bucket)
      .order('last_reset', { ascending: false })
      .limit(1);

    if (error) {
      console.error('rate-limit lookup failed (allowing):', error.message);
      return { allowed: true }; // fail open
    }

    const existing = rows?.[0];

    // No prior window — start one.
    if (!existing) {
      await supabase
        .from('rate_limits')
        .insert({ ip_address: bucket, count: 1, last_reset: new Date(now).toISOString() });
      return { allowed: true };
    }

    const windowEnd = new Date(existing.last_reset).getTime() + windowMs;

    // Window expired — reset the counter.
    if (now >= windowEnd) {
      await supabase
        .from('rate_limits')
        .update({ count: 1, last_reset: new Date(now).toISOString() })
        .eq('id', existing.id);
      return { allowed: true };
    }

    // Within the window and over the limit — block.
    if (existing.count >= limit) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((windowEnd - now) / 1000)) };
    }

    // Within the window and under the limit — increment.
    await supabase
      .from('rate_limits')
      .update({ count: existing.count + 1 })
      .eq('id', existing.id);
    return { allowed: true };
  } catch (err) {
    console.error('rate-limit check failed (allowing):', err);
    return { allowed: true }; // fail open
  }
}
