# verify-web extended playbook

Full notes that don't fit in SKILL.md (which is capped at 2200 chars per the standing rule). Read this when you need detail beyond the trigger.

## AC class → tool mapping (with examples)

| AC class | Tool | Example |
|---|---|---|
| Response header (CSP, security, redirects) | `curl -sI` with browser UA | `curl -sI -H "User-Agent: $UA" "$HOST/" \| grep -i "content-security-policy"` |
| URL still resolves / redirect batch | `helpers/check-urls.sh` | `bash check-urls.sh https://www.lavacagc.com /tmp/urls.txt` |
| JSON-LD schema (counts, uniqueness, entity merge) | `helpers/jsonld-parse.py` | `python3 jsonld-parse.py <url> --strict` |
| In-page DOM (computed styles, element presence) | Playwright `browser_evaluate` | See `csp-probe-snippet.md` |
| Console errors / pageerrors | Playwright `browser_navigate` → `browser_console_messages` | `level: "error"` |
| Form interaction / full flow | Playwright `browser_fill_form` + `browser_click` | Inline; assert success state appears |
| Redirect target reached via dynamic logic | Playwright `browser_navigate` + `page.url` | Compare URL after navigation |

## Lavaca-specific quirks (expanded)

### Browser UA required on curl

`src/middleware.ts` blocks bot-like User-Agents with HTTP 403. `curl` defaults to `curl/X.Y.Z` which matches. Always pass:

```bash
UA="Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
```

### Clarity + FB Pixel hostname gate

`src/app/layout.tsx` wraps both analytics snippets in `if (window.location.hostname === 'www.lavacagc.com' && !navigator.globalPrivacyControl)`. On localhost, neither loads; on prod, neither loads when the browser sends a Global Privacy Control signal (GPC suppression is honored in real time). Implications:

- Local console-error checks won't surface CSP issues caused by the analytics bundles.
- Use the `new Function('return 1+1')()` probe (in `csp-probe-snippet.md`) as a direct CSP-eval test instead.
- Always re-run console checks against prod after deploy. This is non-optional.
- Verify prod with GPC **off** in the test browser, or the gated scripts silently won't load and a "0 errors" result is meaningless (same false-pass trap as the localhost gate).

### Vercel preview = 401

Deployment Protection is enabled. Curl/Playwright against the preview URL returns 401 unauthenticated. Two paths:
1. Fall back to local dev verification + queue prod re-verification post-merge.
2. Generate a Vercel deployment bypass token (`vercel env add VERCEL_AUTOMATION_BYPASS_SECRET`) and pass it as `?x-vercel-protection-bypass=…` or as a header.

Path 1 is what we used in PR #6. Path 2 is cleaner if you'll be doing many preview verifications.

## PR #6 → PR #7 case study (why prod re-verification is mandatory)

**PR #6 fix:** added `'unsafe-eval'` to CSP so FB Pixel + GTM Custom HTML could stop failing.

**Local verification:** `/free-estimate` console showed 0 errors. ACs claimed passing.

**What I missed:** FB Pixel and Clarity are hostname-gated to `www.lavacagc.com`. They never loaded on localhost, so the local "0 errors" was meaningless for the bundles that the CSP fix was supposed to help.

**Prod after PR #6 merged:** 14 NEW CSP violations appeared. The unblocked FB Pixel had immediately started reaching CAPI Lite endpoints (`*.a.run.app`, `*.on.aws`), Google Ads tracking (`googleads.g.doubleclick.net`), Cloudflare Insights (`static.cloudflareinsights.com`), and Clarity-Bing sync (`c.bing.com`) — none in the CSP allowlist. The eval fix was correct; it just *revealed* a second class of CSP issues.

**PR #7 fix:** added the 5 missing endpoints to the CSP, re-verified on prod (`/free-estimate` 0 errors after PR #7 deploy).

**Lesson encoded in SKILL.md step 6:** prod re-verification is not optional. Third-party scripts only behave realistically on the prod hostname. "Passes locally" + "merged" ≠ "verified".

## Decision-gate examples

### 100% pass

Proceed to commit. In your reply mention the matrix passed; do not re-paste the table (the user already saw it).

### Pre-existing failure unrelated to this change

State it explicitly with evidence. Example:

> AC3 failed: `hero-trust-badges.spec.ts: all four trust badges are visible` — but this is pre-existing, not a regression from this change. Confirmed by baseline run on the unchanged code (same 5 failures, see [path/to/log]). Asking for your call: proceed anyway, or fix the test as a separate item?

### Local pass, prod fail

Treat as a fresh failure of the AC, not as an "edge case". Either fix-forward immediately (open follow-up PR per PR #6 → PR #7 pattern) or roll back. Do not leave the AC failing with a "noted for follow-up".

## What "ready" means in this codebase

- All session-level ACs pass.
- TypeScript clean (`npx tsc --noEmit`).
- ESLint clean on changed files.
- For website code: full Playwright matrix passes against dev, AND prod after deploy.
- For commits: gitleaks clean (runs automatically via pre-commit hook).
- For PRs: Vercel preview build succeeds; e2e CI failure is the known-broken baseline (not blocking; see git log for prior PRs that merged with same status).
