/**
 * Thin Supabase REST helper for server-side admin/notify routes.
 * Uses SUPABASE_SECRET_KEY (server-only, bypasses RLS).
 */
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
  // Read per call, not at module scope: a module-scope read freezes whichever
  // value happened to be present when the module first loaded, which makes the
  // helper untestable against a stub and hides a late-arriving env var.
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secretKey) throw new Error('SUPABASE_SECRET_KEY not configured');
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL not configured');

  const url = new URL(`${supabaseUrl}/rest/v1/${path}`);
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
