#!/usr/bin/env bash
#
# Build the app the way the Playwright suite needs it.
#
# WHY THIS EXISTS. Several public env vars are INLINED BY NEXT AT BUILD TIME -
# in the middleware and server components as well as the client bundle - so no
# amount of env at `next start` or `playwright test` time can change them. A
# plain `npm run build` therefore produces a binary the admin specs cannot
# authenticate against, and the suite fails by the dozen for a reason that
# looks nothing like its cause: 59 specs red, most of them loading a page that
# renders the single word "Unauthorized".
#
# The value that matters most is NEXT_PUBLIC_SUPABASE_URL. @supabase/ssr derives
# its cookie name from the URL's first hostname label, so the fabricated session
# the admin specs set - `sb-127-auth-token` - only matches a build pointed at a
# 127.x origin, and middleware's getUser() only answers when that origin is the
# GoTrue stub playwright.config.ts runs for the whole suite.
#
# CI has always done this correctly, inline in .github/workflows/playwright.yml.
# Local runs had no equivalent and no error message saying so. This script is
# now the ONE definition, called by `npm run test:build` and by CI, so the two
# cannot drift.
set -euo pipefail

# Public reCAPTCHA site keys are only referenced client-side - placeholders
# unblock the build; tests stub window.grecaptcha so no real verify runs.
# The v2 (checkbox) key MUST be non-empty or RecaptchaChallengeProvider's
# requestChallenge() short-circuits to null, which fails the v2-challenge
# E2E (request-estimate AC5) even though that test mocks the network.
export NEXT_PUBLIC_RECAPTCHA_SITE_KEY="test-placeholder-site-key"
export NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY="test-placeholder-v2-site-key"

# Point the baked Supabase URL at the local GoTrue stub - see the note above,
# and tests/helpers/gotrue-stub.mjs for the other half of the admin session.
# While the stub is not running the port simply refuses connections, which is
# exactly how the old unreachable placeholder behaved: mocked tests never reach
# Supabase (they stub or intercept), and live-backend tests skip unless
# E2E_LIVE_BACKEND is set. The browser client reads
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and falls back to ANON_KEY, so both
# names carry the placeholder.
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:9099"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="placeholder-anon-key"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder-anon-key"

exec npx next build
