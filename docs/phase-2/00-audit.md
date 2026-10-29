# Phase 2 audit - what exists today

Audited 2026-10-29 on `feat/home-services-request-flow` at 811952d, read-only.
Decisions this audit serves: `docs/decisions/004-grill-round-1-phase-2.md` (Q7 to Q12).
This is a record of what exists, not a design.

## 1. Blog data model

**Table.** `public.blog_posts` was created in the Supabase dashboard, not by a migration.
The only repo trace of its creation is a bare stub in `supabase/migrations/00000000000000_preview_baseline.sql:27` (id, published) and `00000000000001_preview_baseline_fixups.sql:20,28`.
Later migrations add `scheduled_publish_at` (`20251222155716_add_scheduled_publish_at.sql`), `suggested_image_prompt` (`20251222162233_add_suggested_image_prompt.sql`), and drop two dead proposal columns (`20260811000000_drop_dead_seo_proposal_columns.sql`).
The full column list exists only in `src/integrations/supabase/types.ts:489-507`:

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| title, slug, content, category | text, required | `content` is markdown |
| author | text | defaults to "Alex T." in code |
| excerpt, featured_image | text, nullable | |
| meta_title, meta_description, meta_keywords | text, nullable | the only SEO fields |
| published | boolean | the only status field, no draft/review states |
| scheduled_publish_at | timestamptz, nullable | picked up by the publish cron |
| suggested_image_prompt | text, nullable | written by the OpenAI generator |
| created_at, updated_at | timestamptz | `created_at` doubles as the published date |

There is no `published_at`, no locale column, no FAQ field and no author/byline table.
Related tables, all in `20260724000000_seo_autonomy_phase1.sql`: `content_actions` (line 43), `blog_post_revisions` (line 67, snapshots for rollback, column named `content_html` but holds markdown), `content_facts` (line 84).
`maintained_articles` (cornerstone roster, four seeded slugs) is in `20260806000000_maintained_articles.sql:13`.
None of `seo_metrics`, `content_actions`, `blog_post_revisions`, `content_facts` or `maintained_articles` is in the generated types file.

**Public pages.**
- `src/app/blog/page.tsx:10` sets `revalidate = 300` and lists `published = true` ordered by `created_at` (lines 59-63), with no row limit.
- `src/app/blog/[slug]/page.tsx:14` sets `revalidate = 300`, reads `select('*')` by slug with `published = true` (lines 48-56), and prebuilds every published slug in `generateStaticParams` (lines 69-76).
- It renders markdown via `MarkdownContent` and emits `BlogPosting` and breadcrumb JSON-LD (lines 146-215); there is no `FAQPage` schema.
- `src/app/blog/[slug]/layout.tsx:12-17` repeats the read for metadata through the browser client module.
- `src/app/blog/preview/[slug]/page.tsx:67-71` shows unpublished posts client-side, relying on an RLS policy for authenticated users that is not in any migration.
- Both blog pages use the publishable key, so public reads depend on a production RLS select policy that is also not in the repo.

**Sitemap.** `src/app/sitemap.ts:252-273` reads `slug, updated_at` of published posts with the publishable key, priority 0.7.
The sitemap sets no `revalidate`, and `sitemap.xml` is excluded from middleware (`src/middleware.ts:349`).

**ISR.** The 300-second value is deliberate: `docs/cost-review.md:100` says the blog editor writes straight to the database and cannot revalidate on save.
`/blog` is not in `REVALIDATE_PREFIXES` (`src/lib/revalidate.ts:10-18`), so the shared revalidate route refuses blog paths today.

## 2. The admin blog editor

