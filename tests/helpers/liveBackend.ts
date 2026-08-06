/**
 * Guard for E2E specs that need a LIVE backend — i.e. either real Supabase
 * reads (DB-driven location/project pages) or server secret keys (a full
 * /api/leads/submit run that verifies reCAPTCHA, inserts the lead, and
 * dispatches notifications). These cannot run in the default CI job, which
 * builds with placeholder public env and has no secrets, so they used to fail
 * permanently and drown out real regressions.
 *
 * SKIP_WITHOUT_LIVE_BACKEND is true whenever the app under test is NOT pointed
 * at a live backend, unless E2E_LIVE_BACKEND explicitly says otherwise:
 *   - CI (default):                       skips these specs -> deterministic green
 *   - CI + E2E_LIVE_BACKEND=1 + real env: runs them (e.g. a nightly staging job)
 *   - `npm run test:e2e` (E2E_STUB_BACKEND): skips them, because that build
 *                                         bakes NEXT_PUBLIC_SUPABASE_URL to the
 *                                         GoTrue stub so the ADMIN specs can
 *                                         authenticate - which is the same
 *                                         build CI makes, and the two sets
 *                                         cannot both be satisfied by one
 *                                         build: the admin specs need a 127.x
 *                                         origin, these need the real one.
 *   - Local dev against a real build:     runs them (uses the real public keys
 *                                         already in .env.local)
 *
 * While these skip, `npm run audit:prod` is the nearest thing to production link
 * coverage, but it is not equivalent: it sweeps a hardcoded path list rather
 * than the DB-driven paths these specs walk.
 * See CLAUDE.md, "Every Playwright script pins its backend".
 *
 * SECOND USE, and it is not a skip. A spec that belongs in BOTH modes can read
 * this flag to choose the assertion its environment can actually make, instead
 * of skipping a check that is only half unavailable. `flows.spec.ts` does that
 * at the Services dropdown: `/services/*` is DB-driven, so under a stub build
 * that destination has no row behind it, and it asserts the route is exposed
 * rather than clicking through to a page that is not there - keeping the full
 * click-through for the live-backend run, where the destination is real.
 * The bar for that pattern: BOTH arms must assert something true about the app.
 * An arm that asserts nothing is a skip wearing an `if`, and should use
 * `test.skip(SKIP_WITHOUT_LIVE_BACKEND, LIVE_BACKEND_REASON)` so the run says
 * so out loud.
 */
export const SKIP_WITHOUT_LIVE_BACKEND =
  (!!process.env.CI || !!process.env.E2E_STUB_BACKEND) && !process.env.E2E_LIVE_BACKEND;

export const LIVE_BACKEND_REASON =
  'Requires a live backend (real Supabase reads / server secret keys). ' +
  'Skipped in CI, and locally under `npm run test:e2e`, whose build is baked ' +
  'against the GoTrue stub. To run them: `npm run build`, then E2E_LIVE_BACKEND=1 ' +
  'with real env in .env.local (or in the CI job).';
