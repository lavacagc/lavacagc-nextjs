#!/usr/bin/env bash
# Vercel "Ignored Build Step". Exit 0 = skip this build, exit 1 = build.
#
# Builds were 60 to 75 percent of the Vercel bill (docs/cost-review.md): every
# push to every branch built on a 30-vCPU machine. Two rules now decide:
#   1. A non-production push with no pull request behind it is not built.
#      Vercel sets VERCEL_GIT_PULL_REQUEST_ID only for PR deployments, so the
#      no-mistakes gate's intermediate pushes stop costing a build each.
#   2. A commit that touches only docs, tests, review pages or agent config is
#      not built, on any branch.
# Anything that errors here builds (the safe default): a wrong skip hides a
# broken site, a wrong build costs a few cents.
set -u
if [ "${VERCEL_ENV:-}" != "production" ] && [ -z "${VERCEL_GIT_PULL_REQUEST_ID:-}" ]; then
  echo "ignore-build: preview push without a pull request, skipping"
  exit 0
fi
if git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  if git diff --quiet HEAD^ HEAD -- . ':(exclude)docs' ':(exclude)tests' ':(exclude).lavish' ':(exclude).claude' ':(exclude)*.md' ':(exclude)chaos' ':(exclude)scripts/vercel-ignore-build.sh'; then
    echo "ignore-build: only docs, tests or review files changed, skipping"
    exit 0
  fi
fi
exit 1
