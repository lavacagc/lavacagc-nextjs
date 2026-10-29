# Slice G review - publish guard, Telegram unpublish link, articles skill

Reviewer: Opus (independent reviewer, slice G).
Builder: a different Opus agent.
Branch reviewed: `phase2/slice-g` at `3a4fabe` (includes slice F's accepted fix round `3bcce53`, merged in `09d38f7`).
Rig: the shared local Supabase (API `http://127.0.0.1:55421`, every migration applied including `20261030000002_content_facts_claims.sql`), rig env copied to `.env.local` and `.env.development.local`, production build (`npm run build`, then `next start -p 3124`).
All my rows used the `review-g-` prefix and were deleted at the end (20 posts and my admin user `review-g@local.test`).

## Verdict

**REJECT, with a short fix list (four small items).**
Every contract behaves as documented when driven by hand: all fourteen PG cases, SEC4, the full TG1 to TG4 sequence, the slice F merge and the SK2 dry run.
What blocks is one hole in the price detector that the contract names explicitly, one live spec that is flaky on the production build because of the token's one-second precision, one UI message Alex never gets to see, and a spec that deletes other agents' rate-limit buckets on the shared rig.
None of them needs a redesign; a fix round of an hour or two should turn this into an ACCEPT.

| Item | Verdict |
| --- | --- |
| 1. PG1 to PG5 (code, tests, CLI on the production build) | PASS, except fix 1 (`costs 2000` passes) |
| 2. PG3 and PG4 in a real browser (iPhone 13 and desktop) | PASS, fix 3 (override toast is overwritten) |
| 3. SEC4 as clarified | PASS |
| 4. TG1 to TG4, noindex, analytics, bot-filter exemption | PASS on behaviour; fix 2 (flaky TG2 spec, one-second token precision) |
| 5. SK1 to SK3, SK2 dry run | PASS; unclear spots listed as advisories |
| 6. Merge of slice F (fact-lock 422 first, then the guard) | PASS |
| 7. Gates | typecheck, lint, chaos:static, stub subset PASS; live specs 1 failure in 4 runs (fix 2) |
| 8. Builder's open points | bot filter ACCEPT, catalog from code ACCEPT, Union county ACCEPT with a note |

## 1. PG1 to PG5

### Code and unit tests

I read `src/lib/articles/publishGuard.ts` end to end.
The order is the contract's: `validateDraft`, price, legal, shape.
It scans the title, every markdown block, FAQ questions and answers, the meta title, and the excerpt or meta description when they are not a copy of the body.
Link targets and markup are stripped before scanning, so `/blog/save-20-percent` is not a claim.
A price is allowed only when every amount in the claim equals a `priceDisplay` of a service named in the same block.
A legal keyword is allowed only inside the verbatim text of a locked `claim_*` fact.
The PG1 unit tests in `tests/articles-publish-guard.spec.ts` cover every contract pattern and keyword and pass.

### By hand through the CLI, production build, one post per case

Each case was `node scripts/ingest-article.mjs create ... --site http://localhost:3124`, then `publish`, then a `psql` read of the row.
Every post had the same 40-word opening, an H2, three internal links and the locked phone, except where the case changes one of them.

| Case | Publish exit | Reason printed (and stored in `review_hold`) | Row |
| --- | --- | --- | --- |
| `$4,500` | 2 | `Price claim: "$4,500" in paragraph 3` | draft, hold set |
| `from $2,095` in a paragraph naming "Cabinet repainting" | 0 | none, published, unpublish link printed | live |
| `from $2,095` in a paragraph naming no service | 2 | `Price claim: "from $2,095" in paragraph 3` | draft, hold set |
| `starting at` | 2 | `Price claim: "Prices starting at 3" in paragraph 3` | draft, hold set |
| `per square foot` | 2 | `Price claim: "per square foot" in paragraph 3` | draft, hold set |
| `50% off` | 2 | `Price claim: "50% off" in paragraph 3` | draft, hold set |
| `warranty` | 2 | `Legal claim: "warranty" in paragraph 3 ("Every job comes with a two year warranty on the finish.")` | draft, hold set |
| `fully code compliant` | 2 | `Legal claim: "code compliant" in paragraph 3 (...)` | draft, hold set |
| `permit` | 2 | `Legal claim: "permit" in paragraph 3 (...)` | draft, hold set |
| `licensed and insured` (seed `claim_insurance` is unlocked today) | 2 | `Legal claim: "insured" in paragraph 3 ("...General Contractors is licensed and insured.")` | draft, hold set |
| 20-word opening | 2 | `Answer-first: the opening paragraph has 20 words; it needs 25 to 70.` | draft, hold set |
| No H2 | 2 | `No H2 section heading ("## ..."); add at least one.` | draft, hold set |
| Title "How long does cabinet painting take", no FAQ | 2 | `Question-style title needs a FAQ with 2 to 6 items; it has 0.` | draft, hold set |
| Clean post (PG5) | 0 | none; `Telegram to Alex: not_configured`; `/blog/<slug>` 200 | live |

The held posts answered 404 on `/blog/<slug>`; every reason is a plain sentence naming the matched text.
With a locked `claim_insurance` (probe below) the verbatim sentence passes, so "allowed once Alex locks it" holds.

### Probing past the contract list (pure function, via `jiti`, catalog from code)

| Text | Result | Judgement |
| --- | --- | --- |
| `A small bathroom costs 2000 or more.` | PASS | **Defect, fix 1.** The year exemption `(?!(?:19\|20)\d\d\b)` in `PRICE_WORD_RE` also exempts every bare amount from 1900 to 2099 after a price word; the contract says "costs ... followed within 40 characters by a number" is a claim. |
| `A small bathroom costs 1950 or more.` | PASS | Same defect. |
| `Save $2,095 on cabinet repainting this month.` | PASS | Advisory: a dollar discount that happens to equal the catalog price passes; the contract only lists percentages for discounts. |
| `Cabinet repainting is $2,095 and a full bathroom is $2,095 too.` | PASS | Advisory: the allowance is per paragraph, not per mention. |
| `Exterior painting is $2.95 per linear foot.` | PASS | Advisory: the unit is not compared with the catalog's (`/ sq ft`). |
| `Get twenty percent off`, `half off` | PASS | Advisory: worded percentages are outside the contract's patterns. |
| `It is not true that La Vaca General Contractors is fully insured.` (with the fact locked) | PASS | Advisory: the locked sentence is masked as a substring, not compared as a whole sentence. |
| `Kitchen remodel cost of 2026 trends.` | PASS | Correct (the intended year exemption). |
| `Gutter cleaning is $349.` | HOLD | Correct ($349 is drywall patching's price, not gutter cleaning's). |
| `Cabinet repainting is $2,095 and a kitchen remodel is $45,000.` | HOLD on `$45,000` only | Correct. |

## 2. PG3 and PG4 in a real browser

Scripted Playwright (Chromium, `bypassCSP` because the production CSP blocks `127.0.0.1` for sign-in, as `docs/local-rig.md` says), against the production build, signed in as a fresh rig admin.
Two posts per device were created through the token: one with `lifetime warranty` and `costs $4,500` (editor), one with `save 20%` and `fully insured` (list).

| Step | Desktop 1440 x 900 | iPhone 13 |
| --- | --- | --- |
| Editor: switch Published on, Save | `/api/admin/articles/<id>/publish` 409; panel "Held for review" lists both reasons with "Publish anyway"; toast "Saved as a draft. 2 things to check"; row draft with `review_hold` | same |
| "Publish anyway" | 200 `{ overridden: true }`; row `published = true`, `review_hold = null`, `review_override.by = f4222a67-...` (the signed-in admin's GoTrue id), with the reasons and time | same, own admin id |
| List: Publish on the held post | 409; toast "Held for review - Price claim: "save 20%" in paragraph 3 (and 1 more). Opening the editor."; the editor opens on that post with the hold panel; row stays a draft | same (card layout) |
| Horizontal scroll | `scrollWidth` 1440 of 1440 | 390 of 390 |
| Console errors | only the two expected 409 resource lines | same |

Screenshots (all under `docs/phase-2/reports/shots/`):
`slice-g-review-desktop-editor-held.png`, `slice-g-review-desktop-publish-anyway.png`, `slice-g-review-desktop-list-before.png`, `slice-g-review-desktop-list-toast.png`, `slice-g-review-desktop-list-opened-editor.png`, and the same five with `iphone13`.

Judged as Alex would:

- The hold panel is clear, readable on the phone, and the button is easy to hit.
- **Fix 3:** after "Publish anyway" the editor's own toast ("Published anyway - your override is recorded") is replaced at once by AdminContent's generic "Success - Blog post saved successfully!" (`src/components/AdminContent.tsx` `onSave`, and `TOAST_LIMIT = 1` in `src/hooks/use-toast.ts`).
  Alex never sees that his override was recorded, and the same happens to the plain "Published" toast.
  See `slice-g-review-*-publish-anyway.png`.
- Advisory: "paragraph 3" counts the `## What to expect` heading as a paragraph, so the claim is in what Alex sees as the second paragraph.
  Naming the section ("under 'What to expect'") or counting text paragraphs only would make reasons easier to find.
- Advisory: the published post's list card shows no sign that it went live over a hold; a small "Overridden" note would make `review_override` visible.

## 3. SEC4 as clarified

All against the production build with the ingest token, on a held post and a live post.

| Check | Result |
| --- | --- |
| Token publish with `{"override": true}` | 400 `Unrecognized key: "override"` |
| Token publish with `{"review_hold": null}` | 400 |
| Token PATCH with `{"review_hold": null}` | 400 |
| Token create with `review_hold` | 400 |
| Token on `POST /api/admin/articles/<id>/publish` with override | 401; no auth at all: 401 |
| Held post after all of the above | still `published = false`, hold set, `review_override` null |
| Token re-publish of the held post, content unchanged | 409 with the same reason; still held |
| Token PATCH adding `"Fully licensed and insured, from $1,999."` as the excerpt of the live post | 409 `{ published: true, changed: false, hold: [price, legal] }`; `md5(row)` identical before and after |
| Token PATCH adding "with a lifetime warranty" to the live post's title | 409, row hash unchanged |
| Token PATCH of keywords only on the live post | 200 |

A hold clears only by a passing guard (item 6) or the admin override (item 2).
Advisory: the admin editor still writes an edit of an already-live post straight from the browser, so the admin can add a claim to a live post with no guard and no `review_override` record.
The contract scopes the guard to publishes, and only an admin session can do it, so this is not a SEC4 failure, but routing live edits through the admin route would give Alex the same audit trail.

## 4. TG1 to TG4

### Message text (mocked-fetch specs, read and run)

- Publish: `New article published: <title> <url>\nUnpublish: <signed link>`, sent to `api.telegram.org/bot<token>/sendMessage`, `parse_mode: HTML`, title HTML-escaped, `disable_web_page_preview: true`.
- Hold: `Article held for review: <title> <adminUrl>` then the first three reasons as `- ...` lines and `(2 more in the admin)`.
- Unpublish confirmation: `Article unpublished: <title> <url>`.
- Not configured: nothing is sent and the outcome is `not_configured`; with no secret the message says plainly there is no one-tap link.
- The admin URL `/vaca-mgmt?tab=blog&post=<id>` opens that post's editor (`AdminContent.tsx` reads `post`).

### Live, production build (Telegram not configured, link printed by the CLI)

| Step | Result |
| --- | --- |
| Publish response | `unpublish_url` present, `telegram: not_configured` |
| GET the link, twice | 200 both times; `X-Robots-Tag: noindex, nofollow`, `cache-control: no-store`, `<meta name="robots" content="noindex, nofollow">`, `<meta name="referrer" content="no-referrer">`, one `<button>`, no script at all; row still live with the same `published_at` |
| GET with `curl`, `HeadlessChrome`, `python-requests`, `TelegramBot` user agents | 200 each, row still live (a bot GET changes nothing) |
| Tamper the last signature character, GET and POST | 410, 410 |
| Tamper the first payload character, POST | 410; row still live |
| Press the button (form POST) | 200, heading "Unpublished"; row `published = false`; `/blog/<slug>` 404; `/blog` and `sitemap.xml` (warmed before) no longer list it on the next request |
| Reuse the link, GET and POST | 410, 410 |
| Republish with the CLI | new `published_at`, new link; old link GET 410 and POST 410; new link 200 |
| iPhone 13 browser | confirm page, "Unpublished" page and "This link no longer works" page render cleanly, zero third-party requests (`slice-g-review-iphone13-unpublish-confirm.png`, `-done.png`, `-gone.png`) |

Analytics: `/articles/unpublish/` is in `ANALYTICS_EXCLUDED_PATTERNS` and `PRIVATE_TOKEN_PATHS`, and the page is a bare route-handler document outside the site layout, so nothing loads; robots.txt disallows `/articles/`.

Bot-filter exemption, judged: **ACCEPT.**
It is two exact prefixes, `/articles/unpublish/` and `/api/articles/unpublish/`.
With a bad-bot user agent, `/articles/unpublish/../../blog` (raw path), the `%2e%2e` form, `/api/articles/unpublish/../seo-feedback`, `/api/articles/ingest` and `/articles/unpublishX` all still answer 403, so the exemption does not leak.
A GET is read only (source and live), and the POST needs a valid HMAC for a still-live publication plus the 10-a-minute rate limit, so the user-agent filter adds nothing there.

Findings:

- **Fix 2:** the token carries `published_at` in whole seconds.
  If a post is unpublished and republished within the same second as the publish the link was minted for, the new `published_at` truncates to the same second and the used link works again.
  The live spec `TG2` does exactly that sequence and failed on my first production-build run (`expect(again.unpublish_url).not.toBe(liveLink)`), then passed three times in a row: a timing-dependent flake.
  In production a human cannot hit that window, but the spec is flaky and the guarantee "a republish invalidates old links" should not depend on the clock.
- Advisory: the handler sets `Referrer-Policy: no-referrer`, but the response carries `strict-origin-when-cross-origin`, the global header from `next.config.ts`.
  The `<meta name="referrer">` and `rel="noreferrer"` still protect the token in a browser; either make the header win or drop the claim from the comment.
- Advisory: after "Unpublish" the address bar holds the POST URL, so a reload resubmits and shows "This link no longer works", which reads like a failure; a redirect to a GET "done" page would avoid it.

## 5. SK1 to SK3 and the SK2 dry run

SK1: `.claude/skills/articles/SKILL.md` is 94 lines with `references/grill.md` (52) and `references/aeo-local-seo.md` (28). PASS.
SK3: the grill's source table names `content_facts` keys, `COUNTIES`, the `service_area` sentence and the feedback endpoint. PASS.

SK2, followed literally with the CLI alone against the production build:

1. `feedback --summary` printed the window, zero pages, zero actions, zero candidates, the five locked facts and `Counties: Essex, Morris, Bergen`.
2. Nothing in the target list applied on an empty rig, so I took rule 1 as if Alex had asked for "when to clean gutters".
3. Drafted `article.md` (title "When should you clean gutters in Essex County?", 50-word opening naming Essex County, Montclair and Maplewood, four H2 sections, links to `/home-services/gutter-cleaning`, `/home-services`, `/locations/montclair`, `/free-estimate`, the `service_area` fact sentence, the locked phone, and "Gutter cleaning starts at $279 for a single-story home" in the paragraph naming the service) and a three-item `faq.json`.
4. Grilled it: one sentence ("flushes every downspout") did not match the service page ("Downspouts tested for flow"), so I rewrote it.
5. `create --file article.md --category "Gutter cleaning" --faq faq.json` printed the id, preview and admin links (I added `--slug review-g-...` only for the rig prefix).
6. `publish <id>`: exit 0 on the first try, URL, unpublish link, `Telegram to Alex: not_configured`.
   The page renders `BlogPosting` with `datePublished`, `FAQPage` with three questions, and the service-area sentence (`slice-g-review-iphone13-sk2-article.png`).

SEO3 on that article: a town (Montclair, Maplewood), a county (Essex) and the service-area sentence are present. PASS.

Where the skill was unclear or wrong (advisories, none blocks SK2):

- Step 3 says "town and county names from `COUNTIES`", and the local-SEO checklist says "at least one town and one county from `counties`", but `counties` holds counties only; where town names come from is only implied by the grill ("towns must sit in one of them").
- Step 2 has no rule for an empty feedback (no actions, no decaying pages, no candidates) and no topic from Alex.
- It never says where to write `article.md` and `faq.json`; written in the repo root they are left untracked in the working tree. Say "a scratch folder".
- The grill allows a town "in the `service_area` sentence", which names Union county, while `COUNTIES` does not include Union; a Union town would pass the grill for home services La Vaca does not offer there (see item 8).
- The service page shows "Two story from $349" as well as "$279"; the skill says "a starting price exactly as `/home-services` shows it", and the guard holds the $349. Say "the starting price only".
- `--site` defaults to production; the skill says to pass it on the rig, which is right, but a one-line warning that a dry run without it publishes to the live site would be worth its space.
- Reason positions count headings as paragraphs (item 2), which the skill should mention in step 6 so Claude finds the text.

## 6. The merge of slice F

`src/app/api/articles/ingest/[id]/publish/route.ts`: `validateDraft` on the content that would go live runs first and answers 422 with nothing written, then `runPublishGuard` on the same candidate, then the publish.
Live: a post with a wrong phone and a `$4,500` claim answered 422 naming only the phone, with `review_hold` still null (fact-lock first).
The dropped "always refuse a held post" check: the held `$4,500` post re-published unchanged stayed held with 409; after `patch` removed the price (the patch kept the hold), `publish` exited 0, the row went live with `review_hold = null` and `review_override = null`.
Slice F's specs (`tests/articles-ingest.spec.ts`, 32 live tests including `Fix round 1 (SEC4)`, `Fix round 1: a refresh draft the fact-lock rejected`, ART7 and ART8) all passed on the merged head on the production build.
PASS.

## 7. Gates on `3a4fabe`

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, no findings |
| `npm run chaos:static` | total 0, baselined 0, NEW 0 |
| `npm run build` (rig env) | exit 0 |
| `TEST_URL=http://localhost:3124 E2E_LIVE_BACKEND=1 E2E_ISR=1 playwright test tests/articles-publish-guard.spec.ts tests/articles-ingest.spec.ts --project=chromium` (production build) | run 1: 100 passed, **1 failed (TG2, fix 2)**, 3 did not run (serial after the failure), 1 skipped (ART1 over HTTP, stub only) |
| Same, guard spec alone, three more runs | 73 passed each time |
| `npm run test:e2e -- tests/articles-publish-guard.spec.ts tests/articles-ingest.spec.ts tests/seo-*.spec.ts tests/privacy-policy.spec.ts tests/lead-intake.spec.ts tests/admin-dashboard.spec.ts tests/admin-nav-simplified.spec.ts tests/project-drafts.spec.ts tests/flows.spec.ts --project=chromium` (`.env.local` moved aside) | exit 0, 238 passed, 40 skipped (live-backend specs), matching the builder's numbers |

**Fix 4 (rig hygiene):** `clearRateLimits` in both live specs deletes every `articles:*` and `article-unpublish:*` row in `rate_limits`, not only the spec's own IP (`cf-connecting-ip` is already per run).
On the shared rig that wipes other agents' buckets, which can make an ART7-style "31st call gets 429" test pass or fail by accident elsewhere; my own run wiped the rig's `articles:::1` bucket this way.

The worktree's `.next` is now the stub build from `test:e2e`; run `npm run build` before serving it against the rig again.

## 8. The builder's open points

| Point | Verdict | Reason |
| --- | --- | --- |
| Narrow bot-filter exemption for the two unpublish paths | ACCEPT | Exact prefixes, traversal normalised before the check (403 verified), GET read only, POST guarded by HMAC, live `published_at` and a rate limit (item 4). SEC2 asks for it. |
| Catalog prices read from code until slice E merges | ACCEPT | It fails closed: if the admin changes a price in E's table, the guard holds the new price and allows only the code one, which costs Alex a tap, never a wrong price on the site. The follow-up (`docs/phase-2/follow-ups.md` line 27) must be done in the same release that ships E and G together. |
| `service_area` names Union county, `COUNTIES` does not | ACCEPT leaving it to Alex | It is a business fact, not the builder's to change. Until Alex decides, the grill's "or in the `service_area` sentence" should go, so `COUNTIES` alone decides which towns an article may target (advisory in item 5). |

## Fix list

1. `src/lib/articles/publishGuard.ts` `PRICE_WORD_RE`: exempt a four-digit year only where it reads as a year (for example preceded by `in`, `for`, `of`, `since` or followed by nothing numeric, or equal to `current_year` plus or minus a few), so `costs 2000` and `costs 1950` are held; add both to the PG1 tests next to the existing "a year is not a price" case.
2. Make a republish always invalidate earlier links regardless of timing: carry milliseconds in the token, or have `publishArticle` and the cron stamp a `published_at` whose whole second differs from the previous one; keep the TG2 spec's back-to-back sequence so it proves it, and run it several times on the production build.
3. After "Publish anyway" (and a plain editor publish) Alex must see the editor's message: let `onSave` accept the message, or skip AdminContent's generic toast when the editor already showed one.
4. Scope `clearRateLimits` in `tests/articles-publish-guard.spec.ts` and `tests/articles-ingest.spec.ts` to the spec's own buckets (`articles:<ip>`, `article-unpublish:<ip>`, and whatever the local `::1` / `127.0.0.1` callers use in that run).

Advisories (worth doing, not blocking): reasons that name the section instead of a paragraph count that includes headings; the referrer header the handler sets is overridden globally; a redirect after the unpublish POST; live admin edits through the guard with an audit record; the skill clarifications in item 5; the guard leniencies in the probe table; and, outside this slice, the blog post's meta row (category pill, date, author) wraps awkwardly on iPhone 13 (`slice-g-review-iphone13-sk2-article.png`).

## Spec text

No spec change was needed; the acceptance criteria were consistent with what I tested.

## Re-review of `5cadc09`

Head reviewed: `5cadc09` on `phase2/slice-g` (fix round 1 on top of this review's `f8ac613`, with slice E merged through `4ddfa0f`).
Same rig and env as above; a fresh production build (`npm run build`, exit 0) served on port 3124.
My rows (`review-g-` posts, my admin user, my two `198.18.x` rate-limit buckets) were deleted afterwards.

### Verdict: **ACCEPT**

All four fixes hold under my own checks, slice E's table now drives the price allowance, the skill took all seven notes, and every gate is green, including TG2 five runs in a row on the production build.

### 1. The price hole

Pure probe (`checkPublishable` with the seed catalog) and the same cases through the CLI on the production build:

| Text | Result |
| --- | --- |
| `A small bathroom costs 2000 or more.` | held, `Price claim: "costs 2000" in paragraph 3` (CLI exit 2, row a draft with the hold) |
| `costs 1950` | held, `"costs 1950"` |
| `Expect a cost of 2000 for a small bath.` | held, `"cost of 2000"` |
| `Save $2,095 on cabinet repainting this month.` | held, `"Save $2,095"` |
| `Exterior painting is $2.95 per linear foot.` | held, `"$2.95 per linear foot"` |
| `Get twenty percent off this month.` | held, `"twenty percent off"` (and `half off` too) |
| `In 2026 most homeowners in Essex County repaint before spring.` | published |
| `The cost of a kitchen remodel in 2026 depends on size.` | published |
| `Cabinet repainting starts at $2,095`, `Exterior painting starts at $2.95 / sq ft` and `per square foot`, `Gutter cleaning starts at $279` | pass (pure probe) |
| Locked `claim_insurance` sentence on its own, or after another sentence | pass; the same words after "It is not true that" are held |

The side effect: the title `Kitchen remodel cost of 2026 trends` is now held (`"cost of 2026" in the title`, and again `in the meta title`, because the meta title defaults to the title).
Judgement: acceptable.
It is a false hold, which costs Alex one tap or Claude one rewrite, never a false pass, and the usual wordings pass: "Kitchen remodel costs in 2026", "The cost of a kitchen remodel in 2026", "2026 kitchen remodel cost guide".
The grill now tells Claude that a year-shaped number after a price word counts.
Cosmetic, not blocking: the same claim is listed twice when the meta title is a copy of the title, and `Take $2,095 off ...` is reported as `"$2,095"` without the "off".

### 2. The publish nonce

`publishArticle` and the cron stamp a 128-bit `publish_nonce` on every draft-to-live publish; the token carries it and `isTokenCurrent` requires the live row's nonce.
Live, three rounds of: unpublish by the token route, publish, press the one-tap link (200), republish at once.
In all three rounds the old and new tokens carried the same publish second (`1793293789`), the links differed, the old link answered 410 on GET and POST, and the new one 200; the row was live with a new nonce each time.
`TG2` (back-to-back unpublish and republish) passed in 5 consecutive runs of `tests/articles-publish-guard.spec.ts` on the production build (77 passed each run).

### 3. The override message

Production build, desktop and iPhone 13, signed in:

| Path | Toast seen |
| --- | --- |
| "Publish anyway" | "Published anyway - Published over the review hold; your override is recorded.", still the only toast 2.1 s later on the list; row has `review_override.by` = my admin id |
| Ordinary save of a draft | "Success - Blog post saved successfully" (from the editor itself) |
| Ordinary publish of a clean post from the editor | "Published - Blog post saved and published." |

So the generic AdminContent toast is gone on every path, and every path still confirms with the editor's own message.
Screenshots: `slice-g-rereview-desktop-publish-anyway-toast.png`, `slice-g-rereview-iphone13-publish-anyway-toast.png`, `slice-g-rereview-desktop-plain-save-toast.png`, `slice-g-rereview-iphone13-plain-save-toast.png`.

### 4. Spec cleanup

Read the hooks: `tests/articles-publish-guard.spec.ts` picks one random `198.18.x.y` per run, sends it as `cf-connecting-ip` on every rate-limited call (the browser's unpublish POST included, through `setExtraHTTPHeaders`), and `clearRateLimits` deletes `ip_address=in.("articles:<ip>","article-unpublish:<ip>")` only.
`tests/articles-ingest.spec.ts` does the same for its run IP and ART7's burst IP.
After seven live runs, the rig's `articles:::1` bucket (made by my CLI) was still there with its count, so other buckets survive; the specs left no `slice-g-%` posts.

### 5. Catalog prices from the table

Through the Services & Prices editor in the browser (`slice-g-rereview-catalog-edit.png`):

| Step | Result |
| --- | --- |
| Before the edit, a post quoting "Cabinet repainting starts at $2,195" | 409, held |
| Set the starting price to 2195 and Save | table `price_display_en/es = $2,195`, `starting_price_cents = 219500` |
| New post at $2,195 | 200, published (the cache tag was invalidated; no wait) |
| New post at the old $2,095 | 409, `Price claim: "starts at $2,095" in paragraph 3` |
| Restore 2095 through the same editor | `$2,095`, `209500`; every column equal to the pre-edit row |
| New post at $2,095 after the restore | 200 |

All seven `home_services` rows compared with `contentToRow(HOME_SERVICES_SEED[i])`: 0 differing fields (ignoring `updated_at`, `updated_by` and jsonb key order).

### 6. The skill

`SKILL.md` is 98 lines.
All seven notes are in: the `--site` warning, a scratch folder outside the repo, a rule for an empty feedback, towns only inside a county from `counties` (Union does not widen it, in SKILL.md and the grill), the main starting price only and never inside saving wording, and how "paragraph N" counts.

### 7. Advisories not taken

| Advisory | Leaving it acceptable? |
| --- | --- |
| Reasons name a paragraph number instead of the section | Yes. The reason quotes the matched text, and the skill now explains the count. |
| The global `Referrer-Policy` overrides the handler's `no-referrer` | Yes for now. The page's `<meta name="referrer" content="no-referrer">` and `rel="noreferrer"` keep the token out of referrers in every browser; the comment in `unpublishPage.ts` still overstates the header, which is a follow-up. |
| Redirect after the unpublish POST | Yes. A reload shows "This link no longer works", which is true and changes nothing. |
| Admin edits of a live post through the guard | Yes. Only an admin session can do it, the contract scopes the guard to publishes, and Alex can already publish anything with "Publish anyway"; worth a follow-up for the audit trail. |
| An "Overridden" note in the list | Yes. `review_override` is recorded; showing it is polish. |

One new observation, not blocking: `publish_nonce` was added by editing `20261030000002_content_facts_claims.sql` rather than in a new dated migration, which `docs/local-rig.md` asks for.
It is safe here because that migration has never left this branch (not on `main`, not in production, listed in `follow-ups.md` to apply with the release), and the shared rig got the column by re-applying the file.
Any other database that ran the earlier version of 0002 would lack the column, and every article route would fail on its select, so check before the release that nothing but the rig ran it.

### Gates on `5cadc09`

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run chaos:static` | total 0, baselined 0, NEW 0 |
| `npm run build` (rig env) | exit 0 |
| `TEST_URL=http://localhost:3124 E2E_LIVE_BACKEND=1 E2E_ISR=1 playwright test tests/articles-publish-guard.spec.ts tests/articles-ingest.spec.ts --project=chromium` (production build) | 108 passed, 1 skipped (ART1 over HTTP, stub only) |
| The guard spec alone, 5 runs in a row, same build | 77 passed each time |
| `npm run test:e2e -- <the slice G stub subset> tests/home-services-catalog.spec.ts --project=chromium` (`.env.local` aside) | exit 0, 253 passed, 49 skipped (live-backend specs) |

The worktree's `.next` is the stub build from `test:e2e` again.
