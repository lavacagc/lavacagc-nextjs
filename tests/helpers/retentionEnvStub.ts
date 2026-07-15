/**
 * Env stub for the retention-purge behavioral tests. Must be imported BEFORE
 * src/lib/homecare/retention (module import order runs this first), because
 * supabase-rest captures NEXT_PUBLIC_SUPABASE_URL in a module-level const at
 * load time. Values are inert - every network call in those tests goes through
 * a stubbed global fetch, never a real Supabase.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://stub.supabase.co';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'stub-secret';
