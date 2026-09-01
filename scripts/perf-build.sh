#!/usr/bin/env bash
#
# Build the app against the LOCAL Supabase stack for performance baselining.
#
# Why a third build flavor (next to `npm run build` and scripts/test-build.sh):
# the perf harness needs server-side Supabase queries to actually EXECUTE so
# pg_stat_statements can count and time them. The test build points at the
# GoTrue stub (queries fail fast, count nothing) and a real build points at
# hosted Supabase (off-limits for local-only measurement). The local stack is
# the only backend that is both real and fully on this machine.
#
# Requires `supabase start` to have been run once (the stack keeps running).
set -euo pipefail

status_env=$(supabase status -o env 2>/dev/null) || {
  echo "perf-build: the local Supabase stack is not running." >&2
  echo "perf-build: start it with: supabase start" >&2
  exit 1
}
eval "$(printf '%s\n' "$status_env" | grep -E '^(API_URL|ANON_KEY)=')"

export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"

# Same placeholder reCAPTCHA site keys as scripts/test-build.sh, same reason:
# only referenced client-side, and the perf actions stub window.grecaptcha.
export NEXT_PUBLIC_RECAPTCHA_SITE_KEY="test-placeholder-site-key"
export NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY="test-placeholder-v2-site-key"

# `npm run build`, not `npx next build` - see scripts/test-build.sh.
exec npm run build
