# Slice G build report - publish guard, Telegram unpublish link, articles skill

Builder: Opus (builder slice G).
Planner: Fable.
Branch `phase2/slice-g`, cut from `phase2/slice-f` at `3e660c5`, then merged with slice F's fix round (`3bcce53`) in `09d38f7`.
Nothing here is marked done by the builder; the reviewer decides each AC.

## Evidence per acceptance criterion

All spec names are in `tests/articles-publish-guard.spec.ts` unless another file is named.
"Live" means against the local Supabase rig, run twice: `next dev` on port 3118, and a production build (`npm run build && next start -p 3119`) with `E2E_ISR=1`, where pages are cached, so "on the next request" is proven rather than an uncached render passing by accident.
Telegram is not configured on the rig; the message text and link are proven by specs that mock `fetch` and capture the outgoing request, and the live routes report `telegram: not_configured`.

### PG - publish guard

| AC | Evidence | Result |
| --- | --- | --- |
| PG1 | Pure `PG1: checkPublishable`: 18 price-pattern tests (every contract pattern, plus a trailing comma), 20 legal-keyword tests, `a catalog price for the service the paragraph names is allowed; the same amount for another service is not`, `a range is one claim, and a year is not a price`, `a locked fact sentence passes; the same words unlocked, or any other legal sentence, do not`, `claims are found in the title, the FAQ and the meta fields too, not in link targets`, `answer-first, H2 and FAQ shape checks fire on a bad shape`, `reasons come in contract order`. | pass |
| PG2 | Live `PG2: a Claude publish with a price claim is a 409 with the reasons; the post stays a draft with review_hold; Telegram is reported` (409, `hold: ['Price claim: "from $9,000" in paragraph 3']`, `telegram: not_configured`, row unpublished with the same reasons, public page 404). Message text: `PG2: the held message names the post, the admin link and the first three reasons` (mocked fetch, exact text, `(2 more in the admin)`). | pass (dev and production build) |
| PG3 | Live `PG3: the editor shows the hold reasons, and "Publish anyway" publishes and clears the hold with the admin id`: the panel lists the reason, the button calls `/api/admin/articles/<id>/publish` with `override`, the row has `review_hold = null` and `review_override.by` equal to the signed-in admin's GoTrue id. Screenshot `docs/phase-2/reports/shots/slice-g-hold-panel.png`. | pass |
| PG4 | Live `PG4: the guard holds an admin publish from the editor (reasons inline) and from the list toggle (toast, then the editor)`: editor Save with Published on gives 409 and the reasons inline; list Publish gives the "Held for review" toast and opens the editor on that post; a clean post still publishes from the editor (`overridden: false`). | pass |
| PG5 | Pure `PG5 baseline` (exactly 40-word opening, three internal links, the locked phone, no claims: `{ ok: true, reasons: [] }`); live `PG5 + TG4`. | pass |

### TG - Telegram unpublish

| AC | Evidence | Result |
| --- | --- | --- |
| TG1 | Mocked fetch `TG1: the publish message carries the title, the URL and the signed unpublish link` (exact text, URL `api.telegram.org/bot<token>/sendMessage`, HTML parse mode, the link verifies). Live `PG5 + TG4` checks `unpublish_url` equals the link signed for that id and `published_at`; live `TG1` opens it in the browser, sees title, slug and one button, clicks Unpublish, sees "Unpublished", the row is down, and on the production build `/blog`, the post and `sitemap.xml` drop it on the next request (warmed first in `PG5 + TG4`). Screenshots `slice-g-unpublish-page.png`, `slice-g-unpublished.png`. | pass (dev and production build) |
| TG2 | Pure `TG2 (pure)` (tampered payload, tampered signature, wrong secret, malformed, expired at 7 days, no secret, unpublished, republished). Live `TG2`: used link 410 on GET and POST, republished post makes the old link 410 and the new one 200, tampered 410 with the "no longer works" page, expired (`published_at` 8 days back) 410; the post stays live through all of it. Phone screenshot `slice-g-unpublish-gone-iphone13.png`. | pass |
| TG3 | Live `TG3: a GET to the link never unpublishes (fetched twice, still live)`, with `X-Robots-Tag: noindex, nofollow` and `no-store`. Source `TG3 (source): the GET handler never writes; only the POST unpublishes`. | pass |
| TG4 | Live `PG5 + TG4` (publish 200 with `telegram: not_configured`); mocked `TG4: not configured sends nothing and says not_configured`. | pass |

