// Supabase client for Next.js server-side operations (Server Components, Route Handlers)
import { createServerClient } from '@supabase/ssr';
import type { Database } from './types';

const SUPABASE_URL = "https://xrvbrnrbnyfdwkfdoepq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhydmJybnJibnlmZHdrZmRvZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIyNTAsImV4cCI6MjA3NDM0ODI1MH0.TL9cUCyaApPjWl8YEW455JgCUSa6S2qsoRpZ8iATl10";

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
