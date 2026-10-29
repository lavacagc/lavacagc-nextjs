# Retrospective - Home Services build, 2026-10-29

Format follows the `retro` skill: candidates for improving the agent environment, in order of severity, each with what was done or what remains.
Source: this session's transcript, the four slice reports and reviews, the SEO and security reviews.

## 1. Automated checks

**A from-scratch migration replay was impossible (fixed).**
Five production-only objects (`projects`, `project_images`, `rate_limits`, `google_reviews`, the full `leads` column set, plus `app_role`/`has_role`) were never captured as migrations, so `supabase db reset` stopped halfway and every limiter failed open.
Each is now a guarded block in `00000000000001_preview_baseline_fixups.sql`, and `.github/workflows/migrations-replay.yml` replays every migration from an empty database on any PR that touches `supabase/`.
Remaining: `blog_posts.title` (the dashboard tab still 500s locally).

**The pre-push hook could not pass on this machine (fixed).**
`npm run chaos:static` crashed under the default Node 20 with `ERR_UNKNOWN_FILE_EXTENSION` because ts-node loaded the app tsconfig.
Every push needed `--no-verify` or a Node 24 shell, which means the four-step gate was not running.
The four ts-node scripts now use `tsconfig.scripts.json`, and the chaos baseline is re-locked at zero known violations.

**ESLint walked the agent worktrees (fixed).**
`.claude/worktrees/**` is inside the repo; `npm run lint` reported 213,802 problems until the config ignored it.

**The codemap was 220 files stale (rebuilt).**
`node scripts/check-freshness.mjs` is a manual step; consider a CI job that fails when the map drifts past a threshold.

**Next.js was 38 advisories behind (fixed).**
Upgraded to 16.4.3 as a security-review condition.
The new React Compiler lint rules flag 56 pre-existing effect and ref patterns in twenty unrelated files; they are off in `eslint.config.mjs` until a dedicated pass.

## 2. Information access

**The production schema and policies could not be read.**
No `SUPABASE_ACCESS_TOKEN`, no SQL RPC, so the `projects` RLS policy text is a launch check for Alex rather than a verified fact.
`supabase login` once on this machine would let `supabase db dump --linked -s public` answer such questions read-only.

**Three features cannot be exercised without provider keys.**
Twilio, SpecNook and Google Places were built behind env-gated modules and verified only on their "not configured" paths; the real sends and the Held queue are on the post-deploy list.
A staging Twilio number and a sandbox SpecNook endpoint would move those into the local rig.

## 3. Parallel agents (new lesson, saved to memory)

- The Agent tool cut every worktree at `origin/main`, not at the branch HEAD the brief named; every builder had to reset.
  Briefs must state the base SHA and ask for a `git log -1` check.
- One local database and one MCP browser were shared by four builders and four reviewers; cookies are shared across localhost ports, cleanups deleted each other's rows, and the live-backend specs cannot run from two checkouts at once.
  Row prefixes per agent and scripted Playwright instead of the shared browser contained most of it; the spec-level cleanup needs a per-run prefix.
- Shared-rig defects (CSP for `127.0.0.1`, `next/image` hosts, chaos:static, missing tables) were fixed once on the main branch and cherry-picked; a builder fixing them locally would have left the others broken.
- Machine load from eight concurrent Playwright suites made page waits of 5 s fail on offer pages that took 36 s to render; the specs now wait 15 s and warm their pages.

## 4. Coding standards worth a reviewer rule

- Every `date` column displayed on the site must go through `parseDateOnly`; `new Date('YYYY-MM-DD')` is UTC midnight and shows the previous day or month in New York.
  A lint rule banning `new Date(` on a bare date string would be mechanical.
- No homeowner notes, phone or email may reach a sub-facing surface; the offer page now selects only the sub-visible columns, and a spec asserts the raw HTML.
- Public readers of `projects` must filter `active = true`; one (`/free-estimate`) did not.

## 5. Tool economy

- Reading the four large component files cost about 60 KB of context before any decision could be made; the codemap's `query-map.mjs --trace` would have been cheaper for the first pass.
- Each builder spent 300 to 670 k tokens; most of the excess went to re-running suites under load and to re-discovering the shared-rig faults one at a time.
  A rig smoke script (tables present, CSP dev branch, port free, chaos:static runs) at the top of every brief would have saved all four the same hour.

## 6. Steering files

`CLAUDE.md` gained three navigation pointers (local rig, Home Services docs, project ingest) and nothing else.
The `verify-web` skill gained the dev-versus-production-build rule for the local rig and the cold-start warm-up.
The `grilling` skill gained one line: review-round rulings go in `docs/decisions/` as they are made.

## What shipped from this retro

- `supabase/migrations/00000000000001_preview_baseline_fixups.sql`: six guarded production-only objects.
- `.github/workflows/migrations-replay.yml`: the replay gate.
- `tsconfig.scripts.json` and the four `package.json` scripts: chaos:static runs on Node 20.
- `eslint.config.mjs`: worktrees ignored; React Compiler rules deferred.
- `docs/local-rig.md`, `docs/decisions/003-review-round-rulings.md`, `docs/home-services/follow-ups.md`.
- Memory: `local-supabase-rig`, `parallel-agent-worktrees`, `home-services-build-2026-10`.
- LinkedIn draft: `docs/linkedin/2026-10-29-your-migrations-are-lying-to-your-agents.md`.
