# Slice F review - OpenAI removal, article routes, SEO feedback

Reviewer: independent reviewer agent (Opus 5.5), not the builder.
Branch `phase2/slice-f` at builder head `3e660c5`, cut from `1982e0a`.
Date: 2026-10-29.
Rig: local Supabase `http://127.0.0.1:55421`, rig-only env (no production keys), production build on port 3116, `next dev` on 3115, pre-fix build of `1982e0a` on 3117.
Every row I created was prefixed `review-f-` and deleted at the end (0 rows left in `blog_posts`, `content_actions`, `seo_metrics`, `rate_limits`; 0 `slice-f-` rows left by the builder's spec either).

## Overall verdict: REJECT (small, specific fix list)

The slice does what the contract says, and almost every criterion passes live on a production build.
It is rejected for one real safety regression, one merge condition, and two phone-width UI defects, all small:

1. **Must fix - fact-lock bypass.** A Claude publish with a refresh `action_id` applies a draft that the fact-lock rejected; the admin's Apply refuses the same draft with 422 (evidence in item 4).
2. **Merge condition - no guard in production.** With the slice F stub guard, the token can publish anything, including a post whose `review_hold` is set, and the publish clears the hold (evidence in item 5). Slice F must not reach production before slice G, or the stub must fail closed outside tests. The planner also has to resolve a contract conflict between "publish on pass sets `review_hold = null`" and SEC4.
3. **Must fix - SEO tab at iPhone 13 width.** "Draft with Claude Code" overlaps the status pill by 25 by 16 px and truncates the query to `"r...` (item 6).
4. **Must fix - "From Claude Code" badge** in the blog list wraps into a three-line oval at iPhone 13 width (item 6).
5. **Must fix - the build report's 500 claim is overstated** and has to be corrected (item 4): production was never answering 500, because a build that has published posts compiles `/blog/[slug]` as fully dynamic.

## 1. RM - OpenAI removal

| AC | Verdict | Evidence |
| --- | --- | --- |
| RM1 | ACCEPT | `grep -rin openai src supabase package.json` (migrations excluded, none match): only two code comments explaining the removal (`stage/route.ts:13`, `draftGuardrails.ts:7`, `articles/actions.ts:5`) and the privacy policy text. `grep -c openai package-lock.json` = 0. |
| RM2 | ACCEPT | `src/app/api/admin/content-actions/` holds only `apply`, `stage`, `route.ts`; no `src/app/api/cron/seo-maintain`; `vercel.json` has no seo-maintain cron (read in full); `maintained_articles` table untouched (only `maintainedArticles.ts` code deleted). |
| RM3 | ACCEPT, with UI defect | Rendered on `next dev` at iPhone 13: clicking "Draft with Claude Code" on an approved `new` action shows `node scripts/ingest-article.mjs create --action <id> --title 'Review-F Bathroom Remodel Cost NJ' --category 'Bathroom Remodeling' --file article.md` then `publish <post id printed above> --action <id>`; the command is correct for the CLI. Layout defect: see item 6. |
| RM4 | ACCEPT | Stub run: `tests/seo-suggestions-ui.spec.ts` all pass (part of 27 passed, item 7). |
| RM5 | ACCEPT | `supabase/functions/` holds only `_shared`, `publish-scheduled-articles`, `send-lead-notification`, `send-warranty-notification`; no `BlogPostGenerator.tsx`; no `generate-blog`, `enhance-blog`, `generate-blog-seo` reference anywhere in `src`, `supabase/functions`, `scripts`; editor buttons gone (screenshot, item 6). `docs/phase-2/follow-ups.md` lines 8 to 10 list `OPENAI_API_KEY` deletion in Vercel and Supabase and the three `supabase functions delete` commands. |
| RM6 | ACCEPT, with item 4 finding | Builder's live spec on the production build: `RM6 + FB3` and `RM6: a Claude refresh draft is applied by the admin Apply, and by a publish with action_id` pass (item 2 run). My own run: a refresh draft written by `patch --action` left the live post unchanged (`live content: Body.`) and became the action's draft. |

## 2. ART - article routes and CLI (production build, port 3116)

Builder's spec against my production build: `TEST_URL=http://localhost:3116 E2E_LIVE_BACKEND=1 E2E_ISR=1 playwright test tests/articles-ingest.spec.ts --project=chromium` gave **28 passed, 1 skipped** (the stub-only ART1 HTTP test), exit 0.
The ISR control test passed, so `/blog` really was serving a cached copy during the run.
The browser half of the spec sets `bypassCSP: true` because the production CSP only allows the production Supabase origin; that is stated in the spec and acceptable.

My own end-to-end drive of `scripts/ingest-article.mjs` against 3116 (browser user agent for page fetches, `node` for the API):

| Step | Result |
| --- | --- |
| Warm `/blog` (`x-nextjs-cache: HIT`, `s-maxage=300`), `/blog/review-f-kitchen-timeline` 404, sitemap 0 matches | baseline |
| `create --file article.md --slug review-f-kitchen-timeline --faq faq.json` | printed id, slug, preview and admin URLs; row `published=f, source=claude, published_at null, review_hold null`, 2 FAQ items |
| Same create twice more | slugs `review-f-kitchen-timeline-2` and `-3` (ART6) |
| `patch <id> --title ...` on the draft | "Updated ... (draft)" |
| `publish <id>` | `/blog` answered `x-nextjs-cache: MISS` and listed the slug, the post answered 200, `sitemap.xml` listed `<loc>.../blog/review-f-kitchen-timeline</loc><lastmod>2026-10-29T16:24:22.851Z</lastmod>` on the very next request (ART4) |
| Post page | one `FAQPage` block, `datePublished` equal to `published_at`, "Frequently asked questions" section rendered (ART10) |
| `patch` a live post with a marker title | post page and `/blog` show the marker on the next request (post was `HIT` before), `published` still `t` (ART3) |
| `feedback --summary` | printed the window, pages, open actions, exit 0 |
| `unpublish <id>` | `/blog` 0 matches, post 404, sitemap 0 matches on the next request (ART5) |
| Bad body `{"title":"","slug":"Bad Slug","content":"","extra":1}` | 400 with issues for `title`, `slug`, `content`, `category` and the unknown key (ART6); `not json` gives 400 `Invalid JSON body.` |
| 32 calls with a wrong token from one `cf-connecting-ip` | 30 times 401, then 429 with `retry-after: 60`; a different IP still gets 200 (ART7) |
| A second production server on 3115 with `PROJECT_INGEST_TOKEN=shorttoken` | create, patch, publish, unpublish and feedback all 404, with the short token AND with the real rig token, and without auth (ART1) |

| AC | Verdict |
| --- | --- |
| ART1 | ACCEPT (short token proven live; unset token covered by the pure `checkIngestToken` test) |
| ART2 | ACCEPT |
| ART3 | ACCEPT |
| ART4 | ACCEPT |
| ART5 | ACCEPT |
| ART6 | ACCEPT |
| ART7 | ACCEPT |
| ART8 | ACCEPT (CLI driven by hand end to end; `docs/articles-ingest.md` has the worked example) |
| ART9 | ACCEPT (builder's spec on the production build: list toggle, editor save, publish cron and rollback cron each visible on the next request) |
| ART10 | ACCEPT |

## 3. FB - SEO feedback

Fixture: one published post `review-f-fb-post`, 10 GSC rows for it (prior 14 days 4 clicks a day, recent 1 a day, 100 impressions each, positions 5 and 9), 18 rows for a growing non-blog page, 250 one-row paths, one approved `new` action.
`GET /api/articles/seo-feedback?days=28` on 3116:

- Keys: `window, pages, pages_total, refresh_candidates, new_article_candidates, suggested_actions, open_actions, truncated`; page keys `path, impressions, clicks, ctr, position, trend_delta, decaying, post`.
- `/blog/review-f-fb-post`: impressions 1000, clicks 25, ctr 0.025, position 7 (impression-weighted), trend_delta -15, `decaying: true`, `post { id, slug, title, published_at }` - every number matches a hand computation (FB1, FB2).
- `/review-f-landing`: trend_delta +28, `decaying: false`, no `post` (FB2).
- `pages` 200, `pages_total` 252, `truncated: false` (FB4); `?days=91` and `?days=6` give 400, `?days=90` gives 200 (SEC3).
- The approved action is in `open_actions` with `kind`, `status`, `target.query`, `rationale` (FB3).
- Round trip: `create --action <id>` set the action `drafted` with `draft_meta.post_slug` and the fact-lock verdict; `publish <id> --action <id>` set it `completed`, `published_post_id` = the post, `completed_by: publish`; the next feedback call no longer lists it; a second publish with the same action gets a clear 409 (FB3).

| AC | Verdict |
| --- | --- |
| FB1 | ACCEPT |
| FB2 | ACCEPT |
| FB3 | ACCEPT |
| FB4 | ACCEPT (`chaos:static` total 0, item 7) |

Advisory, not blocking: `decaying` compares 15 calendar days (split day to today) with the 14 before, and GSC data lags about 2 days (`seo-ingest` ends its window at today minus 2), so the recent half has about 12 days of data against 14.
That biases every page toward `decaying: true`, and with no noise floor a one-click drop flags a page (the weekly report filters `|delta| >= 2`).
Anchor both halves on the latest ingested date and consider the report's noise floor; slice G's skill reads this flag to choose refreshes.

## 4. The `action_id` design and the `/blog/[slug]` 500 fix

### `action_id`: ACCEPT the design, one must-fix

The design is sound: a `new` action's post IS its draft (Stage links it instead of inserting a copy), and a refresh or consolidate never touches the live post until Apply or a publish runs the one shared `applyActionDraft` (revision snapshot, baseline CTR, rewrite), so the 14-day rollback guard covers Claude's rewrites.
Mismatched pairs (action rewrites another post, slug change on a refresh, a `new` action that already has a post, a closed action) answer 400 or 409 with plain messages.

**F1, must fix: the publish path skips the fact-lock that Apply enforces.**
`/api/admin/content-actions/apply` refuses a draft whose `draft_meta.validation.ok === false` with 422; `POST /api/articles/ingest/<id>/publish` with the same `action_id` goes straight to `applyActionDraft` (`planFor` then `applyActionDraft`, no validation check).
Reproduced on 3116 (`factlock.sh`): a refresh draft containing `(973) 555-0199` and no internal links was recorded with `validation: {"ok": false, "issues": ["Only 0 internal link(s); needs at least 3.", "Unrecognized phone number \"(973) 555-0199\" (locked: (201) 212-4917)."]}`, then `publish --action` answered `Published`, the live post now read `Call us at (973) 555-0199 ...`, the action was `completed` with `applied_by: claude`.
Fix: move the validation refusal into `applyActionDraft` (so both callers share it) or check it in `planFor`, and add a spec for it.
Slice G's guard would also catch it, but the fact-lock is an existing protection this slice removed from one path.

Advisory: if the admin Stages a Claude `new` draft (action becomes `completed`) and Claude then runs the dashboard's own second command `publish <post> --action <id>`, it fails with 409 "the action is completed, not open".
A publish whose action is completed and already linked to this same post should be accepted as a no-op on the action.

### `/blog/[slug]` 500 fix: ACCEPT the fix, the claim is only partly true

Reproduced on `1982e0a` in a second worktree, production build, port 3117:

- Build with published posts in the database: the build lists `ƒ /blog/[slug]` (dynamic). A post inserted after the build answered **200** twice, with `Cache-Control: private, no-cache, no-store`.
- Build with zero published posts (I unpublished my own rows; no other published rows existed): the build lists `● /blog/[slug]`. A post inserted after the build answered **500** twice, server log `digest: 'DYNAMIC_SERVER_USAGE'`.

So the 500 only happens when the build sees no published post, which is the rig, not production.
Production has published posts, so its post pages were rendered per request with `no-store` (no ISR at all), and new posts did not 500.
The fix (dropping the `searchParams` read and the `?preview=true` mode) is still right and safe: the page becomes the ISR page its `revalidate = 300` always intended, which ART4 and ART5 depend on, it stops serving every post uncached, and drafts keep their admin-only preview route.
The build report must be corrected: replace "every post published after a deploy 500s" with the conditional finding above, and note the production effect (per-request rendering becomes ISR).

## 5. Security

| Check | Verdict | Evidence |
| --- | --- | --- |
| Every new route self-guarded | ACCEPT | All five routes call `authorizeArticles` first; 404 when the token is short (item 2); rate limit is checked before the token, so a wrong token still spends the bucket (30 times 401 then 429); `/api/articles/` is listed public in `middleware.ts` with a comment. A signed-in admin session is also accepted when the token is configured, as `authorizeIngest` does. |
| Service-key reads capped | ACCEPT | `getArticle` and `getAction` `limit=1`; slug probe `limit=500`; `content_facts` `limit=100`; feedback reads capped at 50 000 metric rows, 1000 posts, 100 actions; publish cron `limit=50`; `/blog` 200; admin list 500; apply's metric read `limit=5000`. |
| `chaos:static` with empty baseline | ACCEPT | `total 0, baselined 0, NEW 0, fixed since baseline 0`. |
| Ingest token cannot write `review_hold` directly | ACCEPT | PATCH with `review_hold`, `published` or `source`, and publish with `review_hold`, each answer 400 `Unrecognized key` (strict zod schemas). |
| Ingest token cannot clear `review_hold` (SEC4) | **NOT MET in slice F** | Set `review_hold` on `review-f-kitchen-timeline-2` by SQL, then `POST .../publish` with the token: 200, `published = t`, `review_hold` null. Cause: the stub guard always passes and `publishArticle` writes `review_hold: null`, which the contract itself asks for ("On pass: ... `review_hold = null`"). The contract and SEC4 conflict; the planner has to decide whether a token publish may ever clear a hold (for example only when the guard passes on changed content) or must 409 while a hold is set. Until slice G lands, slice F in production means Claude publishes with no check at all, which Q10 does not allow; hence the merge condition above. |

Low, informational: session auth on POST routes relies on Supabase's SameSite=Lax cookies against cross-site form posts; fine today, worth keeping in mind if cookie settings change.

## 6. Admin UI at iPhone 13 width (390 by 844, `next dev`, signed in)

Screenshots:

- `docs/phase-2/reports/shots/slice-f-review-admin-editor-iphone13.png` (full editor)
- `docs/phase-2/reports/shots/slice-f-review-admin-editor-iphone13-fold.png` (first screen)
- `docs/phase-2/reports/shots/slice-f-review-admin-blog-list-iphone13.png`
- `docs/phase-2/reports/shots/slice-f-review-seo-tab-iphone13.png`

Findings:

- **Editor: clean.** No Generate, Enhance or image-prompt controls; buttons are Cancel, Preview, Save Post plus the markdown toolbar; `scrollWidth` 390 equals the viewport, no element past the right edge; console has only Next's `scroll-behavior` dev warning. The toolbar's trailing divider after the link button with the box helpers wrapping below is pre-existing, not from this slice.
- **SEO tab (must fix, new in this slice):** the "Draft with Claude Code" button (x 156 to 363, y 310 to 354) overlaps the "approved" pill (x 114 to 181, y 338 to 360), and the query title is truncated to `"r...`. The longer label is this slice's. The command block scrolls sideways inside 213 px of its 1317 px content, which works but shows only `node scripts/ingest-article.` on a phone; stacking the Copy button under the code would give it the full width.
- **SEO tab (minor):** a completed action that Claude published directly still shows "Staged as draft -> preview".
- **Blog list (must fix, new in this slice):** the "From Claude Code" badge wraps into a three-line oval in the narrow title cell; give it `whitespace-nowrap` or put it on its own line.
- **Blog list (pre-existing, worth fixing):** Author, Updated and the Publish, Edit, Delete actions sit off-screen in the table's horizontal scroll, so the phone user cannot see how to publish.
- **Public `/blog` (minor):** the list card is ordered by and dated with `created_at`, while the post page shows `published_at`, so a Claude post drafted days before it went live shows two different dates.

## 7. Gates on `3e660c5`

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, no output |
| `npm run chaos:static` | exit 0, total 0, NEW 0, "no new violations" |
| `npm run build` (rig env) | exit 0; `/blog` ISR 5m, `/blog/[slug]` SSG, `/sitemap.xml` static, five `/api/articles/*` dynamic |
| `npm run test:e2e -- tests/articles-ingest.spec.ts tests/seo-draft-guardrails.spec.ts tests/seo-suggestions-ui.spec.ts --project=chromium` (rig env files moved aside) | exit 0, 27 passed, 14 skipped (live-backend tests skip by design) |
| Live: `tests/articles-ingest.spec.ts` on the production build with `E2E_ISR=1` | 28 passed, 1 skipped |

## 8. The builder's choices and left-out items

| Item | Verdict | Reason |
| --- | --- | --- |
| `action_id` design | ACCEPT with F1 | Item 4. |
| "Apply to live post" button added to the SEO dashboard | ACCEPT | The route existed without UI; RM6 needs a human path. |
| Publishing from list, editor and cron stamps `published_at` | ACCEPT | Needed for SEO2 `datePublished`. |
| Row caps on `/blog` (200), admin list (500), publish cron (50) | ACCEPT | Bounded reads; 200 posts is far above today's count. |
| `supabaseRestPagedCapped` | ACCEPT | Caller-chosen window can no longer page the whole table. |
| Deleting `maintainedArticles.ts`, `buildFactLockText`, `buildDraftInstruction`, `_shared/internalLinks.ts` | ACCEPT | Used only by removed code; typecheck and lint clean. |
| Local-columns migration as a new dated file `20261030000001_blog_posts_local_columns.sql` | ACCEPT | Each statement is `ADD COLUMN IF NOT EXISTS` inside a table-exists guard, so it is a no-op on production; a new version also reaches preview branches and the shared rig, which an edit to the already-applied `00000000000001` fixups version would not (the reason `1ae7720` used a new version). `docs/local-rig.md` should be updated in the same PR: its rule says dashboard objects go only in the fixups file, and its last line still says `blog_posts.title` is missing. |
| Privacy policy section 5.1 still names OpenAI for site content | ACCEPT leaving it, **needs Alex** | It is a legal disclosure; after this deploy no OpenAI call remains and articles are written with Claude Code (Anthropic). Alex has to approve new wording before or with the deploy, and decide whether past OpenAI-made images on existing posts still need a mention. |
| TG and the real publish guard left to slice G | ACCEPT as scope, with the merge condition | The stub is clearly marked and pinned by a spec, but it must not run in production alone (item 5). |
| Admin editor and list still write from the browser | ACCEPT | PG4 in slice G is the natural place; they now revalidate. |
| `/blog` still ordered by `created_at` | ACCEPT for now | Order unchanged on purpose; see the date mismatch in item 6 for slice G. |
| Panel prompt names the articles skill that ships in slice G | ACCEPT | The raw commands are shown too. |
| `docs/codemap/*` not edited | ACCEPT | Generated; regenerate at merge. |

Not found by the builder, follow-up: `supabase/functions/publish-scheduled-articles` still publishes scheduled posts without `published_at` and without revalidation.
Nothing in the repo invokes it; if a dashboard cron does, it races `/api/cron/publish`. Check the Supabase dashboard and delete it or align it.

## What the builder must fix

1. F1: refuse a failed fact-lock draft on the publish path (shared with Apply), with a spec.
2. Merge condition: do not deploy slice F to production before slice G, or make the stub fail closed outside tests; planner resolves the `review_hold` contract conflict with SEC4.
3. SEO tab at 390 px: no overlap between the "Draft with Claude Code" button and the status pill, readable title.
4. Blog list at 390 px: the "From Claude Code" badge on one line.
5. Correct the 500 paragraph in `slice-f-build.md` to the conditional finding in item 4.
6. Update `docs/local-rig.md` for the dated-migration placement and the now-present blog columns.
