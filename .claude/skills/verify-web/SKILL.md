---
name: verify-web
description: AC-driven verification for website changes — dev server, Playwright/curl/JSON-LD checks, prod re-check after deploy, pass/fail matrix, 100% pass before "ready". Use before committing or claiming done on anything affecting rendered HTML/JS/CSS.
metadata:
  tags: verification, playwright, csp, json-ld
---

## When to use

Committing or claiming done on changes to `src/app/**`, `src/components/**`, `src/middleware.ts`, `next.config.ts` headers/redirects, or anything that ships to a browser. Also: verifying a prod deploy.

Skip for docs, `.gitignore`, `CLAUDE.md`, memory, internal scripts.

## Six steps

1. **State 2–5 testable ACs in chat** (`AC1: …`). Bad: "page works". Good: "console 0 errors; 4 form fields queryable".
2. **Dev server**: `npm run dev` background. Wait for `Ready in`. Parse port (3000, else 3002 if busy).
3. **Run matrix** — tool per AC class:
   - response header → `curl -sI` with browser UA
   - URL batch → `helpers/check-urls.sh <host> <list>`
   - JSON-LD → `helpers/jsonld-parse.py <url> --strict`
   - DOM/console/form → Playwright MCP (`helpers/csp-probe-snippet.md`)
4. **Report markdown matrix** in chat: one row/AC, ✅/❌ + evidence.
5. **Gate**: 100% → commit. <100% → fix or report honestly; never commit half-passing work.
6. **After prod deploy**: mandatory re-run against `https://www.lavacagc.com`. 3rd-party scripts (Clarity, FB Pixel, Ads) only load on prod hostname and surface errors local doesn't (see PR #6→#7 case study in playbook).

## Lavaca quirks

- **curl needs browser UA** — middleware 403s default `curl/X.Y.Z`. Use `Mozilla/5.0 (Macintosh) AppleWebKit/537.36 ...`.
- **Clarity + FB Pixel gated** on `www.lavacagc.com` **and** `!navigator.globalPrivacyControl` (`src/app/layout.tsx`) — with Global Privacy Control on in your browser they never load, even on prod. Locally use `new Function('return 1+1')()` eval probe instead.
- **Vercel preview = 401** (Deployment Protection). Use local dev + queue prod re-verification.
- **Local Supabase rig** (`docs/local-rig.md`) for anything that writes: a production build there cannot sign in to the admin or read `google_reviews` from the browser, because the CSP allows `127.0.0.1` only under `NODE_ENV=development`. Use `next dev` for admin and live-backend specs, the production build for CSP, headers and Lighthouse.
- **Cold dev server** renders the first parallel page loads in ~35 s; curl the pages you will test before running specs or they time out.
- **Agent worktrees under `.claude/worktrees/`** are inside the repo; ESLint ignores them (eslint.config.mjs). If `npm run lint` ever reports six figures of problems, that ignore was lost.

## See helpers/

- `playbook.md` — extended notes, PR #6→#7 case, decision-gate examples
- `jsonld-parse.py` — entity-merge schema parser
- `check-urls.sh` — URL sweep with browser UA
- `csp-probe-snippet.md` — Playwright snippets
