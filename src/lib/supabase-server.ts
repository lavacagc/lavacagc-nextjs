import { createClient } from '@supabase/supabase-js';
import { Database } from '@/integrations/supabase/types';

// Public/anon keys loaded from env vars
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Server-side Supabase client for use in Server Components and API routes
export function getServerSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
