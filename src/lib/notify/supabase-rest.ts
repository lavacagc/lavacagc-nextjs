/**
 * Thin Supabase REST helper for server-side admin/notify routes.
 * Uses SUPABASE_SECRET_KEY (server-only, bypasses RLS).
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

interface RestOpts {
  /** Comma-separated column list for ON CONFLICT (upsert). */
  onConflict?: string;
  /** Override Prefer header (e.g. "return=representation"). */
  prefer?: string;
}

export async function supabaseRest<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts: RestOpts = {},
): Promise<T> {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error('SUPABASE_SECRET_KEY not configured');
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL not configured');

  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  if (opts.onConflict) url.searchParams.set('on_conflict', opts.onConflict);

  const headers: Record<string, string> = {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    Prefer: opts.prefer ?? (method === 'POST' && opts.onConflict ? 'resolution=merge-duplicates,return=minimal' : 'return=representation'),
  };

  const res = await fetch(url.toString(), {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path} failed: ${res.status} ${text}`);
  }

  if (headers.Prefer.includes('return=minimal')) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * True only for "that table isn't there yet" errors (PostgREST 404 /
 * undefined_table 42P01) thrown by supabaseRest.
 *
 * The one error class a pre-go-live caller may treat as an empty result: a
 * table this deploy adds does not exist until its migration runs. Anything else
 * - an outage, a bad key, a permission error - is a real failure and must NOT
 * masquerade as "no rows", so callers keep this check narrow.
 */
export function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(' 404 ') || msg.includes('42P01') || /relation .* does not exist/i.test(msg);
}
