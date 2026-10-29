# Phase 2 - acceptance criteria and contracts

Planner: Fable. Developer: Opus (one worktree per slice). Reviewer: a second agent per slice.
Nothing is marked done by the agent that built it.
Decisions: `docs/decisions/004-grill-round-1-phase-2.md` (Q7 to Q13) and `005-prices-plus-100-and-ab-testing.md` (Q14 to Q18), all decided. Audit: `docs/phase-2/00-audit.md`.
Branch: cut from `main` after PR #104 merges (Q12). Base SHA recorded in the slice reports.
Each AC is verified by a Playwright spec that names it in its title, or by a written manual check in the slice report where a browser cannot reach it.

Prefixes: `CAT` catalog and admin editor, `ART` article routes, `FB` SEO feedback, `PG` publish guard, `TG` Telegram unpublish, `RM` OpenAI removal, `SK` Claude Code skill, `EX` experiments, `SEC`, `SEO`.

## Decisions taken by the planner from the audit (not re-opened by builders)

- The home-services pages render per request (language cookie), so "hourly ISR" is replaced by a tagged server cache: `getCatalog()` wraps the table read in `unstable_cache` with tag `home-services` and a one-hour revalidate, and every admin save calls `revalidateTag('home-services')` plus `revalidatePath` on the two pages and the sitemap.
- Price and legal claims have no detector today, so slice G builds one; it is the Q10 gate, and it runs on every publish path, not only Claude's.
- Telegram has no buttons, so one-tap unpublish is a signed link to a page with one button that POSTs; a GET never changes anything (crew-confirm precedent).
- The blog keeps its `published` boolean. Three guarded columns are added: `published_at`, `faq` (jsonb), `review_hold` (jsonb, null when clear), `source` (`admin` or `claude`).
- The same bearer token guards projects and articles (`PROJECT_INGEST_TOKEN`); the doc names it `INGEST_TOKEN` in prose and says it is the same variable.
- `stage` and `apply` for `content_actions` stay; Claude becomes their producer through the article routes (a publish may carry `action_id`, which marks the action applied).
- Q13 (decided: remove): the three edge functions, the editor's Generate, Enhance and image buttons, the phantom `generate-blog-seo` call and `BlogPostGenerator.tsx` go in slice F.

## Shared contracts (fixed in slice 0 before builders start)

### Migration `supabase/migrations/20261030000000_phase_2.sql`

- `home_services` table: `slug text primary key`, `sort int`, `active bool default true`, `trade text`, `icon text`, `image text`, `starting_price_cents int`, `price_display_en/es text`, `price_unit_en/es text`, `price_note_en/es text`, `minimum_cents int`, `name_en/es text`, `description_en/es text`, `included_en/es jsonb` (array of strings), `raises_en/es jsonb`, `seo_title_en/es text`, `seo_description_en/es text`, `seo_keywords jsonb`, `faq jsonb`, `updated_at timestamptz`, `updated_by uuid`.
  RLS on, no policies (server reads only).
  Seed rows generated from `catalog.ts` by `scripts/seed-home-services.ts` and pasted into the migration, so seed equals code on day one; a unit test asserts the seed matches the catalog constants that remain in code.
- `blog_posts`: add `published_at timestamptz`, `faq jsonb`, `review_hold jsonb`, `source text default 'admin'`, each guarded with `if not exists` the way `20261029000000_home_services.sql` guards `projects`, because the table has no migration of its own.
- `blog_posts` RLS: read the production policies first (`docs/local-rig.md` has the pattern) and add nothing unless a policy is missing for the public read; the ingest writes with the service key.

### Catalog module split

