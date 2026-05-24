#!/usr/bin/env bash
# URL sweep helper for the Lavaca site.
#
# Reads a newline-separated list of URLs (full URLs or just paths) from a file,
# fetches each with a browser User-Agent (the site's middleware 403s curl's
# default UA), and prints PASS/FAIL per URL plus a summary.
#
# Usage:
#   bash check-urls.sh <host> <url-list-file>
#
# Example:
#   bash check-urls.sh http://localhost:3000 /tmp/gsc-404/urls.txt
#   bash check-urls.sh https://www.lavacagc.com /tmp/gsc-404/urls.txt
#
# URLs in the list can be:
#   - absolute (https://www.lavacagc.com/foo) — origin is stripped, path is fetched against $HOST
#   - relative (/foo) — fetched against $HOST as-is
#
# Exits 0 if all PASS, 1 if any FAIL.

set -u

HOST="${1:-}"
LIST="${2:-}"

if [ -z "$HOST" ] || [ -z "$LIST" ]; then
  echo "usage: $0 <host> <url-list-file>" >&2
  exit 2
fi
if [ ! -f "$LIST" ]; then
  echo "error: list file not found: $LIST" >&2
  exit 2
fi

UA="Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
PASS=0
FAIL=0
FAILURES=()

while IFS= read -r url; do
  [ -z "$url" ] && continue
  # Strip any production origin so we always hit the chosen host
  path=$(echo "$url" | sed -E 's|^https?://[^/]+||')
  [ -z "$path" ] && path="/"

  hdr=$(curl -sI -H "User-Agent: $UA" "${HOST}${path}" 2>/dev/null)
  code=$(echo "$hdr" | awk 'BEGIN{IGNORECASE=1} /^HTTP/{c=$2} END{print c}')

  if [ "$code" = "200" ] || [ "$code" = "301" ] || [ "$code" = "308" ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    FAILURES+=("$code  $path")
    echo "FAIL  $code  $path"
  fi
done < "$LIST"

echo "---"
echo "PASS=$PASS  FAIL=$FAIL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
