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

/**
 * Query parameters whose VALUE is a credential, matched on the parameter name
 * only - `select=id,access_token` names a column and stays readable.
 */
const SECRET_PARAM = /token|secret|password|api[_-]?key/i;

/**
 * The request path with any credential in it blanked, for the thrown message.
 *
 * Several lookups key on a secret - `homeowners?access_token=eq.<TOKEN>` above
 * all, because that token is stable, never rotated, and buys 30 days of portal
 * access including booking paid work at the member's address. Every caller logs
 * what this helper throws, so a single PostgREST non-2xx (a column missing on a
 * restored copy, a 5xx, a blip) used to write a live credential into the
 * platform log and every drain attached to it. The column and the status, which
 * are what make a failure diagnosable, both survive.
 */
export function redactRestPath(path: string): string {
  const [route, ...rest] = path.split('?');
  if (rest.length === 0) return path;
  const query = rest.join('?')
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const name = pair.slice(0, eq);
      return SECRET_PARAM.test(name) ? `${name}=<redacted>` : pair;
    })
    .join('&');
  return `${route}?${query}`;
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
    throw new Error(`Supabase ${method} ${redactRestPath(path)} failed: ${res.status} ${text}`);
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