- `src/lib/home-services/catalog.ts` keeps: types, `SERVICE_SLUGS`, `TRADE_LABEL`, `COUNTIES`, `TIMING_OPTIONS`, `questions` per slug, `t()`, `toLang()`, `describeAnswers()`.
- New `src/lib/home-services/catalogData.ts` (server only): `getCatalog(): Promise<HomeService[]>` (cached, tag `home-services`, active rows ordered by `sort`, `limit 50`), `getServiceData(slug)`, `invalidateCatalog()`.
- Client components (`ServiceCatalog`, `PriceSheet`, `RequestFlow`) receive the service data as props from the page; they stop importing the catalog array.
- Server code that needs names (`requests.ts`, `requestsAdmin.ts`, offers, admin routes) reads through `getCatalog()`; `isServiceSlug` stays code-based on `SERVICE_SLUGS` (the slug set is fixed; the admin edits content, not the set).

### Article routes (all `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`, self-guarded, listed public in middleware)

- `POST /api/articles/ingest` body: `{ title, slug?, content, category, excerpt?, meta_title?, meta_description?, meta_keywords?, featured_image?, faq?: [{ q, a }], action_id? }`. Creates `published = false`, `source = 'claude'`. Returns `{ id, slug, adminUrl, previewUrl }`.
- `PATCH /api/articles/ingest/[id]`: same fields, partial. Revalidates when the post is published.
- `POST /api/articles/ingest/[id]/publish`: runs the publish guard (PG). On pass: `published = true`, `published_at = now()`, `review_hold = null`, revalidate, Telegram (TG), marks `action_id` applied when given, returns `{ published: true, url }`. On hold: `published` unchanged, `review_hold = { reasons: [...], checked_at }`, returns 409 `{ published: false, hold: reasons, adminUrl }`.
- `POST /api/articles/ingest/[id]/unpublish`: `published = false`, revalidate, returns `{ published: false }`.
- `GET /api/articles/seo-feedback?days=28`: `{ window, pages: [{ path, impressions, clicks, ctr, position, trend_delta, decaying: bool, post?: { id, slug, title, published_at } }], refresh_candidates, new_article_candidates, open_actions: [{ id, kind, target, rationale }] }`, built from `buildSeoReport` and `proposeContentActions`, read with the service key, capped at 200 pages.
- Auth: `ingestAuth.ts` shared as is; `authorizeArticles` copies `authorizeIngest` with its own rate-limit key (30 a minute per IP) and the same 404-when-unset behaviour.
- Validation: zod schemas in `src/lib/articles/schemas.ts`; bodies through `readJsonBody` (256 KB); slug derived from title when absent, unique with a numeric suffix.
- Revalidation: `revalidateArticlePages(slug)` hits `/blog`, `/blog/<slug>`, `/sitemap.xml`; `/blog` is added to `REVALIDATE_PREFIXES`; `BlogPostList`, `BlogPostEditor`, the publish cron and the rollback cron call it after their writes.
- CLI `scripts/ingest-article.mjs` mirrors `ingest-project.mjs` (create, patch, publish, unpublish, feedback). Doc `docs/articles-ingest.md` mirrors `docs/projects-ingest.md`.

### Publish guard `src/lib/articles/publishGuard.ts` (pure, unit-tested)

`checkPublishable(post, facts): { ok, reasons[] }` runs, in order:

1. `validateDraft` (existing: three internal links, locked phone, locked HIC).
2. Price claims: any currency amount (`$`, `USD`, `dollars`), `per sq ft`, `per square foot`, `per linear foot`, `starting at`, `from $`, `costs`, `cost of`, `price(s)`, `estimate(s) of`, `quote(s) of` followed within 40 characters by a number, and any percentage next to `off`, `save`, `discount`, `cheaper`.
   An amount that equals a catalog `priceDisplay` for the named service is allowed (it is the published price); everything else is a reason.
3. Legal claims: `permit`, `code compliant`, `to code`, `up to code`, `building code`, `warranty`, `guarantee`, `guaranteed`, `insured`, `bonded`, `liability`, `lawsuit`, `legal`, `legally`, `ADA`, `OSHA`, `lead-safe`, `EPA`, `asbestos`, `mold remediation`, unless the sentence is one of the locked fact sentences in `content_facts` (new keys `claim_license`, `claim_insurance` seeded with the exact wording Alex approves; until then only the HIC sentence passes).
4. Shape: the first paragraph is 25 to 70 words and contains no link (answer-first); at least one H2; a `faq` with 2 to 6 items when the category is a question-style topic (title starts with How, What, Why, When, Should, Can, Does, Is).

