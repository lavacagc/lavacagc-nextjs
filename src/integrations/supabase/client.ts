// Supabase client for Next.js browser-side operations
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

// Use environment variables - credentials must be set in .env.local
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your .env.local file.'
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// Use SSR-safe browser client with typed Database
export const supabase = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
