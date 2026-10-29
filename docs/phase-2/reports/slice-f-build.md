# Slice F build report - OpenAI removal, article routes, SEO feedback

Builder: Opus (builder slice F).
Planner: Fable.
Branch `phase2/slice-f`, cut from `1982e0a` (Phase 2 slice 0).
Nothing here is marked done by the builder; the reviewer decides each AC.

## Evidence per acceptance criterion

All spec names below are in `tests/articles-ingest.spec.ts` unless another file is named.
"Live" means the run against the local Supabase rig; it was run twice, against `next dev` (port 3112, later 3122) and against a production build (`npm run build && npm run start`, port 3113) with `E2E_ISR=1`.
Only the production build caches pages, so only that run proves "on the next request" for ART3, ART4, ART5 and ART9; its ISR control test shows a write that skips revalidation stays invisible on the cached `/blog`, so a pass there cannot be an uncached page passing by accident.

### RM - OpenAI removal

| AC | Evidence | Result |
| --- | --- | --- |
| RM1 | `RM1: openai is gone from package.json and the lockfile`; `RM1: no code under src mentions OpenAI except comments explaining the removal`; `tests/seo-draft-guardrails.spec.ts` `RM1: the OpenAI prompt builders are gone; only the validator remains`. | pass (stub and live) |
| RM2 | `RM2: the draft route, seo-maintain and its cron are deleted; maintained_articles stays`; `tests/seo-suggestions-ui.spec.ts` `the supporting API routes exist, and the OpenAI draft route does not (RM2)`. | pass |
| RM3 | `tests/seo-suggestions-ui.spec.ts`: `RM3: "Draft with AI" is replaced by "Draft with Claude Code"`, `RM3: the commands for a new action create, then publish, with the action id`, `RM3: a refresh patches the target post and a consolidate patches the primary`. Rendered: live `RM6 + FB3` clicks the button on `/vaca-mgmt?tab=seo` and asserts the panel shows `create --action <id>`. | pass |
| RM4 | `tests/seo-suggestions-ui.spec.ts` rewritten to the new behaviour; 7 of 7 pass in the stub run. | pass |
| RM5 | `RM5: the edge functions, the generator and the editor AI buttons are gone`; `RM5: OPENAI_API_KEY is listed for deletion in the follow-ups` (`docs/phase-2/follow-ups.md`). | pass |
| RM6 | Live `RM6 + FB3: Claude drafts a new action, the admin stages it, and publish marks it applied` (Stage links the post Claude made, no duplicate row) and `RM6: a Claude refresh draft is applied by the admin Apply, and by a publish with action_id` (live post unchanged until applied, revision snapshot written, `applied_by` recorded). | pass (dev and production build) |

### ART - article routes and CLI

| AC | Evidence | Result |
| --- | --- | --- |
| ART1 | Stub run: `over HTTP, against a server with no token configured` sends a bearer token to all five routes and gets 404 from each (the stub server has no `PROJECT_INGEST_TOKEN`). Pure: `the shared token check reports disabled for unset, blank and short tokens`; source: `every article route is self-guarded by authorizeArticles and listed public in middleware`. | pass |
| ART2 | Live `ART2: create returns the contract and an unpublished Claude draft the admin can preview`: exact key set `{ id, slug, adminUrl, previewUrl }`, row `published = false, source = 'claude'`, public page 404, signed-in admin sees the H1 and the FAQ on `/blog/preview/<slug>`, and `adminUrl` opens the editor on that post. | pass |
| ART3 | Live `ART3: patch changes fields, keeps published, and a live post shows the edit on the next request`. | pass (production build proves the revalidation) |
| ART4 | Live `ART4: publish sets published and published_at; /blog, the post and sitemap.xml show it on the next request`; the test warms the three cached copies first. | pass (production build) |
| ART5 | Live `ART5: unpublish removes it from /blog, its page and sitemap.xml on the next request`. | pass (production build) |
| ART6 | Live `ART6: a slug collision gets a numeric suffix; a bad body is a 400 with field errors` (`-2`, `-3`, 400 with `issues` paths `title`, `slug`, `content`, 409 on a patch slug clash, 401 without a token). Pure: `ART6: the create schema names each bad field`. | pass |
| ART7 | Live `ART7: the 31st call in a minute from one IP gets 429` (30 times 401, then 429). The first live run also hit 429 on the suite itself, which is how the per-test bucket reset in `beforeEach` came about. | pass |
| ART8 | Live `ART8: the CLI creates, patches, publishes, unpublishes and reads feedback end to end` runs `scripts/ingest-article.mjs` as a subprocess. Manual: the same five commands were run by hand against the rig before the spec existed (create printed id, slug, preview and admin links; a second create got `-2`; publish printed the URL; `feedback --summary` printed the window). `docs/articles-ingest.md` has the worked example. | pass |
| ART9 | Live `ART9: the admin list toggle, the editor save and the publish cron revalidate at once` (list Publish and Unpublish, editor save through the `?post=` deep link, publish cron) and `ART9: the rollback cron revalidates the post it reverts` (seeded refresh with a 50 percent baseline CTR and 1 percent now; the reverted body shows at once). Each browser write waits for the `/api/admin/revalidate` 200 before fetching `/blog`. | pass (production build) |
| ART10 | Live `ART10: the FAQ renders as a section and FAQPage JSON-LD; datePublished is published_at; no FAQ, no FAQPage`. Pure: `ART10: FAQPage JSON-LD from a FAQ, none without one, and script-safe`. Screenshots desktop and Pixel 5 checked by eye. | pass |