Reasons are plain sentences naming the matched text, for example `Price claim: "from $9,000" in paragraph 4`.
The guard runs in the publish route for every source, and the admin editor shows `review_hold` reasons on the post with a "Publish anyway" button that writes `review_hold = null` with the admin's user id, so Alex can override, Claude cannot.

### Telegram unpublish link

- Token: `base64url(postId + "." + publishedAtUnix) + "." + HMAC-SHA256(that, INTERNAL_WEBHOOK_SECRET)`, verified with `timingSafeEqual`, valid 7 days, and only while `published_at` still equals the token's value (a republish invalidates old links).
- Page `GET /articles/unpublish/[token]`: shows title, slug and one button "Unpublish"; renders 410 for an expired or mismatched token; `noindex`; excluded from the bot filter the way `/offer/[token]` is.
- `POST` from that page: unpublishes, revalidates, replies "Unpublished" and sends a Telegram confirmation.
- The publish Telegram message: `New article published: <title> <url>` plus `Unpublish: <link>`; on hold: `Article held for review: <title> <adminUrl>` with the first three reasons.

### Admin "Services & Prices" editor

- Sidebar tab `home-services-catalog`, label "Services & Prices", registered in `AdminSidebar.tsx`, `AdminContent.tsx` and `tests/admin-nav-simplified.spec.ts`.
- List of seven rows (name, starting price, active); a row opens a form with every editable field in English and Spanish side by side, included and raises as line-per-item textareas, SEO title with a 60-character counter and description with 160.
- Save: `PATCH /api/admin/home-services/[slug]` (admin session; zod: price cents integer 1 to 10,000,000, names required in both languages, SEO title 1 to 60, SEO description 1 to 160, keywords up to 10). Writes `updated_at`, `updated_by`, calls `invalidateCatalog()` and `revalidatePath` on `/home-services`, `/home-services/<slug>`, `/sitemap.xml`.
- Toggle `active`: an inactive service disappears from the landing cards and sitemap and its page returns 404; existing requests keep rendering its name through the table regardless of `active`.

### Claude Code skill `.claude/skills/articles/SKILL.md` (ships in the repo)

Trigger: writing, refreshing or SEO-editing a La Vaca article.
Steps, each with a command: read `GET /api/articles/seo-feedback`; pick a target (an open action, a decaying page, or a new topic); draft in markdown with answer-first opening, H2 sections, one FAQ block, town and county names from `COUNTIES`, the service-area sentence from `content_facts`; run the grill-me checklist in `references/grill.md` (every factual sentence traced to a source or the fact table, plain-English pass at grade 8 or below, no price or legal claim unless it is a locked fact); create or patch through the CLI; publish through the CLI; on 409 hold, fix or leave it for Alex and say which.
`references/aeo-local-seo.md` holds the checklists; the skill stays under 120 lines.

### Experiments (slice H, decision 005)