- `src/components/admin/BlogPostEditor.tsx` (934 lines) writes `blog_posts` from the browser with the user session: update at line 239, insert at line 242, fields assembled at lines 218-235.
- It sets `published` or `scheduled_publish_at` (Eastern time converted to UTC), uploads images to the `blog-images` bucket (lines 304-364), and calls three Supabase edge functions (section 3).
- `src/components/admin/BlogPostList.tsx` toggles `published` (lines 69-78), deletes (line 100) and clears schedules (lines 127-128), also from the browser.
- `src/components/admin/BlogPostGenerator.tsx` calls the `generate-blog-post` edge function and inserts a `published = false` row (lines 42-87).
- None of the three calls `requestRevalidate` or any server route, so every edit waits for the 300-second window.
- `src/app/api/cron/publish/route.ts` (daily at 11:00 UTC) flips scheduled posts to published and rewrites `created_at` (lines 52-66), with no revalidation.
- `src/app/api/cron/seo-rollback/route.ts:122-128` can PATCH a live post back to its last revision, also with no revalidation.
- The only server-side blog writers are the content-actions `stage` and `apply` routes, the publish cron, the rollback cron and the seo-maintain cron; none revalidates.

## 3. Everything that uses OpenAI

| Where | What it does | Verdict |
|---|---|---|
| `package.json:72` `"openai": "^6.21.0"` | SDK used by the two Next routes below only | Remove (Q11) |
| `src/app/api/admin/content-actions/draft/route.ts:13,73,139-140` | `gpt-5.5` draft of a queued action into `content_actions.draft_markdown`, then `validateDraft` (line 152) | Remove (Q11) |
| `src/app/api/cron/seo-maintain/route.ts:21,45,112,141` | Monthly (`vercel.json`, `0 8 2 * *`); every outcome except skip/up-to-date is an OpenAI draft | Remove the AI half (Q11); see note |
| `supabase/functions/_shared/openai.ts:8-102` | Raw `fetch` to `api.openai.com` for chat and images | Not named in Q11; needs a decision |
| `supabase/functions/generate-blog-post/index.ts:10,28,102,141` | Blog generator behind `BlogPostGenerator` | Not named in Q11; needs a decision |
| `supabase/functions/enhance-blog-content/index.ts:10,128,190` | "Enhance" button in `BlogPostEditor.tsx:445` | Not named in Q11; needs a decision |
| `supabase/functions/generate-blog-image/index.ts:2,48,67` | Featured image generation in `BlogPostEditor.tsx:342` | Not named in Q11; needs a decision |
| `scripts/perf-run.mjs:340` | Blanks `OPENAI_API_KEY` for perf runs | Remove with the key |

**Env var.** `OPENAI_API_KEY` in Vercel (Next routes) and in Supabase function secrets (edge functions); `.env.local` also holds it per the local-rig notes.
**Note on seo-maintain.** Its non-AI logic is small: read the roster (`src/lib/seo/maintainedArticles.ts`), `isRefreshDue`, the open-refresh dedupe query (lines 230-237) and `markMaintained`.
Removing the AI half leaves a cron that produces nothing, so in practice it is a removal of the route and its `vercel.json` entry, with `maintained_articles` kept as data.
**Note on the editor.** `BlogPostEditor.tsx:400` invokes a `generate-blog-seo` edge function that does not exist under `supabase/functions/`.
**Keep, no OpenAI:** `seo-ingest`, `seo-report`, `seo-suggest`, `seo-rollback`, `content-actions` GET/POST, `stage`, `apply`.
**Knock-on:** `stage` (line 58) and `apply` (line 71) require a `draft_markdown` that only the two OpenAI writers produce, so they have no producer after Q11.
`src/components/admin/SeoSuggestionsDashboard.tsx:111,299` has the "Draft with AI" button.
`tests/seo-suggestions-ui.spec.ts:23,43` asserts the draft route exists and will fail when it is deleted.
`tests/lead-intake.spec.ts:85,238` and `tests/lead-intake-e2e.spec.ts:373` assert the lead flow has no AI SDK and are unaffected.

## 4. The SEO data

