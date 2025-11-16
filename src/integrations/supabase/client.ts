// Supabase client for Next.js browser-side operations
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

// Use environment variables with fallback for production builds
// Note: These are public/anon keys - safe to expose in client-side code
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xrvbrnrbnyfdwkfdoepq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhydmJybnJibnlmZHdrZmRvZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIyNTAsImV4cCI6MjA3NDM0ODI1MH0.TL9cUCyaApPjWl8YEW455JgCUSa6S2qsoRpZ8iATl10";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in your .env.local file.'
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// Use SSR-safe browser client with typed Database
export const supabase = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
