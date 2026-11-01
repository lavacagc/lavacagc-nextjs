#!/usr/bin/env bash
# Every migration a change ADDS must carry a rollback note: a comment line that
# starts with "-- Rollback". Existing migrations are not judged (they are
# applied history). Usage: scripts/check-migration-rollback.sh <base-ref>
set -euo pipefail
base="${1:?usage: check-migration-rollback.sh <base-ref>}"
missing=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if ! grep -qiE '^--[[:space:]]*Rollback' "$f"; then
    echo "missing rollback note: $f (add a '-- Rollback: ...' comment saying how to undo it)" >&2
    missing=1
  fi
done < <(git diff --name-only --diff-filter=A "$base" HEAD -- 'supabase/migrations/*.sql')
if [ "$missing" = 1 ]; then exit 1; fi
echo "migration rollback notes: ok"
