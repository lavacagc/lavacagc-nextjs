// Supabase client for Next.js server-side operations (Server Components, Route Handlers)
import { createServerClient } from '@supabase/ssr';
import type { Database } from './types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Create a Supabase client for use in Server Components.
 * This is a lightweight client that doesn't need cookie handling
 * since we're only reading public data (no auth).
 */
export function createServerSupabaseClient() {
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // No-op: server components reading public data don't need to set cookies
      },
    },
  });
}
