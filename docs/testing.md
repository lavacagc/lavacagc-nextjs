# Testing

Moved from CLAUDE.md on 2026-10-31 so agents load it only when they run the suite.
CI runs the build and the smoke suite on every PR (`.github/workflows/ci.yml`).

## Running the Playwright suite

Use **`npm run test:e2e`**. It builds the app the way the suite needs and then
runs Playwright, and it is the same build CI makes (`scripts/test-build.sh` is
called by both, so they cannot drift).

A plain `npm run build` followed by `npx playwright test` does **not** work, and
used to fail 59 specs with pages rendering only "Unauthorized".
`NEXT_PUBLIC_SUPABASE_URL` is inlined at BUILD time, and the admin specs sign in
with a cookie named `sb-127-auth-token` whose name derives from that URL, so
they can only authenticate against a build pointed at the local GoTrue stub.
A global setup now fails the run immediately, naming the fix, rather than
letting that surface as dozens of confusing failures.

Stop any `npm run dev` on port 3000 before running the suite.
Playwright reuses a server already listening there instead of the one it would
start, and `next dev` reads the real Supabase URL from `.env.local` at run time,
so a leftover dev server trips that same guard no matter how you built.

Move `.env.local` aside for the run if it holds `SUPABASE_SECRET_KEY`.
CI has no such file, which is why this only bites locally: `test:build` points
the Supabase URL at the stub, and `/home-care/whats-new` is `force-static` and
reads Supabase while prerendering, so with a secret key present that read
actually dials 127.0.0.1:9099, gets ECONNREFUSED, and takes the whole build
down - `Export encountered an error on /home-care/whats-new/page`, which names
neither the env nor the cause. Without the key the same read fails early and
harmlessly. The specs that DO need real credentials are the live-backend ones,
and they are run separately by design.

### Every Playwright script pins its backend - a new one must too

There is no unpinned default, deliberately.
A bare `playwright test` inherits whichever `.next` happened to be built last,
and that is exactly how the live-backend specs end up red against a stub build
with nothing on screen explaining why.
So each `package.json` script that runs `playwright test` states which half of
the trade-off below it is on, and any script added later has to choose:

- **Stub-backed** - set `E2E_STUB_BACKEND=1`.
  This is the default, and it is right for anything running the whole suite or a
  subset of ordinary specs; the live-backend specs then skip and say so, exactly
  as they do in CI.
  Today: `test`, `test:e2e`, `test:ui`, `test:headed`, `test:mobile`,
  `test:flows`.
- **Live-backend** - set `E2E_LIVE_BACKEND=1`.
  Only for specs whose entire point is real Supabase content.
  These need a real `npm run build`, and the flag stands the build guard down, so
  such a script must own its own build rather than inherit one.
  Today: `test:links`.

A subset that mixes the two is stub-backed: skipping the live-backend specs is
honest, running them against a stub is not.
`E2E_LIVE_BACKEND=1` in front of any of them still overrides, for a deliberate
one-off against a real build.
`test:report` only renders an existing report, so it pins nothing.

The trade-off is deliberate: one build cannot satisfy both halves of the suite.
The admin specs need a 127.x origin; the live-backend specs need the real one,
so they SKIP under `test:e2e` exactly as they do in CI.
There are more of those than the obvious ones (`links`, `listings-gate`), and
the set grows as specs are added, so do not read any list here as the roster.
The specs are their own index: `grep -l "test.skip(SKIP_WITHOUT_LIVE_BACKEND"
tests/*.spec.ts` names every one that skips, and `tests/helpers/liveBackend.ts`
owns the flag and spells out which mode does what.
To run them instead, build normally and set `E2E_LIVE_BACKEND=1`.

`npm run test:links` is the one script on the other side of that trade-off, and
it is deliberately the LIVE-BACKEND link sweep: walking the real `/locations/*`
and `/services/*` paths only means anything when Supabase has content behind
them.
So it builds normally and sets `E2E_LIVE_BACKEND=1` itself, which both runs its
two specs instead of skipping them and stands the build guard down.
Do not pin it to `E2E_STUB_BACKEND` instead: that would skip both specs and
report a green run that checked nothing.
It owns its build because `E2E_LIVE_BACKEND` disables the guard, so against the
stub `.next` that `test:e2e` leaves behind it would otherwise 404 on every
DB-driven path with nothing to say why.
Do NOT treat `npm run audit:prod` as equivalent coverage.
It does reach production and report real results, but it sweeps a HARDCODED list
of 29 paths in `scripts/site-audit.ts`, so it drifts from the DB instead of
tracking it.
That list is already stale: it still contains `/locations/fairfield`, which is
not a `service_areas` slug and 404s in production.
`npm run test:links` is therefore the only check that walks the DB-driven paths
as they actually are, and it only runs when you invoke it deliberately.

Read that audit's output, do not gate on its exit code.
It scores every aborted third-party beacon as a failure, and Google Analytics,
Clarity and Cloudflare RUM abort routinely, so it exits nonzero against a healthy
site: the last production run was 163 passed / 33 failed / 1 warning, and 28 of
those 33 failures were that analytics noise.

Anything headless you point at this site must identify as a real browser.
The bad-bot filter in `src/middleware.ts` matches `/headlesschrome/i` and answers
403 on every page and API route, which is why `scripts/site-audit.ts` and
`playwright.config.ts` both use `devices['Desktop Chrome']`.
A first-party tool that skips this measures the bot filter, not the site.

Note `test:e2e` leaves `.next` built against a stub Supabase, and `test:links`
replaces it with a real one - run `npm run test:build` before returning to the
rest of the suite, or `npm run build` before serving the app for anything else.

### Chromium-only runs are desktop width - a width-specific spec pins its own viewport

`.github/workflows/playwright.yml` (manual dispatch only) and `npm run test:smoke` both run `playwright test --project=chromium`, which is Desktop Chrome.
The `mobile` project (Pixel 5) in `playwright.config.ts` runs only when it is asked for, with `npm run test:mobile` or `--project=mobile`.
A spec whose assertion only means something at phone or tablet width therefore states that width itself, with a `test.use({ viewport: ... })` in its `describe`, rather than inheriting it from a device profile.
Left to the profile, it runs at desktop width in every chromium-only run, where it either fails for a reason unrelated to what it pins or passes without the layout it was written for ever being on screen.
`tests/header-nav.spec.ts` is the worked example, at 390x844 and at 820x1024 for the 768-1023px band where the hamburger menu still exists but the page chrome is already desktop.