- Migration (same file): `experiments` (`key text primary key`, `page text`, `element text`, `hypothesis text`, `variants jsonb` as `[{ key: 'A'|'B'|..., label, payload }]`, `control_key text`, `status text` in `draft|running|concluded|retired`, `primary_metric text` default `request_submitted`, `min_visitors int` default 200, `min_days int` default 14, `started_at`, `concluded_at`, `winner_key`, `decision jsonb`, `created_by text`), and `experiment_events` (`experiment_key`, `variant_key`, `visitor_id uuid`, `event text` in `view|click|request_started|request_submitted|quote_accepted|job_paid`, `value_cents int`, `created_at`), unique on (experiment_key, variant_key, visitor_id, event). RLS on, no policies.
- The two Phase 1 CTA buttons become experiments `hero-primary` and `hero-secondary` in a data migration; `cta_variants` and `cta_events` are read for history and no longer written. The admin CTA Tests tab becomes "Experiments".
- Assignment: `src/lib/experiments/assign.ts` reuses the `cta_v` seed and `fmix32(fnv1a(seed + ":" + experimentKey))` over the running variants, so a visitor's variant never changes while an experiment runs; a crawler (the bot filter's allow-list user agents) always gets the control; a `?exp=<key>:<variant>` preview works for signed-in admins only.
- Variant payloads are applied server-side by `withExperiment(page, element, lang)` in the page components; a variant for copy is a string per language, for section order an array of section ids, for an image a path under /public. Prices and anything under `priceDisplay`, `startingPriceCents`, `minimumCents` are not addressable (type-level: the payload schema has no price field, and a test asserts it).
- Funnel events: `view` on render, `click` on the element, `request_started` when the request flow opens, `request_submitted` from the request route (it reads the visitor cookie), `quote_accepted` and `job_paid` from the admin status changes on `home_service_requests` (the admin route emits them). Every event is recorded once per visitor per experiment and variant.
- Evaluator `src/lib/experiments/evaluate.ts` (pure, unit-tested): per variant, visitors and conversions on the primary metric; Beta(1,1) posteriors; Monte Carlo (10,000 draws, seeded) for `p_beat_control` and `expected_loss`; a winner needs `p_beat_control >= 0.95`, `expected_loss <= 0.005`, visitors per variant `>= min_visitors` and age `>= min_days`; a loser is retired at `p_beat_control <= 0.05` under the same sample guard; revenue per visitor is reported from `value_cents`.
- Cron `GET /api/cron/experiments-evaluate` (Monday 07:30 UTC, cron-secret guarded like the others): evaluates every running experiment, writes `decision`, and for a winner sets `status = 'pending_promotion'` with a Telegram message carrying a one-tap veto link (same signed-link pattern as the unpublish link); 24 hours later the next evaluator run promotes it (the winner's payload becomes the page default by writing it into the experiment's `control` and concluding) unless vetoed.
- Agent routes, same ingest token: `GET /api/experiments/report` (every experiment with its evaluation, funnel and revenue), `POST /api/experiments` (create a draft from a hypothesis and variants; refused when the page already has a running experiment), `POST /api/experiments/[key]/start`, `POST /api/experiments/[key]/conclude` (`winner_key` or `retire`), `GET /api/experiments/backlog` and `POST /api/experiments/backlog` (hypotheses with priority and source, seeded from decision 005).
- Skill `.claude/skills/experiments/SKILL.md`: weekly routine (read the report, act on concluded and pending items, pick the next backlog hypothesis for a page with no running experiment, write variants in both languages, start it, post the summary to Telegram), with the rules: one experiment per page, never prices, never the phone number or license, both languages always, hypothesis and expected effect written before starting. A `/schedule` routine runs it every Monday after the cron.
- First experiment, seeded by the migration as `draft`: `landing-hero` on `/home-services`, control = the one-stop hero copy shipping in decision 005, variant B = the previous "Pick a service. See the price. Send photos." hero.

## CAT - catalog in the database and the admin editor (slice E)

- CAT1 The landing page and each service page render names, prices, descriptions, included and raises lists and SEO copy from `home_services`, identical to the catalog constants on the seed (spec compares the rendered page to the seed row).
- CAT2 Editing a price in the admin and saving shows the new price on `/home-services` and the service page on the next request, and in the request flow's price line.
- CAT3 Editing the SEO title and description changes the page `<title>`, meta description and the JSON-LD service name on the next request.
- CAT4 Setting a service inactive removes its card and sitemap entry and its page returns 404; setting it active restores all three.
- CAT5 Validation rejects a zero price, an empty Spanish name and a 61-character SEO title with field-level messages; nothing is written.
- CAT6 The seed-equals-catalog unit test passes; `tests/home-services-landing.spec.ts` reads the expected prices from the seed, not from the catalog constants.
- CAT7 Client bundles for `/home-services` no longer contain the catalog array (grep the built chunk for a Spanish description string).
- CAT8 Only admins reach the editor and its route (signed-out gets the sign-in redirect; the route answers 401 without a session).

