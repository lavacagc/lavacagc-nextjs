// Supabase client for Next.js browser-side operations
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

// Public/anon keys loaded from env — safe to expose in client-side code
// Security comes from Row Level Security (RLS) policies in Supabase, not from hiding these keys
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// Use SSR-safe browser client with typed Database
export const supabase = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