### SK - Claude Code skill

| AC | Evidence | Result |
| --- | --- | --- |
| SK1 | `SK1: SKILL.md exists with its two references and is under 120 lines` (94 lines; `references/grill.md`, `references/aeo-local-seo.md`; every step has its CLI command). | pass |
| SK2 | Reviewer's dry run. Builder rehearsal on the rig: `feedback --summary` printed the window, the locked facts and the counties; a gutter-cleaning article written to the skill was created and published with the CLI alone (exit 0, URL, unpublish link, `Telegram to Alex: not_configured`); a patch adding "from $199, fully insured" to the live post exited 2 with both reasons and changed nothing; the row was deleted afterwards. | for the reviewer |
| SK3 | `SK3: the grill checklist names its sources` (`content_facts`, `COUNTIES`, `service_area`, `/api/articles/seo-feedback`, `phone_main`, `hic_number`, `claim_`); live `SK3: the feedback the skill reads carries the locked facts (never the lead address) and the counties`. | pass |

### SEC and SEO

| AC | Evidence | Result |
| --- | --- | --- |
| SEC1 | New routes: `/api/admin/articles/[id]/publish` (middleware admin session plus its own `adminUserId` check) and `/api/articles/unpublish/[token]` (public under the existing `/api/articles/` prefix, self-guarded by the HMAC and a 10-a-minute per-IP rate limit). `npm run chaos:static`: total 0, NEW 0. | pass |
| SEC2 | `noindex` meta and `X-Robots-Tag` (live), `timingSafeEqual` (source pin), excluded from analytics and the private-page widgets like `/offer`, `/articles/` disallowed in `robots.ts`, and exempt from the bad-bot 403 (live: a `curl/8.4.0` user agent gets 200 on the link and 403 on `/blog`). See the note below on what "like /offer" means. | pass |
| SEC4 | Live `SEC4: the ingest token cannot clear a hold` (`override` on the ingest publish is a 400, the token on the admin route is a 401, `review_hold` in a patch is a 400); live `SEC4: a held post stays held on a token re-publish until its content passes; then the passing publish clears the hold`; source `SEC4 (source): only the admin-session route can override a hold`; `tests/articles-ingest.spec.ts` `Fix round 1 (SEC4)` adapted to the real guard. | pass |
| SEO3 | `SEO3: the local-SEO checklist requires a town, a county and the service-area sentence`; PG does not enforce it, as the AC says. | pass |

## What was built

- `src/lib/articles/publishGuard.ts`: the real `checkPublishable(post, facts)`, pure, in contract order (fact-lock, price, legal, shape); the stub marker is gone.
  It scans the title, every markdown block, FAQ questions and answers, the meta title, and an excerpt or meta description that is not just a copy of the opening (so one claim is not reported three times).
  Link targets, image URLs and markup are stripped first, so `/blog/save-20-percent` is not a claim and `**$9,000**` still is.
  A price is allowed only when every amount in the claim equals a `priceDisplay` of a service named in the same paragraph; the catalog comes from `src/lib/articles/catalogPrices.ts`.
  A bare year after a price word ("the cost of a kitchen remodel in 2026") is not a price; that is the most common article title on the subject.
  A legal sentence is allowed only when it is, verbatim, the value of a `claim_*` fact with `lock = true`.
