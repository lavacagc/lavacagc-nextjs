/**
 * Small shared pieces for the home services admin routes. Admin auth itself is
 * middleware's job (/api/admin/* needs a session); this only names who acted,
 * parses bodies, and turns failures into answers that do not leak internals.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** The signed-in admin's email for audit lines; null when it cannot be read. */
export async function actingAdmin(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > maxBytes) return { ok: false, response: NextResponse.json({ error: 'Body too large' }, { status: 413 }) };
  try {
    const text = await request.text();
    if (text.length > maxBytes) return { ok: false, response: NextResponse.json({ error: 'Body too large' }, { status: 413 }) };
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) };
  }
}

/** Log the detail, answer with a plain message. */
export function serverError(context: string, err: unknown): NextResponse {
  console.error(`${context}:`, err instanceof Error ? err.message : String(err));
  return NextResponse.json({ error: `${context}. Check the server log.` }, { status: 500 });
}
