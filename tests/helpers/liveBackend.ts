/**
 * Guard for E2E specs that need a LIVE backend — i.e. either real Supabase
 * reads (DB-driven location/project pages) or server secret keys (a full
 * /api/leads/submit run that verifies reCAPTCHA, inserts the lead, and
 * dispatches notifications). These cannot run in the default CI job, which
 * builds with placeholder public env and has no secrets, so they used to fail
 * permanently and drown out real regressions.
 *
 * SKIP_WITHOUT_LIVE_BACKEND is true in CI unless E2E_LIVE_BACKEND is explicitly
 * set:
 *   - CI (default):                       skips these specs -> deterministic green
 *   - CI + E2E_LIVE_BACKEND=1 + real env: runs them (e.g. a nightly staging job)
 *   - Local dev:                          runs them (uses the real public keys
 *                                         already in .env.local)
 *
 * Production link health is independently covered by `npm run audit:prod`.
 */
export const SKIP_WITHOUT_LIVE_BACKEND =
  !!process.env.CI && !process.env.E2E_LIVE_BACKEND;

export const LIVE_BACKEND_REASON =
  'Requires a live backend (real Supabase reads / server secret keys). ' +
  'Set E2E_LIVE_BACKEND=1 with real env to run in CI; runs locally via .env.local.';