- `supabase/migrations/20261030000002_content_facts_claims.sql`: `claim_license` and `claim_insurance` seeded as PLACEHOLDER wording with `lock = false` (`verified_at` is NOT NULL in the table, so the lock flag, not a null date, marks "not approved"), `ON CONFLICT DO NOTHING`; and `blog_posts.review_override jsonb` (guarded), the audit record of "Publish anyway".
- `src/lib/articles/publishFlow.ts`: the guard with its inputs, and the publish and hold announcements, shared by every path.
- Publish paths: the ingest publish route (slice F's fact-lock 422 first, then the guard on every call, Telegram on publish and hold), the new admin route `/api/admin/articles/[id]/publish` (`override` records the admin id), the editor (saves as a draft, then publishes through the admin route; hold panel with "Publish anyway"), the list (Publish through the admin route, toast and editor on a hold, "Held for review" badge), and the scheduled-publish cron (hold clears the schedule so the next run does not re-notify).
- A token `PATCH` that would change a live post runs the guard on the result and answers 409 `changed: false` without writing; this closes "publish clean, then patch a price in".
- `src/lib/articles/unpublishToken.ts`, `unpublishPage.ts`, `src/app/articles/unpublish/[token]/route.ts` (GET, read only) and `src/app/api/articles/unpublish/[token]/route.ts` (POST).
  The page is a route handler returning a complete HTML document, because only a handler can answer 410; the button is a plain form POST, so it works in Telegram's in-app browser without JavaScript.
- `src/lib/articles/notify.ts`: the three messages, HTML-escaped and clipped.
- `/api/articles/seo-feedback` now also returns `facts` (locked `content_facts`, never `email_leads`) and `counties`; the CLI summary prints both, the publish prints the unpublish link and Telegram status, and a refused live patch exits 2.
- `.claude/skills/articles/` (SKILL.md 94 lines, `references/grill.md`, `references/aeo-local-seo.md`); `docs/articles-ingest.md`, `docs/phase-2/follow-ups.md` and the `CLAUDE.md` pointer updated.

## Decisions taken where the contract was open

- "Excluded from the bot filter the way `/offer/[token]` is": `/offer` is in fact not exempt from the bad-bot 403 in `src/middleware.ts`; it is excluded from analytics (`src/lib/analytics/excluded.ts`) and the private-page widgets (`src/lib/privatePages.ts`).
  The unpublish link gets both of those, and, to meet SEC2 as written, a narrow exemption from the bad-bot 403 for exactly `/articles/unpublish/` and `/api/articles/unpublish/` (the signature is checked before any read, so the user-agent filter adds nothing there).
  The reviewer may prefer to drop the exemption; it is two lines in middleware and one spec assertion.
- The admin's own publishes send no Telegram; Claude's and the cron's do.
- A guard hold during a refresh publish (`action_id`) writes `review_hold` on the live post, which stays live and unchanged; the next passing publish clears it.
- The legal keyword list is exactly the contract's (no "insurance" or "licensed"), so a license sentence passes and `validateDraft` locks its number.

## Commands run and results

| Command | Result |
| --- | --- |
| `git reset --hard phase2/slice-f && git checkout -b phase2/slice-g` | on `phase2/slice-g` at `3e660c5` |
| `cp <scratchpad>/env.rig .env.local .env.development.local` | rig env only; Telegram unset |
| `psql postgresql://postgres:postgres@127.0.0.1:55422/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261030000002_content_facts_claims.sql`, then `NOTIFY pgrst, 'reload schema'` | applied to the shared rig (no `db reset`); two placeholder rows, `review_override` column present |
| `git merge phase2/slice-f` (fix round `3bcce53`) | conflicts in the publish route, CLI header, list and doc resolved as described in `09d38f7` |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run chaos:static` | total 0, baselined 0, NEW 0 |
| `npm run build` (rig env) | exit 0; new dynamic routes `/api/admin/articles/[id]/publish`, `/api/articles/unpublish/[token]`, `/articles/unpublish/[token]` |
| `TEST_URL=http://localhost:3118 E2E_LIVE_BACKEND=1 playwright test tests/articles-publish-guard.spec.ts tests/articles-ingest.spec.ts tests/seo-suggestions-ui.spec.ts tests/seo-draft-guardrails.spec.ts --project=chromium` (`next dev`, merged head) | 115 passed, 2 skipped (ART1 over HTTP is stub-only; ISR control is production-only) |
| `TEST_URL=http://localhost:3119 E2E_LIVE_BACKEND=1 E2E_ISR=1 playwright test tests/articles-publish-guard.spec.ts tests/articles-ingest.spec.ts --project=chromium` (production build) | 104 passed, 1 skipped (ART1 over HTTP); rerun of the slice G spec after adding the `/blog` and sitemap assertions: 73 passed |
| `npm run test:e2e -- tests/articles-publish-guard.spec.ts tests/articles-ingest.spec.ts tests/seo-*.spec.ts (7) tests/privacy-policy.spec.ts tests/lead-intake.spec.ts tests/admin-dashboard.spec.ts tests/admin-nav-simplified.spec.ts tests/project-drafts.spec.ts tests/flows.spec.ts --project=chromium` (`.env.local` moved aside) | exit 0, 238 passed, 40 skipped (live-backend specs) |
| Row check after the runs: `slice-g-%` rows in `blog_posts` and `content_actions`, and `articles:%` / `article-unpublish:%` rate-limit rows | 0 each |

The `.next` left in the worktree is the stub build from `test:e2e`; run `npm run build` before serving it against the rig again.

## Environment and secrets

| Where | Variable | Action |
| --- | --- | --- |
| Vercel Production | `INTERNAL_WEBHOOK_SECRET` (32+ characters) | must be set; it signs the unpublish links (it already guards `/api/notify/*`) |
| Vercel Production | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | already used for lead alerts; the article messages use the same chat |
| Supabase production | migration `20261030000002_content_facts_claims.sql` | apply with the release; the article routes read `review_override` |
| Supabase production | `claim_license`, `claim_insurance` | Alex writes the exact sentences and sets `lock = true` (SQL in the migration header and the follow-ups) |

No new environment variable is added.

## Left out, and why

- SK2 itself is the reviewer's dry run by definition; the builder rehearsal above is not a substitute.
- `loadCatalogPrices()` reads the code catalog (`HOME_SERVICES_CATALOG`), because slice E's `getCatalog()` is not on this branch; the follow-ups say to switch it when E merges, so an admin price change is what the guard allows.
- The Telegram messages were never sent to a real bot: the rig has none by design, and the brief forbids the production bot. The outgoing request is proven by the mocked-fetch specs only.
- The `service_area` fact names Union county, which `COUNTIES` does not; left for Alex in the follow-ups rather than changed.

## Fix round 1

Review: `docs/phase-2/reports/slice-g-review.md` (REJECT, four fixes), taken with `git merge --ff-only f8ac613`.
Then `git merge feat/phase-2-admin-catalog-articles-experiments` (Phase 2 branch at `4ddfa0f`, slice E merged), clean.

### The four fixes

| Fix | Change | Evidence |
| --- | --- | --- |
| 1. `costs 2000` passed | `PRICE_WORD_RE` now skips a 19xx or 20xx number only when it reads as a year in prose (right after in, since, during, until or through), so `costs 2000`, `costs 1950` and `cost of 2000` are claims and "the cost of a kitchen remodel in 2026" is not. Review advisories folded in: a catalog amount inside save, off, discount, rebate, deal or sale wording is a claim ("Save $2,095 on cabinet repainting" holds); a quoted unit must match the catalog's ("$2.95 per linear foot" holds for exterior painting, "per square foot" passes); worded percentages ("twenty percent off", "half off") are claims; a locked `claim_*` sentence is honoured only as a whole sentence ("It is not true that ..." holds). | `fix 1: a year-shaped number right after a price word is a price`; `fix 1 (review advisories): ...`; `a range is one claim, and a year in prose is not a price` |
| 2. Same-second republish revived an old link | Every draft-to-live publish (writer and cron) stamps a random `publish_nonce` (128 bits, new column in `20261030000002_content_facts_claims.sql`); the token is `base64url(postId.publishedAtUnix.nonce).HMAC`, and a link is current only while the live post carries that nonce. This extends the contract's token by the nonce. | Pure `fix 2: two publications in the same second get different links, and only the current one is accepted`; live `TG2` unchanged (back-to-back unpublish and republish) passed 5 runs in a row on the production build. |
| 3. Override toast replaced | `AdminContent`'s `onSave` no longer shows its generic "Blog post saved successfully!" toast; the editor already shows the result of every save (saved, scheduled, published, published anyway), and with one toast at a time the generic one replaced it. | Live `PG3` now asserts "Published over the review hold; your override is recorded." is still visible 1.5 s later and the generic toast never appears. |
| 4. Specs wiped every rate-limit bucket | `tests/articles-publish-guard.spec.ts` uses one per-run client IP in 198.18.0.0/15 on every rate-limited call (including the browser's unpublish POST, via `setExtraHTTPHeaders`) and deletes exactly `articles:<ip>` and `article-unpublish:<ip>`. `tests/articles-ingest.spec.ts` already had slice F's scoped cleanup from the merge. | After the runs: 0 `slice-g-%` posts, 0 rate-limit rows for the run's IPs. |

### Also in this round

- `loadCatalogPrices()` reads `getCatalog()` (slice E's table, active services only, cache tag invalidated on every admin save); the pure mapping takes the seed in tests.
  Live `a price edited in Services & Prices is the price the guard allows on the next publish`: $2,195 is held, the admin route sets cabinet repainting to $2,195, a new post at $2,195 publishes, a post at the old $2,095 is now held, and the seed price is restored (verified `$2,095` in the table afterwards).
- The skill takes the reviewer's seven notes (98 lines): the `--site` warning, a scratch folder outside the repo for the draft files, a rule for an empty feedback, towns only inside a county from `counties` (the Union county in the `service_area` sentence does not widen it), the main starting price only and never as a saving, and that "paragraph N" counts every block, headings included.
- `HOME_SERVICES_CATALOG` is gone from `catalog.ts` after slice E; the guard spec builds its catalog from `HOME_SERVICES_SEED`.
- Rig: `psql -f supabase/migrations/20261030000002_content_facts_claims.sql` re-applied (adds `publish_nonce`; the other statements are no-ops), then `NOTIFY pgrst, 'reload schema'`.

### Commands and results

| Command | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint` | clean |
| `npm run chaos:static` | total 0, NEW 0 |
| `npm run build` (rig env) | exit 0 |
| `TEST_URL=http://localhost:3119 E2E_LIVE_BACKEND=1 E2E_ISR=1 playwright test tests/articles-publish-guard.spec.ts tests/articles-ingest.spec.ts tests/seo-suggestions-ui.spec.ts tests/seo-draft-guardrails.spec.ts --project=chromium` (production build) | 120 passed, 1 skipped (ART1 over HTTP, stub only) |
| Same build, `tests/articles-publish-guard.spec.ts` alone, 5 runs in a row | 77 passed each time (TG2 included) |
| `npm run test:e2e -- <the slice G stub subset> tests/home-services-catalog.spec.ts --project=chromium` (`.env.local` aside) | exit 0, 253 passed, 49 skipped (live-backend specs) |

Advisories not taken in this round: naming the section instead of the paragraph number in reasons (the skill now explains the count instead), the `Referrer-Policy` header being overridden by the global one (the meta tag and `rel=noreferrer` still apply), a redirect after the unpublish POST, routing admin edits of live posts through the guard, and an "Overridden" note in the list.
The `.next` in the worktree is again the stub build from `test:e2e`.