### FB - SEO feedback

| AC | Evidence | Result |
| --- | --- | --- |
| FB1 | Pure `FB1/FB2: pages from fixture rows, decaying on a negative 14-day trend, joined to posts` (exact numbers: 400 impressions, 11 clicks, CTR 0.0275, impression-weighted position 7, trend -7). Live `FB1/FB2: the feedback route returns the shape from seo_metrics, decaying pages joined to their posts` with seeded `seo_metrics` rows. | pass |
| FB2 | Same two tests: `/blog/<slug>` rows carry `post { id, slug, title, published_at }`, other paths carry none. | pass |
| FB3 | Pure `FB3: open actions are listed with their targets`; live `RM6 + FB3` shows the action in `open_actions`, publishes with `action_id`, and it is gone from the next call with `status = completed`, `published_post_id` set. | pass |
| FB4 | Pure `FB4: at most 200 pages; days is 7 to 90; the route caps every read` (250 fixture paths give 200 pages, `pages_total` 250); live `?days=91` is 400. `npm run chaos:static`: total 0, no new violations. | pass |

### Shared contract items

- `src/lib/articles/`: `schemas.ts`, `auth.ts` (`authorizeArticles`, bucket `articles:<ip>`, 30 a minute, 404 when the token is unset), `writer.ts` (service-key writer), `revalidate.ts` (`revalidateArticlePages`), `actions.ts` (content-action link and the shared `applyActionDraft`), `feedback.ts`, `publishGuard.ts` (stub), `faqJsonLd.ts`, `cliCommand.ts`, `http.ts`.
- `/blog` added to `REVALIDATE_PREFIXES`; `/sitemap.xml` allowed as an exact path; `blogPagePaths()` is the one path list for the browser editors and the server writers.
- `checkPublishable` is a documented stub returning `{ ok: true, reasons: [] }`, marked `PUBLISH_GUARD_IS_STUB = true` and pinned by `the publish guard is still the documented slice F stub, and the publish route calls it`; slice G replaces the body and flips that test.
- Middleware lists `/api/articles/` as public with a comment, the same style as `/api/projects/ingest`.

## How `action_id` works (a design choice the contract left open)

- `new` action: create with `action_id` makes the draft post and writes it onto the action (`drafted`, `draft_meta.post_id`, fact-lock `validation`); Stage then links that post instead of inserting a second one.
- `refresh` or `consolidate`: PATCH the action's live post with `action_id`; the post is not changed, the merged article becomes the action's draft. Apply in the admin, or a publish with the same `action_id`, applies it through one shared function (`applyActionDraft`: revision snapshot, baseline CTR, rewrite, completed), so the 14-day rollback guard keeps working for Claude's refreshes.
- Publish with `action_id` marks the action `completed` with `published_post_id` (FB3).
- The SEO dashboard gained an "Apply to live post" button; the apply route existed with no UI before.

## Things found and fixed on the way