**Schema.** `seo_metrics` (`20260724000000_seo_autonomy_phase1.sql:10-28`): one row per source, url, query and date.
Columns: `source` (`gsc` or `ga4`), `url` (page path), `query` (null for GA4), `date`, `impressions`, `clicks`, `position` numeric(6,2), `ctr` numeric(6,4), `users`, `engaged_sessions`, `conversions`, `ingested_at`.
Unique on (source, url, query, date) with `NULLS NOT DISTINCT`, so re-ingest is idempotent.
Indexes on (url, date), (query, date) and (source, date).
RLS on, no policies: service role only.

**Writer.** `src/app/api/cron/seo-ingest/route.ts`, daily at 06:00 UTC with `?days=3` (max 30).
It uses `src/lib/seo/gsc-client.ts` and `ga4-client.ts` with `GSC_SITE_URL`, `GA4_PROPERTY_ID` and `GOOGLE_SERVICE_ACCOUNT_B64`; `SEO_INGEST_MODE=fixture` runs it offline.
URLs go through `toPagePath` (`src/lib/seo/url.ts:5`), which drops the query string of full GSC URLs, so `/home-services?lang=es` and the English page share a key.

**Existing logic worth reusing for `GET /api/articles/seo-feedback`.** All of it is pure and unit-testable.
- `buildSeoReport` (`src/lib/seo/report.ts:100`): 28-day window split into two 14-day halves (`reportWindow`, line 88).
- It yields `refresh_candidates` (15+ impressions, position 5 to 20, CTR under 5 percent), `winners` by conversions, `new_article_candidates` (25+ impressions, CTR under 3 percent) and `trend` (recent versus prior clicks per URL, delta of 2 or more).
- `trend` with a negative delta is the closest thing to "decaying pages"; there is no named decay metric.
- `proposeContentActions` (`src/lib/seo/scoring.ts:82`) with `ctrBaseline` by position (line 55) proposes refresh, new and consolidate actions, capped 10/5/5 (line 45); `seo-suggest` (weekly, Monday 07:00) writes them to `content_actions`.
- `assessRollback` and `windowMetrics` (`src/lib/seo/rollback.ts:33,60`) give a 14-day CTR comparison with a 20 percent drop threshold.
- `seo-report` (Monday 06:30, `?email=1`) emails the digest via `src/lib/notify/sendSeoReportEmail.ts`.
- All crons read Supabase through `src/lib/seo/supabase-rest.ts` with `SUPABASE_SECRET_KEY`.

## 5. The fact-lock

**Data.** `content_facts` (key, value, description, verified_at, verified_by, lock).
Seeded keys: `hic_number`, `phone_main`, `email_info`, `email_leads`, `service_area` (phase-1 migration lines 95-101) and `current_year` (maintained-articles migration).
There is no pricing fact; the migration comment at line 82 mentions "pricing bands" but none were seeded.
There is no admin UI for it; the comment says edit through the Supabase UI.

**Code.** `src/lib/seo/draftGuardrails.ts`, pure functions.
`validateDraft` (line 50) checks exactly three things:
1. At least three internal markdown links (lines 54-58).
2. Every phone-shaped string equals `phone_main` (lines 60-68).
3. Every NJ HIC-shaped number (`\d{2}VH\d{6,8}`) equals `hic_number` (lines 70-78).

`buildFactLockText` (line 84) is a prompt block telling the model not to invent prices; it is an instruction, not a check.
Emails, service area, year and every other fact are not validated.

**Where it runs.** Only on AI output: `content-actions/draft/route.ts:152` and `seo-maintain/route.ts:194,252`.
The result is stored in `content_actions.draft_meta.validation`; `stage/route.ts:67-71` and `apply/route.ts:76-82` refuse with 422 when it is `ok: false`.
It never runs on posts written in `BlogPostEditor`, `BlogPostGenerator`, the publish cron or the rollback cron.

