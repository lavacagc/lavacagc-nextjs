/**
 * Thin Supabase REST helper for the SEO autonomy engine.
 * Uses SUPABASE_SECRET_KEY (server-only, bypasses RLS).
 *
 * Mirrors the inline helper in src/app/api/cron/publish/route.ts so SEO
 * routes don't need to import a heavyweight client.
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
 * GET every row for a query, paging past PostgREST's default 1000-row cap via
 * Range headers. Use this for the seo_metrics scans (a 28-day window is several
 * thousand rows) — a plain GET silently truncates to 1000 and skews the report
 * and scoring.
 */
export async function supabaseRestPaged<T = unknown>(path: string, pageSize = 1000): Promise<T[]> {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error('SUPABASE_SECRET_KEY not configured');
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL not configured');

  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        'Range-Unit': 'items',
        Range: `${from}-${to}`,
      },
    });
    if (!res.ok && res.status !== 206) {
      const text = await res.text();
      throw new Error(`Supabase GET ${path} failed: ${res.status} ${text}`);
    }
    const batch = (JSON.parse((await res.text()) || '[]')) as T[];
    out.push(...batch);
    if (batch.length < pageSize) break; // last page
  }
  return out;
}
