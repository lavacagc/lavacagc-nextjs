import { createClient } from '@supabase/supabase-js';
import { Database } from '@/integrations/supabase/types';

// Hardcoded Supabase credentials (same as client.ts)
// Note: These are public/anon keys - safe to use in server-side code
// Security comes from Row Level Security (RLS) policies in Supabase
const SUPABASE_URL = "https://xrvbrnrbnyfdwkfdoepq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhydmJybnJibnlmZHdrZmRvZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIyNTAsImV4cCI6MjA3NDM0ODI1MH0.TL9cUCyaApPjWl8YEW455JgCUSa6S2qsoRpZ8iATl10";

// Server-side Supabase client for use in Server Components and API routes
export function getServerSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