**Price and legal claims: it cannot detect either today.**
No regex looks for currency, "$", percentages, "starting at", or any price wording.
No check looks for legal wording (code compliance, permits, licensing, warranties, guarantees, insurance) beyond the license number matching.
A draft saying "kitchens from $9,000" or "fully code compliant" passes as long as it has three internal links.

## 6. Telegram

- `src/lib/notify/telegramMessage.ts:41` `sendTelegramMessage(text)`: in-process `fetch` to `api.telegram.org/bot<token>/sendMessage`, HTML parse mode, 6-second timeout, returns `sent`, `not_configured` or `failed`, never throws.
- Helpers: `escapeTelegram` (line 18), `escapeTelegramClipped` (line 34), `TELEGRAM_TEXT_LIMIT = 4096` (line 23).
- `src/lib/notify/telegramLead.ts:66` is a separate lead-specific sender with its own fetch (line 142).
- Env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (one chat, the owner's), plus `TELEGRAM_PHOTO_LINKS` in `src/lib/home-services/requests.ts:285`.
- **No inline keyboard, `callback_data`, `callback_query`, `answerCallbackQuery` or Telegram webhook route exists anywhere in `src`.**
- The closest one-tap pattern is a signed link: `src/app/api/crew/confirm/route.ts` takes a random per-recipient token and is POST-only on purpose, because link previewers fetch every GET (lines 8-14).
- The home-services offer links (`/offer/[token]`, `src/app/api/offers/`) follow the same token pattern.
- Telegram's own link preview is off (`disable_web_page_preview: true`), but a plain GET unpublish link would still be prefetchable by other clients.

## 7. The project ingest pattern to mirror

**Routes.**
- `src/app/api/projects/ingest/route.ts` POST create draft (JSON or multipart).
- `src/app/api/projects/ingest/[id]/route.ts` PATCH, revalidates when the project is active (line 40).
- `src/app/api/projects/ingest/[id]/publish/route.ts` POST publish, revalidates (line 38).
- `src/app/api/projects/ingest/uploads/route.ts` for signed uploads.
All are `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`.

**Auth.** `src/lib/projects/ingestAuth.ts`: `PROJECT_INGEST_TOKEN`, at least 32 characters or the routes answer 404 to everyone (lines 14-20, 52-61); `Authorization: Bearer`, compared as SHA-256 digests with `timingSafeEqual` (lines 37-41).
`authorizeIngest` (`src/lib/projects/ingest.ts:28-48`) rate limits 30 a minute per IP before checking the token, then falls back to a signed-in session via `adminUserId` (`src/lib/projects/session.ts:11`).
Middleware lists `/api/projects/ingest` as public (`src/middleware.ts:130`) so the route does its own auth.

**Validation.** Zod schemas built on the admin's own schemas (`ingestCreateSchema`, `ingestUpdateSchema`, `src/lib/projects/ingest.ts:74,80`); bodies read by `readJsonBody` with a 256 KB cap and errors shaped by `validationResponse` (`src/lib/projects/http.ts:10-41`).
Answers carry the admin URL (`adminUrl`, line 60) via `ingestAnswer` (`ingest.ts:144`).

**Writes and revalidation.** `src/lib/projects/draft.ts` writes with the service key through `supabaseRest`; `revalidateProjectPages` (`http.ts:43-52`) calls `revalidatePath` on the project, `/portfolio` and `/`.

**CLI and docs.** `scripts/ingest-project.mjs` (Node 18, no dependencies) and `docs/projects-ingest.md` (130 lines: setup, CLI flags, worked example for Claude Code, raw API, bot-filter user-agent note at line 85).
**Tests.** `tests/project-drafts.spec.ts:112-141` imports `ingestAuth` directly to pin "token unset means 404".

**Share as is:** `ingestAuth.ts` (the token check takes an env object, so a second token or the same token both work), `checkRateLimit`, `readJsonBody`, `validationResponse`, `adminUserId`, the middleware public-route entry style.
**Copy and adapt:** `authorizeIngest` (its rate-limit key and 404 wording are project-specific), the route trio, the zod schemas (no blog schema exists today; the editor builds its payload by hand), a blog revalidate helper (no blog equivalent of `revalidateProjectPages` exists), the CLI and the doc.
**New with no precedent:** a server-side blog writer module (all blog writes outside the crons are browser-side today), and the `seo-feedback` GET.

## 8. The services catalog

**Source.** `src/lib/home-services/catalog.ts` (553 lines) holds seven services in `HOME_SERVICES_CATALOG` (line 110).
Per service (interface at lines 56-89): slug, trade, icon, optional image, `startingPriceCents`, `priceDisplay`, `priceUnit`, `priceNote`, `minimumCents`, `description`, `included`, `raisesPrice`, three `questions`, `seo` (title, description, keywords) and `faq`, every text field in English and Spanish.
Its header (lines 2-10) states it is the only price source and that "no admin price editor" was the earlier spec; Q7 reverses that.
There is no `home_services` table yet; `20261029000000_home_services.sql` creates requests, subs, offers and CTA tables only.

**Consumers.**

| File | Uses | Needs |
|---|---|---|
| `src/app/home-services/page.tsx:15` | catalog, `t` | names, prices, descriptions, SEO |
| `src/app/home-services/[slug]/page.tsx:14,29,33` | `getService`, catalog, `SERVICE_SLUGS` | everything; `generateStaticParams` plus `dynamicParams = false` |
| `src/app/sitemap.ts:5` | `SERVICE_SLUGS` | slugs |
| `src/lib/home-services/seo.ts:5` | `HomeService`, `COUNTIES` | SEO copy, FAQ |
| `src/components/home-services/ServiceCatalog.tsx:6` (client) | catalog | cards: name, price, description |
| `src/components/home-services/PriceSheet.tsx:5` (client) | `HomeService` | price, included, raises |
| `src/components/home-services/RequestFlow.tsx:6` (client) | `getService`, `TIMING_OPTIONS` | questions, names |
| `src/lib/home-services/requests.ts:11-19` | `getService`, `isServiceSlug`, `SERVICE_SLUGS`, `describeAnswers` | slugs, questions |
| `src/lib/home-services/requestsAdmin.ts:9`, `api/admin/service-requests/[id]/route.ts:14` | `describeAnswers`, `getService` | names, questions |
| `src/app/api/admin/service-requests/route.ts:14` | `isServiceSlug` | slugs |
| `src/components/admin/home-services/shared.tsx:10`, `BidRequestForm.tsx:21` | catalog, `TRADE_LABEL` | names, trades, prices |
| `api/admin/offers`, `api/admin/subs`, `lib/home-services/offers.ts`, `offerEmail.ts`, `offer/[token]` | `TRADE_LABEL`, `COUNTIES`, `t`, `toLang` | trades and language only |
| Type-only importers (`AddressField`, `PhotoUploader`, `LangToggle`, `FlowDone`, `RequestServiceButton`, `ServiceIcon`, `i18n.ts`, `countyZips.ts`, `offerRules.ts`, `lang.ts`) | `Lang`, `County`, `Trade` | nothing from the data |

Three client components import the catalog array directly, so it ships in the browser bundle today.

**Rendering.** Both home-services pages read `cookies()` and `searchParams` for the language (`page.tsx:31-33`, `[slug]/page.tsx:35-37`), so they render dynamically and have no `revalidate` export; "hourly ISR" does not apply to them as built.
`/home-services` is not in `REVALIDATE_PREFIXES`.

**Pricing module.** `src/lib/home-services/pricing.ts` holds markup rules only (`SUB_MARKUP = 1.43`, `SUB_PAY_MAX_SHARE = 0.7`, `OFFER_TTL_HOURS`, cents formatting); it does not import the catalog and has no prices.

**Admin "Pricing" from Slice B.** It is the read-only Pricing Report (`src/components/admin/home-services/PricingReport.tsx`, sidebar label at `AdminSidebar.tsx:92`), fed by `GET /api/admin/pricing-report`.
It edits nothing; it reports offers, declines, counters, average sub pay and customer price per trade and county.

**The older `services` table.** `ServicesEditor.tsx` edits `public.services` (types at `types.ts:1864`: title, description, features JSON, icon_name, active, sort_order) from the browser and calls `requestRevalidate(['/services'])` (lines 97, 129).
It feeds the remodeling services on the homepage (`src/components/Services.tsx:30`) and `/services/[slug]` (matched by `ilike` on title, `src/app/services/[slug]/page.tsx:43-47`).
**They do not overlap.** The old table is the remodeling lines (kitchens, baths and so on) with no prices, slugs, questions or Spanish; the catalog is the seven priced home-maintenance services at `/home-services`.
No code reads both, and no row in one corresponds to a row in the other.
The shared word "services" and the shared revalidate prefix `/services` are the only collision risk.

## 9. Risks and unknowns

- **blog_posts schema is not in migrations.** A local `db reset` builds it from stubs, so a from-scratch replay lacks title, slug, content and the meta columns; any Phase 2 migration that touches them must guard the way `20261029000000_home_services.sql:16-40` guards `projects`.
- **Blog RLS is unknown.** Public reads and browser-side admin writes depend on production policies not in the repo; a service-role ingest bypasses them, but the policies should be read from production before relying on preview behaviour.
- **Admin means any signed-in user.** Middleware (`verifySupabaseSession`, `src/middleware.ts:151-175`) and `adminUserId` check for a user, not an admin role.
- **No blog revalidation path exists.** `/blog` is not an allowed revalidate prefix, the pages sit at 300 seconds, and the publish and rollback crons change live content without revalidating.
- **Sitemap caching.** `sitemap.ts` has no `revalidate` export and reads the database at request or build time; how often it refreshes on Vercel was not verified here.
- **Locale.** Blog posts are English only with no locale column; home services are bilingual in every text field, so a table needs paired columns or JSON, and GSC rows for `?lang=es` collapse into the English path.
- **Static slug list.** `[slug]/page.tsx:29-33` prebuilds `SERVICE_SLUGS` and 404s anything else; a database-driven list changes that contract.
- **Client bundles.** `ServiceCatalog`, `PriceSheet` and `RequestFlow` import catalog data in the browser; editable copy has to reach them as props.
- **Tests that assert catalog content.** `tests/home-services-landing.spec.ts:5,60,165-169,254,341,365-372` imports the catalog and checks seven slugs and the rendered prices; `tests/home-services-offers.spec.ts:16` imports `describeAnswers`.
- **Tests that assert OpenAI code exists.** `tests/seo-suggestions-ui.spec.ts:23,43`.
- **chaos:static baseline is empty** (`chaos/static-baseline.json` is `[]`), so any new uncapped `supabaseRest` GET (CM-14), fail-open secret guard (CM-11) or public route that sends Telegram without a rate limit or auth gate (CM-01/CM-08, `scripts/chaos-static.ts:199`) fails the pre-push run.
- **Fact-lock scope.** It validates three things on AI output only; Q10's "no price or legal claim" condition has no implementation to reuse.
- **Edge functions with OpenAI** are outside Q11's list, and removing the key would break the editor's Generate, Enhance and image buttons.
- **Missing function.** `generate-blog-seo` is called by the editor but absent from the repo, so that button likely fails today (not verified against the deployed Supabase project).
- **Generated types are stale** for every SEO table; new code will keep using untyped `supabaseRest` unless the types are regenerated.
- **Unbounded reads** on the blog list and `generateStaticParams` (no `limit`) are fine at today's post count and would grow with automated publishing.
