#!/usr/bin/env bash
# Post-deploy smoke test.
#
#   scripts/smoke.sh <base-url> [expected-commit]
#
# Hits the homepage, one service page, the Home Care signup page and
# /api/health. Pages send a real browser user-agent: the bad-bot filter in
# src/middleware.ts answers 403 to curl, and a smoke test should measure the
# site, not the filter. /api/health must say "ok" and, when given, report the
# expected commit (so a stale deployment cannot pass for the new one).
#
# SMOKE_CURL overrides the client, e.g. SMOKE_CURL="vercel curl" for deployment
# URLs behind Vercel Authentication (arguments after -- go to curl).
set -uo pipefail
base="${1:?usage: smoke.sh <base-url> [expected-commit]}"
want_commit="${2:-}"
ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 lavaca-smoke'
fail=0

fetch() { # url -> prints "<code> <body-file>"
  local out; out=$(mktemp)
  local code
  if [ -n "${SMOKE_CURL:-}" ]; then
    code=$($SMOKE_CURL "$1" -- -s -A "$ua" -o "$out" -w '%{http_code}' --max-time 30)
  else
    code=$(curl -s -A "$ua" -o "$out" -w '%{http_code}' --max-time 30 "$1")
  fi
  echo "$code $out"
}

for path in / /services/kitchen-remodeling /home-care; do
  read -r code file < <(fetch "$base$path")
  if [ "$code" = "200" ] && grep -qi '</html>' "$file"; then
    echo "ok   $code $path"
  else
    echo "FAIL $code $path"; fail=1
  fi
done

read -r code file < <(fetch "$base/api/health")
status=$(node -e 'try{const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(b.status+" "+b.commit)}catch{console.log("unparseable -")}' "$file")
read -r hstatus hcommit <<<"$status"
if [ "$code" = "200" ] && [ "$hstatus" = "ok" ] && { [ -z "$want_commit" ] || [ "$hcommit" = "${want_commit:0:7}" ]; }; then
  echo "ok   $code /api/health ($hstatus, commit $hcommit)"
else
  echo "FAIL $code /api/health (status $hstatus, commit $hcommit, expected ${want_commit:0:7})"; fail=1
fi
exit $fail
