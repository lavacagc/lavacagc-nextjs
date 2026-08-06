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
 * It only ever concludes from a page that was actually SERVED and actually
 * carried that link. An unreachable server, a non-2xx response, a layout that
 * no longer renders the link: each of those means the probe cannot tell, and it
 * says so and stands aside. A guard that answers confidently and wrongly is
 * worse than no guard, and "blamed the build env for an unrelated failure" is
 * the very mistake this exists to end.
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
  '  FIRST, stop anything already listening on :3000. playwright.config.ts reuses an',
  '  existing server, so a `npm run dev` left running for manual verification is what',
  '  gets tested - and `next dev` reads the real URL from .env.local at RUN time, so it',
  '  can never satisfy this check however you build. (Or set TEST_URL to the server you',
  '  did mean to test, which downgrades this to a warning.)',
  '',
  '  Then build the way the suite needs, and run it:',
  '',
  '      npm run test:e2e            # builds correctly, then runs Playwright',
  '',
  '  or, to build once and iterate:',
  '',
  '      npm run test:build',
  '      E2E_STUB_BACKEND=1 npx playwright test --project=chromium',
  '',
  '  E2E_STUB_BACKEND is what skips the live-backend specs, exactly as CI skips them;',
  '  drop it and they run against the stub they cannot pass against.',
  '',
  '  This check is run-wide, so it also gates --project=node, whose specs drive their',
  '  own in-process stub and need no Next build at all. E2E_LIVE_BACKEND=1 stands the',
  '  check down - for those, and for a deliberate run against a real build.',
  '',
  '  Note test:build leaves .next built against a stub Supabase. Run `npm run build`',
  '  before serving the app for anything else.',
  '',
].join('\n');

const cannotTell = (why: string) =>
  console.warn(
    `\n[playwright] Could not check how the app under test was built: ${why}\n` +
      '  Continuing. If the suite now fails, that is the thing to look at first,\n' +
      '  not the build env this check would otherwise report on.\n',
  );

export default async function assertTestBuild() {
  // E2E_LIVE_BACKEND is a deliberate opt-in to a REAL build (the live-backend
  // specs need the real Supabase origin, which is the one thing this check
  // rejects), so it is not this guard's business to refuse it.
  if (process.env.E2E_LIVE_BACKEND) return;
  const base = process.env.TEST_URL || 'http://localhost:3000';
  const pointedElsewhere = Boolean(process.env.TEST_URL);

  let status: number;
  let html: string;
  try {
    const res = await fetch(base, {
      // The middleware 403s a default fetch/curl agent as a bad bot.
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36' },
    });
    status = res.status;
    html = await res.text();
  } catch {
    // Not this check's job to diagnose an unreachable server: Playwright's own
    // webServer timeout says that far better than a guess from here.
    return;
  }

  if (status < 200 || status >= 300) {
    cannotTell(`${base} answered HTTP ${status}, so no page was served to read.`);
    return;
  }

  const found = /<link[^>]+rel="preconnect"[^>]+href="([^"]*)"/.exec(html)?.[1];
  if (found === EXPECTED_ORIGIN) return;
  if (found === undefined) {
    cannotTell(
      `${base} served a page with no <link rel="preconnect" href="...">.\n` +
        '  This check reads the one src/app/layout.tsx renders from NEXT_PUBLIC_SUPABASE_URL;\n' +
        '  if that link moved, or the value is unset so it renders without an href, teach\n' +
        '  tests/helpers/assert-test-build.ts the new probe.',
    );
    return;
  }

  const detail = `  Served build points at: ${found}\n  Expected:               ${EXPECTED_ORIGIN}\n${FIX}`;
  if (pointedElsewhere) {
    console.warn(`\n[playwright] TEST_URL is set, so continuing anyway.\n${detail}`);
    return;
  }
  throw new Error(detail);
}
