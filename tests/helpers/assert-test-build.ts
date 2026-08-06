/**
 * Fail the run, once and legibly, when the app under test was not built for it.
 *
 * `NEXT_PUBLIC_SUPABASE_URL` is inlined at BUILD time, and the admin specs'
 * fabricated session cookie (`sb-127-auth-token`) only matches a build pointed
 * at a 127.x origin. Get that wrong and nothing says so: the suite just fails
 * by the dozen, every admin page rendering the single word "Unauthorized",
 * which reads like a product regression and has cost real hours.
 *
 * The probe is the `preconnect` link the root layout renders from that exact
 * value (src/app/layout.tsx), so this reads what the RUNNING SERVER was built
 * with rather than what the current shell happens to export - which is the only
 * question worth asking, since the shell cannot change a baked value.
 *
 * When TEST_URL is set the run is pointed at a server somebody else started -
 * possibly production, which several specs legitimately target - so a mismatch
 * is a WARNING there and a hard failure only when playwright.config.ts built
 * and started the server itself.
 */
const EXPECTED_ORIGIN = 'http://127.0.0.1:9099';

const FIX = [
  '',
  '  The app under test was not built for the Playwright suite.',
  '',
  '  NEXT_PUBLIC_SUPABASE_URL is inlined at BUILD time, and the admin specs sign in',
  '  with a cookie named sb-127-auth-token, whose name derives from that URL. A build',
  '  made with the real Supabase URL cannot authenticate them, and dozens of specs',
  '  fail with pages that render only "Unauthorized".',
  '',
  '  Build it the way the suite needs, then run the tests:',
  '',
  '      npm run test:e2e            # builds correctly, then runs Playwright',
  '',
  '  or, to build once and iterate:',
  '',
  '      npm run test:build',
  '      npx playwright test --project=chromium',
  '',
  '  Note this leaves .next built against a stub Supabase. Run `npm run build`',
  '  before serving the app for anything else.',
  '',
].join('\n');

export default async function assertTestBuild() {
  // E2E_LIVE_BACKEND is a deliberate opt-in to a REAL build (the live-backend
  // specs need the real Supabase origin, which is the one thing this check
  // rejects), so it is not this guard's business to refuse it.
  if (process.env.E2E_LIVE_BACKEND) return;
  const base = process.env.TEST_URL || 'http://localhost:3000';
  const pointedElsewhere = Boolean(process.env.TEST_URL);

  let html: string;
  try {
    const res = await fetch(base, {
      // The middleware 403s a default fetch/curl agent as a bad bot.
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36' },
    });
    html = await res.text();
  } catch {
    // Not this check's job to diagnose an unreachable server: Playwright's own
    // webServer timeout says that far better than a guess from here.
    return;
  }

  const found = /<link[^>]+rel="preconnect"[^>]+href="([^"]*)"/.exec(html)?.[1];
  if (found === EXPECTED_ORIGIN) return;

  const detail = `  Served build points at: ${found ?? '(no preconnect link found)'}\n  Expected:               ${EXPECTED_ORIGIN}\n${FIX}`;
  if (pointedElsewhere) {
    console.warn(`\n[playwright] TEST_URL is set, so continuing anyway.\n${detail}`);
    return;
  }
  throw new Error(detail);
}
