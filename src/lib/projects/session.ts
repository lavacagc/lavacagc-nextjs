/**
 * "Is this request from a signed-in admin?" for routes that live outside the
 * middleware's /api/admin/ gate (the ingest API accepts a session OR a token).
 *
 * The same check middleware.ts makes: the request's Supabase auth cookies,
 * verified against GoTrue with getUser(), never trusted from the cookie alone.
 */
import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';

export async function adminUserId(request: NextRequest): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (request.cookies.getAll().length === 0) return null;
  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // A route answering an API call does not refresh the session.
        },
      },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}
