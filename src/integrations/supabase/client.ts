// Supabase client for Next.js browser-side operations
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

// Hardcoded Supabase credentials
// Note: These are public/anon keys - safe to expose in client-side code
// Security comes from Row Level Security (RLS) policies in Supabase, not from hiding these keys
const SUPABASE_URL = "https://xrvbrnrbnyfdwkfdoepq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhydmJybnJibnlmZHdrZmRvZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIyNTAsImV4cCI6MjA3NDM0ODI1MH0.TL9cUCyaApPjWl8YEW455JgCUSa6S2qsoRpZ8iATl10";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// Use SSR-safe browser client with typed Database
export const supabase = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
