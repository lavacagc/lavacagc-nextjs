/**
 * Deterministic, unreachable credentials for specs that drive the real email
 * sender in-process (rather than asserting its source).
 *
 * Import this BEFORE the module under test: src/lib/notify/supabase-rest reads
 * NEXT_PUBLIC_SUPABASE_URL at module load, and ES modules evaluate in import
 * order, so a top-level assignment in the spec itself would land too late.
 *
 * Set unconditionally - never `||=`. A developer with real credentials in the
 * environment must not have a stubbed-fetch test point at a live project, and a
 * `.invalid` host (RFC 2606) cannot resolve even if a stub is ever missed.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://email-log-audit.invalid';
process.env.SUPABASE_SECRET_KEY = 'test-secret';
process.env.RESEND_API_KEY = 're_test_key';

export {};
