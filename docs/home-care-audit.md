# Home Care audit (Phase 1)

Audited 2026-10-31 at `origin/main` 7b16812.
Read-only: nothing in code, data, env, DNS or hosting was changed.
Decisions needed before Phase 2 are collected at the end.

## 1. Repo and deploy

| Area | What exists today |
|---|---|
| Hosting | Vercel, project `lavacagc-nextjs-138k`, Git integration deploys `main` to production. Not Coolify. `output: 'standalone'` is set in `next.config.ts:477` but unused by Vercel. |
| Build gating | `scripts/vercel-ignore-build.sh` is the Ignored Build Step: previews build only for PRs, and docs/tests/CI-only diffs skip builds (cost review, `docs/cost-review.md`). Build machine is `standard`. |
| Branches | Feature branches, PR to `main`. The no-mistakes gate (`.no-mistakes.yaml`) reviews, tests and opens PRs. |
| Package manager | npm, `package-lock.json`, `.npmrc` has `legacy-peer-deps=true`. |
| Node | **Mismatch.** Vercel runs 22.x; every workflow uses 20; the local Mac runs 20.20. No `.nvmrc` and no `engines` field. |
| Scripts | `lint`, `typecheck`, `build`, `test` (Playwright, stub backend), `test:build`, `test:smoke`, `chaos:*`, `perf`, `audit`. |
| Unit tests | None. Playwright is the only runner (111 specs, `chromium` and `mobile` Pixel 5 projects). |
| Local gate | Husky `pre-push` runs typecheck, chaos static, ESLint on changed files, production build and Playwright smoke. Its header says "the Mac is the gatekeeper, so CI minutes are not". `pre-commit` runs lint-staged; gitleaks config exists (`.gitleaks.toml`). `commit-msg` blocks co-author trailers. |
| GitHub Actions | `lint.yml` (lint + typecheck), `chaos.yml` (static, regressions, crawl), `migrations-replay.yml` (replays every migration on a local stack when `supabase/**` changes), `no-coauthor.yml`, `playwright.yml` (manual dispatch only). All use `concurrency` with cancel-in-progress. No dependency or `.next/cache` caching beyond setup-node defaults. |
| Branch protection | `main` requires 1 approving review, admins not enforced, **no required status checks**. |
| Repo visibility | **Public.** GitHub-hosted runner minutes are free for public repos, so the "save CI minutes" reason for the local gate no longer applies; only Vercel build minutes cost money. |
| Env vars | Vercel holds them. `.env.local` points at production Supabase. **`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `RESEND_API_KEY` are scoped "Production, Preview"**, so every PR preview reads and writes production data and sends real email. No GitHub Actions secrets exist. |
| Migrations | 73 files in `supabase/migrations`. Production is applied by the Supabase GitHub integration on merge, in parallel with the Vercel deploy (no ordering). Production history was repaired 2026-10-29 after it had silently stopped applying. Only 2 migrations carry a rollback note. |
| Crons | 20+ in `vercel.json` (publish, follow-ups, SEO, newsletter on the 1st, intake chase, sitemap watch, and others). `/api/cron/health` exists but is not scheduled and alerts nobody. |
| Health check | No public `/api/health`. `/api/health/forms` reports env presence behind `DIAGNOSTICS_KEY`. |
| Monitoring | No Sentry, UptimeRobot or Better Stack. Telegram alerts cover new leads, form errors and crew dispatch only. |
| Assets | `public/` is 165 MB; 35 files exceed 500 KB, the largest are hero videos (9 to 12 MB) and `public/blog/gc-millburn.png` (6.8 MB). |
| Agent docs | `CLAUDE.md` exists (292 lines) and a codemap exists at `docs/codemap/CONTEXT.md`, but `CLAUDE.md` does not point agents at the codemap. |

## 2. Analytics

- GA4 and Google Ads through gtag (`src/services/analyticsManager.ts`), configured from the `analytics_config` table, production hostname only.
- GTM supported but only if `gtm_container_id` is set in the database.
- Microsoft Clarity and Meta Pixel (`src/components/ThirdPartyAnalytics.tsx`), gated by hostname, GPC and an excluded-path list, **not by consent**.
- First-party: CTA A/B events (`/api/cta/event`), experiments (`/api/experiments/event`), `lead_events` (phone clicks only).
- No Vercel Analytics, Speed Insights, PostHog or web-vitals reporting. `src/utils/performanceMonitor.ts` observes LCP/CLS but nothing imports it.
- Consent: `CookieConsent.tsx` shows no banner and grants analytics by default. GPC is the only real opt-out.
- CSP (`next.config.ts:130-181`) has no PostHog hosts; adding PostHog needs them or a `/ingest` reverse proxy.
- Events tracked: `form_submit`, `generate_lead`, `form_field_focus`, `form_abandon`, `phone_click`, `estimate_request`, `calculator_step`, `calculator_complete`, `cta_click`, `home_care_promo_click` (placement: header, homepage band, exit popup), `newsletter_*`, `smart_banner_*`, `landing_page_view`, `scroll_depth`, `section_view`, portfolio events and Ads conversions.
- **The Home Care signup itself fires no events at all**: nothing on submit, verify, wizard steps or completion.

## 3. Home Care signup flow

1. Entry CTAs to `/home-care`: header top bar and menu (`Header.tsx:205,294,415`), footer, homepage band (`HomeCareBanner.tsx`), exit-intent popup, `/home-services`, unsubscribe page, lead follow-up emails 2 and 3, member share link.
2. Gate on `/home-care` (`HomeCareOptInForm.tsx`): `first_name`, `email`, `zip`, optional `home_type`, honeypot. Client validation is hand-written.
3. `POST /api/home-care/subscribe`: reCAPTCHA, rate limit, zod with `.passthrough()`. Upserts `homeowners` (status `pending`, tokens, `source='home-care'` hardcoded) and `consent_logs`. Sends the verification email.
4. Email link `GET /api/home-care/verify`: sets `active`, `verified_at`, signs the `hc_access` cookie (30 days), adds the contact to the Resend audience, sends the welcome email, redirects first-timers to `/home-care/setup`.
5. Setup wizard (`HomeCareSetupWizard.tsx`), 5 steps: stage, program (info), home systems, details, done. `POST /api/home-care/profile` upserts `home_profiles`. Only step 1 validates.
6. Completion: `/home-care/checklist?welcome=1`.

- Tables: `homeowners`, `home_profiles`, `consent_logs`, `email_log`, and the checklist tables below.
- Emails (Resend, customer only, via `sendTrackedEmail`): verification and welcome. No internal alert on signup.
- Auth: no Supabase Auth; emailed links plus a signed cookie. "First portal login" is the first successful verify (`wasPending` in `verify/route.ts:36`); there is no stored flag.

### Partner shop promo: not built

Nothing in `main`, any branch, any PR, `docs/` or memory implements or specifies it.
There is no shop-source URL param, code, cookie or column; no definition of "full profile"; no $100 prize logic; no partner logo on the portal.
The only "shop" is the Amazon DIY Kit shelf (PR #99), which is unrelated.
Phases 3 and 4 assume it exists, so it needs a spec and a build first (see decisions).

### Gaps found in the signup flow

- No migration in the repo creates `consent_logs`; the table exists only in production and in the generated types.
- Form requires ZIP; the API treats it as optional.
- The handler destructures only the fields it knows and hardcodes `source: 'home-care'` (`subscribe/route.ts:62`), so a shop param posted today would vanish without error.
- No UTM or `gclid` is stored on signup, so attribution is impossible today.
- The wizard counts an empty home profile as finished.

## 4. Home Care checklist

- Page `src/app/home-care/checklist/page.tsx` (cookie-gated), card logic in `HomeCareChecklistClient.tsx` (`Row`, :686-942) and `src/lib/homecare/taskChoice.ts`.
- Items are 54 rows in `maintenance_catalog` seeded by migrations, filtered by season, home systems and stage; per-member state is in `homeowner_maintenance`.
- Card shapes: 29 "choose" (DIY or La Vaca), 5 DIY-only, 20 pro-only. Starter tasks show in an "essentials" section.

| Control | Expected behavior | Writes |
|---|---|---|
| Checkbox | Mark done or undone | `POST /api/home-care/task` `{done}` to `homeowner_maintenance` |
| Eye icon | Hide task, undo bar | `/task` `{dismiss}` |
| I'll do it / La Vaca does it | Save mode; DIY shows the kit shelf, Pro adds to request | `/task` `{mode}` |
| + Add to request (pro-only) | Add to request | Browser only, not saved |
| Request button | Open `/home-care/book?tasks=` and submit | `/api/leads/submit` to `leads` |
| Learn more | Open the season guide (20 of 54 tasks) | none |
| Wrench / pin | Save a home detail | `/api/home-care/record` to `home_records` |
| DIY Kit product | Amazon link | none |
| Guide "Add this on my checklist" | Open checklist with `?add=` | none |
| Upcoming visit card | Shows after staff schedule; `.ics` download | `/api/home-care/visit.ics` |

The full per-task list (season and shape) is in the DIY or Pro migration `20260830000000_home_care_diy_or_pro.sql` and the catalog migrations; Phase 4 will generate the test matrix from the table rather than copy it here.

### Defects found in the checklist

1. The DIY Kit disclosure says "We count taps, not who tapped", but no code writes `home_care_product_clicks`. The copy is false today.
2. `tests/home-care-checklist-ux.spec.ts` C1 expects "Read more" and a two-line clamp; the UI now uses one line and "more/less". The spec is stale and hidden because it only runs with `HC_PORTAL_E2E`.
3. The public `ChecklistPreview.tsx` drifted: "Book it" on pro tasks, spring tasks in the summer plan, old A/C title, HVAC filter shown as DIY.
4. Pro-only "Add to request" picks are lost on reload.
5. The page admits `pending` members but the task API requires `active`, so every tap would fail and revert for them.
6. 34 of 54 tasks have no guide.
7. The browser-level checklist specs run only with `HC_SHELF_E2E` / `HC_PORTAL_E2E` and are not in any CI job.

## 5. Proposed CI/CD design

Fitted to what exists: keep Vercel and its ignore-build cost rules, keep the local gate as a fast pre-check, and move the expensive proof into Actions, which are free on this public repo.

1. **One `ci.yml` on every PR**, replacing `lint.yml`: `npm ci` with setup-node npm cache, Node from a new `.nvmrc` (22, matching Vercel), lint, typecheck, `chaos:static`, `test:build`, Playwright smoke, `.next/cache` cached by lockfile and source hash. `paths-ignore` for docs and `concurrency` cancel-in-progress, as today.
2. **Asset guard** in the same job: fail on any new `public/` file over 1 MB, with a baseline list for the 35 existing large files (a ratchet, like `chaos:static`), and print the total.
3. **Secret scan**: gitleaks action with the existing `.gitleaks.toml`.
4. **Previews**: keep Vercel PR previews, but point the Preview scope at a separate non-production Supabase project and a Resend test key. This is the one env change that needs your approval.
5. **Migrations before the app**: a `deploy.yml` on push to `main` that runs `supabase db push` (dry run first) against production, then promotes the Vercel production build only if migrations succeed. Mechanism: turn off Vercel's auto-assign of production domains, let Vercel build the commit, Actions waits for it, migrates, smoke-tests the deployment URL, then `vercel promote`. The old version keeps serving until promotion, which is the health gate. This replaces the Supabase GitHub integration for production and needs your approval.
6. **Rollback-note rule**: CI fails a PR that adds a migration without a `-- Rollback:` comment block.
7. **Health endpoint**: public `GET /api/health` returning build SHA and a cheap Supabase ping, no secrets.
8. **Post-deploy smoke**: `/`, one service page, `/home-care`, `/api/health`, run against the promoted URL through the vercel.app alias (Cloudflare challenges server-side fetches of www); failure posts to the existing Telegram alert channel and opens a GitHub issue.
9. **Rollback** documented in the README: `vercel rollback` (or promote the previous deployment) for the app; a hand-written down migration per the rollback note for the database, since Supabase has no automatic down migrations.
10. **Branch protection**: require `ci` and `migrations-replay` checks on `main`.
11. **Uptime**: Better Stack free tier (3-minute checks, email and Telegram-capable) on `/` and `/api/health`; needs you to create the account.
12. **E2E (Phase 4)**: on PR, run against the preview through `vercel curl`/bypass; nightly against production on read-only safe paths plus a dedicated test homeowner.

## 6. Token efficiency

**Reused from SpecNook**
- Codemap-first navigation (`docs/codemap/CONTEXT.md`, `query-map --trace/--impact`): already ported to this repo; used by the audit agents.
- The admin report split `build` (pure aggregation) → `render` → `send`, with `?dryRun=1` (`specnook/src/lib/admin-report.ts`): the template for the Phase 5 report.
- `cron-auth.ts` constant-time cron secret check and `distributed-lock.ts` / claim-once-per-period: prevents double runs and double sends.
- `email-kit.ts` block-built HTML email over a plain Resend `fetch`.
- AGENTS.md "read this file when" table for progressive disclosure.
- The chaos-monkey skill (`~/.claude/skills/chaos-monkey`) is shared already; this repo has its own `chaos/` baseline.

**SpecNook has no LLM-calling code**, so these are new here:
- Every number computed in SQL/TypeScript; the model receives only a ~1.5 KB aggregated JSON.
- Cheapest capable model (Claude Haiku 5.5), fixed instructions in a cached system prompt, JSON output with a schema, `max_tokens` 800.
- Skip the call when no headline metric moved more than a set threshold since the last report (hash plus deltas stored in a `reports` row); the email then says "no meaningful change" from a template.
- Deterministic fallback: if the API fails, send the numbers without the narrative.

**Estimated tokens per report run**: about 900 cached system tokens, 600 to 800 fresh input tokens, up to 800 output tokens, so roughly 2,500 tokens per run and under 60,000 a year at 24 runs.

**This audit's own cost**: four parallel read-only search agents used about 350,000 tokens between them, mostly the checklist mapping (132,000). Phases 2 to 5 will reuse this doc instead of re-mapping.

**Worth porting back to SpecNook**
- SpecNook's `docs/codemap/CONTEXT.md` points to `scripts/check-freshness.mjs`, which does not exist (the real path is `scripts/codemap/`).
- SpecNook's `AGENTS.md` says `CLAUDE.md` is a symlink to it; it is a separate, drifted file.
- The LLM report helper built in Phase 5 (aggregate, skip-if-unchanged, cached prompt, capped JSON) can be lifted as-is.
- This repo's `CLAUDE.md` should gain the codemap section and a read-it-when table, and shed its long command list into a reference file (Phase 2 PR).

## 7. Decisions needed before Phase 2

1. **Partner shop promo.** It does not exist. Should Phase 3 include building it, and what are the rules? Shop source via `?shop=` and code, what fields make a "full profile", whether the $100 goes to the shop or the homeowner, and where partner logos come from.
2. **Preview database.** Recommended: a separate free-tier Supabase project for previews and CI, plus a Resend test key, set on the Vercel Preview scope. Alternative: Supabase Branching, which bills compute per open PR.
3. **Production migrations and promotion.** Approve moving production migrations from the Supabase GitHub integration into Actions, and turning off Vercel's auto-assign of production domains so Actions promotes after migrations and smoke pass.
4. **Node 22** everywhere (matches production).
5. **Local gate.** Keep pre-push as is, or trim it to typecheck and changed-file lint now that CI repeats the rest for free.
6. **Analytics consent.** PostHog with GPC opt-out, all inputs masked, no autocapture of form values, and no banner (matching today's GA behavior); or add a real consent banner, which also fixes Clarity and Meta ignoring consent.
7. **Nightly production E2E.** It will create one dedicated test homeowner and receive real verification email at a test inbox you own. Which address?
8. **Report copy destination.** Your Phase 5 instruction was cut off at "save a copy to".
9. **Uptime account.** Better Stack free tier; you create the account, I configure it through its API.

## 8. Decisions (Alex, 2026-10-31)

1. Partner shop promo: build it in Phase 3 as a complete, releasable feature.
2. Previews: a separate free Supabase project (org "La Vaca Staging", project `wrffvnmtmtgfrcqvcbia`; the main org is on Pro, where a third project costs compute) and an email guard.
3. Production migrations move into GitHub Actions; the app is promoted only after migrations and a smoke test pass.
4. Node 22 everywhere, with a vulnerability audit and regression tests.
5. Trim the pre-push hook to fast checks; CI runs the build and smoke.
6. PostHog honors Global Privacy Control; no consent banner.
7. Nightly production E2E test inbox: Alex's test inbox (GitHub secret `E2E_TEST_INBOX`).
8. Report copy: `docs/reports/YYYY-MM-DD.md`; log tokens per run.
9. Better Stack free account for uptime.

## 9. Found and fixed during Phase 2

- **Storage policies let anyone with the public anon key delete or upload portfolio images and read private warranty photos.** Proven on a staging copy, fixed in production first (Alex approved), recorded in PR #122. The warranty bucket held no objects, so no photo was exposed.
- **Warranty photo links could never load** (private bucket, public URLs) and the warranty email interpolated form text unescaped. Fixed in PR #123; the edge function was deployed before the merge.
- **Production schema drift**: 26 tables, 44 columns, 8 functions, 73 policies and 4 buckets existed only in production. Captured as the idempotent `20261031000000_production_schema_baseline.sql`.
- **Production is behind the repo on one foreign key**: `fk_projects_featured_image` lacks `ON DELETE SET NULL`, so deleting a featured project image fails in production. Not yet fixed; it needs its own migration.
- **svix was used but never declared**; the patched `resend` dropped it. Now a direct dependency with a signature spec.
- **The `hero-secondary` experiment runs with one variant**, so it can never conclude (see `docs/engagement-and-experiments.md`).