- **`/blog/[slug]` read `searchParams` in `generateMetadata`** (the `?preview=true` mode). Corrected in fix round 1 after the review reproduced it on `1982e0a`:
  the 500 ("Page changed from static to dynamic at runtime") happens only when the BUILD sees zero published posts, as on the local rig, because only then is the route compiled as static (`●`).
  A build that has published posts, like every production build, compiles `/blog/[slug]` as dynamic (`ƒ`), and a post published after the deploy answered 200, rendered per request with `Cache-Control: private, no-cache, no-store`.
  So production never answered 500; the original claim that every post published after a deploy 500s was wrong.
  The fix (dropping the `searchParams` read, the preview mode and its dead banner; drafts keep `/blog/preview/[slug]`) stays: it makes the page the ISR page its `revalidate = 300` always intended, which ART4 and ART5 rely on, and the production effect is that post pages change from uncached per-request rendering to cached copies dropped by revalidation.
- The list's eye button and the editor's Preview opened `/blog/<slug>` for drafts, a 404; they now open the preview route for drafts.
- Publishing from the list, the editor and the cron now stamps `published_at` (the editor only on a draft-to-live save).
- The blog list read (`/blog`) and the admin list read had no row limit; now 200 and 500.
- The publish cron's read had no limit; now 50 per run, oldest due first.
- `supabaseRestPagedCapped` added so the feedback route's caller-chosen window can never page through the whole `seo_metrics` table.
- `src/lib/seo/maintainedArticles.ts`, `buildFactLockText` and `buildDraftInstruction` were used only by the removed OpenAI code and are deleted; `maintained_articles` the table stays.
- `supabase/functions/_shared/internalLinks.ts` was used only by the deleted functions and is deleted.

## Local-only migration

The local `blog_posts` was the replay stub (id, published and the Phase 2 columns), so nothing could be written to it.
`supabase/migrations/20261030000001_blog_posts_local_columns.sql` adds the dashboard-created columns (title, slug, content, category, author, excerpt, featured_image, meta_*, created_at, updated_at) with `ADD COLUMN IF NOT EXISTS`, guarded on the table existing, and no constraints, so on production it is a no-op.
It was applied to the shared rig with `psql -f` (not `db reset`), then `NOTIFY pgrst, 'reload schema'`.
Note `docs/local-rig.md` says dashboard-created objects belong in `00000000000001_preview_baseline_fixups.sql`; the brief asked for this dated file instead, and editing the fixups file would not reach the shared database without a reset.
The reviewer or planner may prefer to move these lines into the fixups file at merge.

## Commands run and results

| Command | Result |
| --- | --- |
| `git reset --hard 1982e0a && git checkout -b phase2/slice-f` | on `phase2/slice-f` |
| `npm ci`, `npm uninstall openai` | lockfile updated, 1 package removed |
| `npm run typecheck` | clean |
| `npm run lint` | clean (0 problems) |
| `npm run chaos:static` | total 0, baselined 0, NEW 0, "no new violations" |
| `npm run build` (rig env) | exit 0; `/blog` ISR 5m, `/blog/[slug]` SSG, `/sitemap.xml` static, five `/api/articles/*` dynamic |
| `TEST_URL=http://localhost:3112 E2E_LIVE_BACKEND=1 playwright test tests/articles-ingest.spec.ts tests/seo-suggestions-ui.spec.ts --project=chromium` (`next dev`) | 34 passed, 2 skipped (ART1 HTTP is stub-only; ISR control is production-only) |
| `TEST_URL=http://localhost:3113 E2E_LIVE_BACKEND=1 E2E_ISR=1 playwright test tests/articles-ingest.spec.ts --project=chromium` (production build) | 28 passed, 1 skipped (ART1 HTTP); first attempt failed on the rig-only `/blog/[slug]` 500 above (a build with zero published posts), green after the fix and a rebuild |
| Same live run on `next dev` port 3122 after the final UI fixes | 34 passed, 2 skipped |
| `npm run test:e2e -- tests/articles-ingest.spec.ts tests/seo-suggestions-ui.spec.ts tests/seo-draft-guardrails.spec.ts tests/seo-stage.spec.ts tests/seo-report.spec.ts tests/seo-scoring.spec.ts tests/seo-rollback.spec.ts tests/seo-cron.spec.ts tests/privacy-policy.spec.ts tests/lead-intake.spec.ts tests/admin-dashboard.spec.ts tests/admin-nav-simplified.spec.ts tests/project-drafts.spec.ts tests/flows.spec.ts --project=chromium` (`.env.local` moved aside) | exit 0, 178 passed, 24 skipped (live-backend specs) |
| Row check after every live run: `select count(*)` of `slice-f-%` rows in `blog_posts`, `content_actions`, `seo_metrics`, plus `blog_post_revisions` and `articles:%` rate-limit rows | 0 each |