## RM - OpenAI removal (slice F)

- RM1 `openai` is gone from `package.json` and the lockfile; `grep -ri openai src` returns only comments explaining the removal, if any.
- RM2 `content-actions/draft` route, `seo-maintain` route and its `vercel.json` cron are deleted; `maintained_articles` stays.
- RM3 `SeoSuggestionsDashboard` replaces "Draft with AI" with "Draft with Claude Code", which shows the CLI command for the selected action.
- RM4 `tests/seo-suggestions-ui.spec.ts` is updated to the new behaviour and passes.
- RM5 The three edge functions, `BlogPostGenerator.tsx`, the Generate, Enhance and image buttons and the `generate-blog-seo` call are gone; `OPENAI_API_KEY` is listed in `follow-ups.md` for deletion from Vercel and Supabase secrets.
- RM6 `stage` and `apply` still work on a `draft_markdown` written by the article routes (spec stages and applies a Claude-sourced draft).

## ART - article routes and CLI (slice F)

- ART1 Token unset or shorter than 32 characters: every article route answers 404.
- ART2 Create returns `{ id, slug, adminUrl, previewUrl }`, the post exists unpublished with `source = 'claude'`, and `/blog/preview/<slug>` shows it to a signed-in admin.
- ART3 Patch changes fields, keeps `published` as it was, and revalidates when published.
- ART4 Publish on a passing post sets `published` and `published_at`, the post appears on `/blog`, `/blog/<slug>` and in `sitemap.xml` on the next request (no 300-second wait).
- ART5 Unpublish removes it from all three on the next request.
- ART6 Slug collision gets a numeric suffix; an invalid body gets a 400 with zod field errors.
- ART7 Rate limit: the 31st call in a minute from one IP gets 429.
- ART8 `scripts/ingest-article.mjs create|patch|publish|unpublish|feedback` works end to end against the local rig; `docs/articles-ingest.md` has the worked example.
- ART9 The admin editor, list, publish cron and rollback cron revalidate after their writes (spec: toggle published in the list and fetch `/blog` immediately).
- ART10 `faq` renders as a FAQ section and `FAQPage` JSON-LD on the post page; absent `faq` emits no `FAQPage`.

## FB - SEO feedback (slice F)

- FB1 `GET /api/articles/seo-feedback` returns the documented shape from fixture `seo_metrics` rows; pages with a negative 14-day trend have `decaying: true`.
- FB2 Each page row is joined to its blog post when the path is `/blog/<slug>`.
- FB3 Open `content_actions` are listed; a publish with `action_id` marks that action applied and it disappears from the next feedback call.
- FB4 The response is capped at 200 pages and the read is bounded (chaos CM-14 passes).

## PG - publish guard (slice G)

- PG1 Unit tests: each of the price patterns and each legal keyword produces a reason; a catalog price for the named service does not; a locked fact sentence does not; the answer-first and H2 checks fire on a bad shape.
- PG2 A Claude publish with a price claim returns 409 with the reasons, the post stays unpublished with `review_hold` set, and Telegram gets the "held for review" message.
- PG3 The admin editor shows the hold reasons and "Publish anyway" publishes and clears the hold with the admin's id.
- PG4 The guard also holds an admin publish from the editor and the list toggle (the editor shows the reasons inline; the list toggle shows a toast and opens the editor).
- PG5 A post with three internal links, the locked phone, no claims and a 40-word opening publishes.

## TG - Telegram unpublish (slice G)

