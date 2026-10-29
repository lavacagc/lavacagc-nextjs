#!/usr/bin/env bash
# Vercel "Ignored Build Step". Exit 0 = skip this build, exit 1 = build.
#
# Builds were 60 to 75 percent of the Vercel bill (docs/cost-review.md): every
# push to every branch built on a 30-vCPU machine. Two rules now decide:
#   1. A non-production push with no pull request behind it is not built.
#      Vercel sets VERCEL_GIT_PULL_REQUEST_ID only for PR deployments, so the
#      no-mistakes gate's intermediate pushes stop costing a build each.
#   2. A push that, since the branch's last deployed commit, touches only docs,
#      tests, review pages or agent config is not built, on any branch.
# Anything that errors here builds (the safe default): a wrong skip hides a
# broken site, a wrong build costs a few cents.
set -u
if [ "${VERCEL_ENV:-}" != "production" ] && [ -z "${VERCEL_GIT_PULL_REQUEST_ID:-}" ]; then
  echo "ignore-build: preview push without a pull request, skipping"
  exit 0
fi
# Diff everything since the last deployed commit for this branch, not just the
# tip: a multi-commit push whose last commit is docs-only still carries the
# earlier code. Unset (first deploy) or not in the shallow clone means build.
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -n "$base" ] && git cat-file -e "${base}^{commit}" 2>/dev/null; then
  # Markdown is skipped only under docs/ or at the repo root: src/content/*.md
  # is read at build time by the legal pages, so any change under src/ builds.
  if git diff --quiet "$base" HEAD -- . ':(exclude)docs' ':(exclude)tests' ':(exclude).lavish' ':(exclude).claude' ':(exclude,glob)*.md' ':(exclude)chaos' ':(exclude)scripts/vercel-ignore-build.sh'; then
    echo "ignore-build: only docs, tests or review files changed since $base, skipping"
    exit 0
  fi
fi
exit 1