The worktree's `.env.local` holds rig-only values; the copied production files were kept as `.env.local.prod-copy` and `.env.development.local.prod-copy` and never loaded, because they point at the production Supabase project and a live Telegram bot.
Port 3112 was later taken by another worktree's dev server, so the last dev runs used 3122; every run against 3112 happened while this worktree's server held it (the article routes exist only here).

## Environment variables

| Where | Variable | Action |
| --- | --- | --- |
| Vercel (Production, Preview) | `OPENAI_API_KEY` | delete after deploy |
| Supabase function secrets | `OPENAI_API_KEY` | delete after the three functions are deleted |
| Vercel (Production) | `PROJECT_INGEST_TOKEN` | set if not already (32+ characters); the article routes share it |
| Supabase project | edge functions `generate-blog-post`, `enhance-blog-content`, `generate-blog-image` (and `generate-blog-seo` if it was ever deployed) | `supabase functions delete <name>` |

No new variable is added.
All of these are in `docs/phase-2/follow-ups.md`.

## Left out, and why

- Telegram on publish and on hold (TG) and the real publish guard (PG): slice G; the publish route marks both places with a comment, and the CLI and routes already handle a 409 hold.
- The privacy policy still says OpenAI helps produce site content (section 5.1); it is a legal disclosure, so it is listed for Alex in the follow-ups rather than edited.
  The RM1 spec therefore checks code files and states that exclusion.
- The admin editor and list still write `blog_posts` from the browser with the session; moving them onto the server writer is PG4's natural place (slice G), and they now revalidate after their writes as ART9 asks.
- The `/blog` list still orders by `created_at`; the publish cron keeps rewriting `created_at` as before so the list order did not change.
- The panel's suggested prompt says "Use the articles skill"; that skill ships in slice G (SK1).
- `docs/codemap/*` still names the removed files; it is generated, so it was not edited by hand.

## Fix round 1

Review: `docs/phase-2/reports/slice-f-review.md` (REJECT), merged fast-forward at `6578f6e` before the fixes.
Env: the coordinator's `env.rig` copied to both `.env.local` and `.env.development.local` (local Supabase only).

### 1. Fact-lock bypass (must fix)

- `POST /api/articles/ingest/<id>/publish` now runs `validateDraft` on the content that would go live, built with the same `draftMarkdownFor` the action drafts use, and for a refresh or consolidate that is the post WITH the action draft applied.
  A failure answers 422 `{ published: false, error: 'Draft failed validation - fix before publishing.', issues }`, the same status and wording Stage and Apply use, and writes nothing: no revision, no rewrite, the action stays `drafted`.
- `applyActionDraft` (shared by Apply and the publish) also refuses an action whose recorded `draft_meta.validation.ok` is false with a 422, so neither caller can skip it.
- The CLI prints the issues and exits 2 on a 422, like a hold; `docs/articles-ingest.md` documents it.
- Spec `Fix round 1: a refresh draft the fact-lock rejected is refused on publish (422), the live post untouched` reproduces the reviewer's case (a refresh draft with `(973) 555-0199` and no internal links, then publish with `action_id`): 422, both issues named, the live page still shows the original and not the number, action still `drafted` with no `published_post_id`, zero revisions; a plain publish of a post with no links is 422 too and stays unpublished.

### 2. `review_hold` (SEC4, as clarified by the planner)

- While `PUBLISH_GUARD_IS_STUB` is true, a publish of a post whose `review_hold` is set answers 409 `{ published: false, hold: <stored reasons>, adminUrl }` and changes nothing, because the stub cannot have re-checked the content.
  When slice G makes the guard real, a guard pass on the current content clears the hold through the existing `publishArticle` path; the admin's "Publish anyway" is slice G's other way out.
- No route takes `review_hold` as input (strict schemas).
- Spec `Fix round 1 (SEC4): a held post is not published or cleared while the guard is the stub; no route takes review_hold`: 409 with the stored reasons, row still unpublished with the same hold, public page 404, and `review_hold` in a create, patch or publish body is 400.
- The review's merge condition (slice F must not reach production alone) is the planner's to carry; with this change a held post cannot go live through slice F, but an un-held post still publishes with only the fact-lock checked until slice G lands.