- TG1 The publish message carries the signed link; opening it renders the one-button page; the button unpublishes and the page says so.
- TG2 An expired, tampered or already-used link renders 410 and changes nothing.
- TG3 A GET to the link never unpublishes (spec fetches it twice and the post stays published).
- TG4 Telegram not configured: publish still succeeds and the route reports `telegram: not_configured`.

## SK - Claude Code skill (slice G)

- SK1 The skill file exists at `.claude/skills/articles/SKILL.md` with the references and is under 120 lines.
- SK2 A dry run by the reviewer following the skill on the local rig produces a published article that passes PG with the CLI alone.
- SK3 The grill checklist names its sources: `content_facts` keys, `COUNTIES`, the service-area sentence, and the feedback endpoint.

## EX - experiments (slice H)

- EX1 The two Phase 1 CTA tests appear as experiments with their history; the hero buttons still render their running variants and record view and click once per visitor (the CT specs pass unchanged in behaviour).
- EX2 A visitor keeps the same variant across visits and pages; a bot user agent gets the control; an admin `?exp=` preview shows the named variant and records nothing.
- EX3 `request_submitted` is recorded for the visitor's variant when a request is sent; `quote_accepted` and `job_paid` are recorded when the admin changes the request status; each once per visitor.
- EX4 Evaluator unit tests: a clear winner at 300 visitors per arm passes; the same rates at 50 visitors return "not enough data" with a date; a loser retires; expected loss and revenue per visitor match hand-computed fixtures.
- EX5 The cron writes decisions, sends the Telegram with the veto link, and promotes a winner only after 24 hours and only when not vetoed (spec runs the cron twice with a fake clock).
- EX6 The report, create, start, conclude and backlog routes answer 404 without the token, 400 on a bad body, 409 when a page already has a running experiment, and reject any payload that names a price field.
- EX7 The admin Experiments tab lists running, pending and concluded experiments with funnel, probability and the decision; one tap retires or promotes with the admin's id.
- EX8 The reviewer runs the skill once on the local rig and gets a started experiment with a written hypothesis, both languages and a Telegram message.

## SEC

- SEC1 Every new route is either admin-session guarded by middleware (`/api/admin/*`) or self-guarded by the ingest token with rate limiting; none is both unlisted and unguarded (`chaos:static` CM-01, CM-08, CM-11 pass with the baseline still empty).
- SEC2 The unpublish page and route are `noindex`, excluded from the bot filter, and the token is compared with `timingSafeEqual`.
- SEC3 Service-key reads are bounded (`limit`) and the feedback route caps its window at 90 days.
- SEC4 `review_hold` can be cleared only through the admin route with a session (the ingest token cannot clear it).

## SEO

- SEO1 Service pages keep their current JSON-LD and metadata shape, now sourced from the table (snapshot spec on one slug before and after the slice, identical output on the seed).
- SEO2 Published articles emit `BlogPosting` with `datePublished = published_at` and `FAQPage` when `faq` exists; `sitemap.xml` lists them with `lastmod = updated_at`.
- SEO3 The skill's local-SEO checklist requires at least one town and one county from `COUNTIES` and the service-area sentence in every new article; PG does not enforce it (a reason would block legitimate general posts), the reviewer checks SK2's article for it.

## Gates and reports

- Every slice: typecheck, lint, `chaos:static`, the full stub suite, and its live specs on the local rig; the builder writes `docs/phase-2/reports/slice-<x>-build.md`, the reviewer writes `-review.md` with ACCEPT or REJECT per AC and evidence.
- Order: slice E and slice F in parallel from the base SHA; slice G starts after F merges (it needs the writer and routes); slice H starts after E merges (it needs the catalog data path for variant payloads) and can run beside G.
- Lavish review of every flow with screenshots before the gate; then `/no-mistakes` on the branch.
- `follow-ups.md` lists: delete `OPENAI_API_KEY` from Vercel and Supabase, set `PROJECT_INGEST_TOKEN` if unset, seed `claim_license` and `claim_insurance` facts with Alex's wording, `supabase functions delete` for the removed functions (Q13), read production blog RLS.