### Advisory taken from the review

- A publish naming an action that this same post already completed (the admin staged Claude's draft, then Claude ran the dashboard's own publish line) is now a no-op on the action instead of a 409; spec `Fix round 1: a publish naming an action this post already completed (staged by the admin) is a no-op on the action`.
  It runs before the other Stage calls in the file because Stage allows three completed actions a week.
- The dashboard link on a completed action now reads "Linked post: preview" (it said "Staged as draft" even for a post Claude published).
- Not taken: the `decaying` anchoring and noise floor (advisory, changes FB1's literal rule; left for slice G, which reads the flag), and the `/blog` list date mismatch (slice G, as the review says).

### 3. Phone UI at iPhone 13 (390 by 844)

- SEO tab: on phones the type badge, the text and the buttons stack; the title wraps instead of truncating; the status pill and link sit on one centred line; the header wraps so "Refresh" is not cut off; the command block takes the full width with Copy under it.
- Blog list: below the `md` breakpoint each post is a card (title, status, "From Claude Code", category, author and date, then View, Edit, Publish or Unpublish, Delete); the table stays for `md` and up. The badge has `whitespace-nowrap`.
- Measured on the production build with the admin signed in (chromium, iPhone 13 descriptor, CSP bypassed for the rig): button and pill do not overlap, the title is not clipped, the "From Claude Code" badge is 26 px tall (one line), Publish and Edit are inside 0 to 390 px, and `scrollWidth` is 390 on both pages.
- Screenshots: `docs/phase-2/reports/shots/slice-f-fix-seo-tab-iphone13.png`, `slice-f-fix-seo-panel-iphone13.png`, `slice-f-fix-blog-list-iphone13.png`.
  A first full-page capture of the list showed the admin's mobile drawer half open; the viewport capture after the page settled shows it closed, so that was a capture artifact, not a defect.

### 4. Build report correction

The `/blog/[slug]` paragraph under "Things found and fixed" is rewritten to the review's conditional finding: a 500 only when the build sees zero published posts (the rig), never in production; the fix is kept and its production effect stated.

### 5. `publish-scheduled-articles`

- The Vercel cron `/api/cron/publish` (daily 11:00 UTC) does the same job: it publishes due scheduled posts, and also stamps `published_at`, clears the schedule and revalidates. Nothing in the repo called the function; a pg_cron or dashboard schedule may.
- So the function is deleted from the repo, and `docs/phase-2/follow-ups.md` now says `supabase functions delete publish-scheduled-articles` plus removing any schedule that calls it.
  It also sent a "Blog Post Published" email with social copy; that goes with it (slice G's Telegram publish message is the notification), and the follow-up notes that posts scheduled for other times wait for the 11:00 UTC run unless the cron runs more often.
- `RM5` spec now pins the folder gone and the follow-up line present.
- `docs/local-rig.md`: dashboard-created objects go in a NEW dated, guarded, no-op-on-production migration (not the already-applied fixups file), with the `psql -f` and `NOTIFY pgrst` steps for the shared rig; the stale "`blog_posts.title` is missing" line is replaced; and caching checks need the production build.

### Commands and results (fix round 1)

| Command | Result |
| --- | --- |
| `git merge --ff-only 6578f6e` | fast-forward |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, no problems |
| `npm run chaos:static` | total 0, baselined 0, NEW 0, "no new violations" |
| `npm run build` (rig env) | exit 0; `/blog` ISR 5m, `/blog/[slug]` SSG, `/sitemap.xml` static |
| `TEST_URL=http://localhost:3133 E2E_LIVE_BACKEND=1 E2E_ISR=1 playwright test tests/articles-ingest.spec.ts tests/seo-suggestions-ui.spec.ts --project=chromium` (production build, port 3133 because 3112 and 3113 were held by other worktrees) | 38 passed, 1 skipped (ART1 HTTP, stub-only) |
| `npm run test:e2e -- <the same 14 spec files as before> --project=chromium` (`.env.local` moved aside) | exit 0, 178 passed, 27 skipped |
| iPhone 13 screenshot script (production build, rows prefixed `slice-f-fix-`, removed after) | measurements above; 0 leftover rows |
