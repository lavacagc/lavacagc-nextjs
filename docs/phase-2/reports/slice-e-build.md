# Phase 2 slice E - build report (catalog in `home_services`, Services & Prices editor)

Builder: Opus 5.5 (builder slice E). Planner: Fable. Reviewer: separate agent; nothing here is marked done by the builder.
Branch: `phase2/slice-e`, cut from the Phase 2 head `1982e0a` (slice 0: migration and seed generator).
Scope: CAT1 to CAT8 in `docs/phase-2/acceptance-criteria.md`, plus the "Catalog module split" and "Admin Services & Prices editor" contracts.
Prices are unchanged: the seed is byte-identical to the migration slice 0 wrote, and the rendered pages are identical before and after (see SEO1 snapshot below).

## What changed

- `src/lib/home-services/catalog.ts` keeps the fixed shape only: types, `SERVICE_SLUGS` (now a literal tuple), `SERVICE_TRADE`, `SERVICE_QUESTIONS`, `TRADE_LABEL`, `COUNTIES`, `TIMING_OPTIONS`, `t`, `toLang`, `isServiceSlug`, `serviceQuestions`, `serviceTrade`, `describeAnswers`.
  No price or customer-facing service text is left in it.
- `src/lib/home-services/catalogSeed.ts` holds the day-one rows (`HOME_SERVICES_SEED`), cut mechanically from the old `HOME_SERVICES_CATALOG` minus the questions.
  A one-off check rebuilt the old array from seed plus `SERVICE_QUESTIONS` and compared it with a JSON dump of the old catalog taken before the change: equal, in order.
- `src/lib/home-services/catalogRow.ts`: the row type, the column list, `rowToService` and `contentToRow` (pure).
- `src/lib/home-services/catalogData.ts` (server only): `getAllServices`, `getCatalog` (active, by `sort`), `getServiceData`, `getServiceNames`, `invalidateCatalog`.
  The read is `unstable_cache` with tag `home-services`, `revalidate: 3600`, `limit=50`.
  `invalidateCatalog()` calls `revalidateTag('home-services', { expire: 0 })` and `revalidatePath` on `/home-services`, the seven `/home-services/<slug>` paths and `/sitemap.xml`.
- `src/lib/home-services/catalogSchema.ts`: the PATCH zod schema and `fieldErrors()`.
- `GET /api/admin/home-services` (all rows, uncached, `limit=50`) and `PATCH /api/admin/home-services/[slug]` (validates the whole body first, stamps `updated_at` and `updated_by`, invalidates).
- `src/components/admin/home-services/ServicesPricesEditor.tsx`: tab `home-services-catalog`, label "Services & Prices", registered in `AdminSidebar.tsx`, `AdminContent.tsx` and `tests/admin-nav-simplified.spec.ts`.
- Pages: `/home-services` and `/home-services/[slug]` read `getCatalog()`; `ServiceCatalog`, `RequestServiceButton` and `RequestFlow` get the services as props.
- `sitemap.ts` lists only active services.
- Names in alerts, the leads message, offers, the offer page, the admin request detail and the bid form come from the table (`getServiceNames()` server side, `GET /api/admin/home-services` in the admin).
- `scripts/seed-home-services.ts` reads `HOME_SERVICES_SEED`; its header now names `ts-node -P tsconfig.scripts.json` instead of `npx -y tsx` (the repo rule against bare `npx`).
- Specs: new `tests/home-services-catalog.spec.ts`, new helper `tests/helpers/homeServicesSeed.ts`; `home-services-landing.spec.ts` and `home-services-offers.spec.ts` read the seed.

## Decisions I took inside the contract (for the reviewer to accept or reject)

1. Seed fallback without a service key.
   When `SUPABASE_SECRET_KEY` is unset (the stub-backed test build and CI), `getAllServices()` renders the seed and logs one warning.
   Without it the stub suite cannot render `/home-services` at all (for example `proposal-pod-slice3.spec.ts` and the chaos crawler visit it).
   With the key set and the read failing, it throws, so production never shows a price the admin may have changed; only the sitemap catches and lists the seven fixed slugs.
2. The request flow had no price line.
   CAT2 asks for one, so each service block in step 1 now shows "Starting at <price> <unit>" (`data-testid=flow-price-<slug>`), in both languages.
3. CAT3 "JSON-LD service name": the Service node's `name` is the service name, not the SEO title (SEO1 forbids a shape change).
   The CAT3 spec saves the SEO title, the SEO description and the English name together and checks all three outputs, on the service page and in the landing page graph.
4. Trade routing stays in code (`SERVICE_TRADE`); the table's `trade` column is not editable (the PATCH schema refuses unknown keys such as `trade`, `slug`, `sort`, `updated_by`), and CAT6 asserts the seed's trades equal the code's.
5. The included and raises lists are paired line by line, so the schema requires the English and Spanish lists to travel together and have the same length.
6. FAQ is editable too (question and answer, English and Spanish, add and remove), because prices are quoted in the FAQ answers and the SEO copy.
   When the starting price changes, the price display lines follow it automatically, and an amber note lists every other field still quoting the old amount.
7. The tab sits in the Customers group beside Service Requests, Subs and Pricing Report, not in Content beside the old remodel `Services` tab, to keep the two "services" apart (audit section 8).
8. "Only admins" is the repo's existing rule: middleware requires a Supabase session on `/api/admin/*` and `/vaca-mgmt` (there is no separate role check anywhere in the admin today).
9. `getServiceNames()` never throws: a failed read prints slugs in an alert rather than failing a homeowner's request.

## Evidence per AC

| AC | Evidence | Result |
| --- | --- | --- |
| CAT1 | `home-services-catalog.spec.ts` "CAT1: the landing page and every service page render the seeded table rows, identical to the seed" (live): asserts each table row equals the seed row, then checks the seven cards (name, price, unit, description) and, for all 7 slugs in English and Spanish, `<title>`, meta description, Service JSON-LD name and description, every included and raises line, every FAQ question and the price. | pass |
| CAT1 / SEO1 | Manual snapshot: title, meta description, keywords, every JSON-LD block and the full `<main>` text of 16 pages (landing and 7 services, en and es), captured on the dev server before the change (code constants) and after (table read). | 0 differences in 16 pages; sitemap home-services entries identical (16 lines) |
| CAT2 | "CAT2: a price saved in the editor shows on /home-services, the service page and the request flow price line on the next request" (live): edits Home cleaning to 271 in the UI, sees the display lines follow, the stale-price note, saves, checks the row (`updated_by` = the admin's id), the landing card, the service page and the flow price line, then restores. | pass |
| CAT2 (cache) | Manual, dev server and production build (`next build && next start` on the rig): a direct REST write of `$263` does not show (the read is cached), an admin-route save makes it show on the next request. Output below. | as expected on both |
| CAT3 | "CAT3: a saved SEO title, description and name change the <title>, meta description and JSON-LD name on the next request" (live). | pass |
| CAT4 | "CAT4: switching a service off removes its card, sitemap entries and page; switching it on restores all three" (live, through the list switch in the editor): 6 cards, 0 sitemap entries, 404 in both languages, no sibling link; then 7, 2, 200. | pass |
| CAT4 (prod) | Manual on the production build, where `/sitemap.xml` is static with a 1 h revalidate: off gives sitemap 0, page 404, 6 cards; on gives 2, 200, 7. Output below. | as expected |
| CAT4 (names) | "CAT4: an existing request keeps its service names in the admin (list, detail, bid form) while the service is off" (live): seeds a `slice-e-` request for HVAC and drywall, switches HVAC off, checks the API `answer_lines`, the list row, the detail and the bid form's catalog prices; cleans up. | pass |
| CAT5 | Unit: "CAT5: zero price, empty Spanish name and a 61-character SEO title each get a field-level message" and "CAT5: the rest of the contract" (bounds 1 to 10,000,000 cents, whole cents, SEO title 60, description 160, keywords 10, paired lists, unknown keys, empty body). Live: "CAT5: ... show field messages and write nothing": the three messages sit under their fields, the fields are outlined, focus moves to the first one, and the row is byte-identical afterwards. | pass |
| CAT6 | Unit: "CAT6: the migration seeds exactly what scripts/seed-home-services.ts prints from catalogSeed.ts", slugs/trades/questions, row round trip, and "no spec or source reads prices from catalog constants any more". `home-services-landing.spec.ts` reads `tests/helpers/homeServicesSeed.ts`. | pass |
| CAT7 | Unit on a production build: "CAT7: the built client chunks do not contain the catalog copy" scans every `.next/static/chunks/**/*.js` for the HVAC Spanish description (scanned more than 20 chunks, 0 hits; the copy appears only in `.next/server`). Live: "CAT7: the JavaScript the browser loads for /home-services carries no catalog copy" checks every script the browser loaded, including the request flow's lazy chunk, for three seed strings. Source: no `'use client'` file imports `catalogSeed` or `catalogData`. | pass |
| CAT8 | "CAT8: signed out, the editor redirects to sign-in and both routes answer 401 without writing" (runs on any server, stub and live), source check of the middleware prefixes, and live "CAT8: a signed-in admin reaches the editor and the list route". | pass |

Screenshots from the live run are in `test-results/home-services-catalog-*/` (`cat2-flow-price.png`, `cat4-inactive-names-bid-form.png`, `cat5-field-errors.png`, `cat8-editor-list.png`).
I looked at each: the list, the form with field errors (red outline, message under the field, stale-price note), the bid form and the flow price line render cleanly at 1366 px, and the flow price line at iPhone 13 width in Spanish ("Desde $2.95 / pie² mínimo $3,600").

### Manual check output (production build on the rig, port 3119)

```
before:          sitemap entries=2 page=200 cards=7
switch off:      HTTP 200
after off:       sitemap entries=0 page=404 cards=6
switch on:       HTTP 200
after on:        sitemap entries=2 page=200 cards=7
--- cache check on the production build
1. page now:                          $259
2. after a direct REST write ($263):  $259   <- unchanged means the read is cached
3. admin route save (unrelated field): HTTP 200
4. page after the admin save:         $263   <- $263 means the save expired the cache
5. restored:                          $259
```

The same cache check on the dev server (port 3111) gave the same five lines.

## Commands run and results

| Command | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | clean (0 problems) |
| `npm run chaos:static` | total 0, baselined 0, new 0 |
| `ts-node -P tsconfig.scripts.json scripts/seed-home-services.ts`, compared with `cmp` to the output before the change | identical; the migration contains it verbatim |
| Live, dev server on the rig: `TEST_URL=http://localhost:3111 E2E_LIVE_BACKEND=1 playwright test tests/home-services-catalog.spec.ts --project=chromium --workers=1` | 18 passed, 1 skipped (the production-chunk scan, which needs a production `.next`) |
| Live: `... playwright test tests/home-services-landing.spec.ts tests/home-services-request-flow.spec.ts --project=chromium` | 41 passed |
| Stub: `npm run test:build`, then `next start` on port 3112 and `E2E_STUB_BACKEND=1 TEST_URL=http://localhost:3112 playwright test` on `home-services-catalog`, `home-services-landing`, `home-services-request-flow`, `admin-nav-simplified`, `home-services-offers`, `home-services-admin` (chromium and mobile) | 66 passed, 142 skipped (live-only), 0 failed; the catalog spec alone then 22 passed, 16 skipped, including the production-chunk scan |
| Stub, full suite (`E2E_STUB_BACKEND=1 TEST_URL=http://localhost:3112 playwright test`, chromium and mobile, at `bf30010`) | 2559 passed, 390 skipped (live-only), 0 failed, 0 flaky |
| `npm run build` on the rig env, then `next start` on port 3119 and the manual checks above | build clean; checks as shown |

The stub runs used `npm run test:build` plus my own `next start` on 3112 instead of `npm run test:e2e`'s server on 3000, so a parallel builder's run cannot hand Playwright the wrong server; the build is the same script CI uses.
No `.env.local` move was needed: the worktree's `.env.local` holds no `SUPABASE_SECRET_KEY` (the key lives in `.env.development.local`, which `next build` and `next start` do not read).
The stub server ran with Resend, Telegram and OpenAI blanked so nothing could reach a real channel.

## Running the live spec

```bash
TEST_URL=http://localhost:3111 E2E_LIVE_BACKEND=1 \
  node_modules/.bin/playwright test tests/home-services-catalog.spec.ts --project=chromium --workers=1
```

It edits real rows, so run it on its own and not beside `home-services-landing.spec.ts`, which expects the seeded prices.
It puts all seven rows back to the seed through the admin route in `beforeAll` and `afterAll`, and each editing test restores its row at its end; its test data carries a `slice-e-` prefix.
It signs in as `slice-e-admin@local.test` (created on first run).

## Left out, and why

- `home-services-admin.spec.ts` and `home-services-offers.spec.ts` were not run live: the brief limits live runs to my own specs on the shared database.
  Their unit and source parts ran green in the stub run, and the live CAT4 names test covers the admin list, detail and bid form I changed.
- No change to slice F (blog, OpenAI, articles, SEO) or slice H (experiments) areas.
- `public.services` is missing on the rig (`next build` logs "Could not find the table 'public.services'"); that is the older remodel table, not mine, and the build does not fail on it.
- The rest of the Phase 2 gates (Lavish review with screenshots, `/no-mistakes`) belong to the planner after review.

## Fix round 1 (review REJECT on the editor's phone UI, `slice-e-review.md`)

The reviewer accepted CAT1 to CAT8 and rejected the editor's phone layout (U1 to U4) with one should-fix (U5).
All five are fixed in `src/components/admin/home-services/ServicesPricesEditor.tsx`, plus one line of the admin shell for U5.
Screenshots are in `docs/phase-2/reports/shots/` with the prefix `slice-e-fix-`, taken at iPhone 13 (390 x 844) and at 1366 x 900 against the dev server on the rig.
The measurements below come from the same script that took the screenshots.

| Item | Fix | Evidence |
| --- | --- | --- |
| U1 list squeezes names on a phone | Each row stacks below `sm`: name, Spanish name and path on top at full width (the path may break anywhere), then price, switch, badge and Edit in one row; from `sm` up it is one row as before. The price never wraps (`$2.95 / sq ft` stays on one line). | Name block 298 px of a 322 px row on the phone (was about 100 px), 840 of 1196 on desktop. `slice-e-fix-phone-list.png`, `slice-e-fix-desktop-list.png`. |
| U2 lowercase "SEO" | Labels are now "<Field> (English)" and "<Field> (Spanish)", the field name kept as written. FAQ labels read "Question (English)" and "Answer (Spanish)". | Labels read "SEO title (English)" and "SEO description (Spanish)" on both widths. `slice-e-fix-phone-seo-labels.png`, `slice-e-fix-desktop-seo-labels.png`. |
| U3 gap above the switch on a phone | The price row stacks on a phone and the switch's top offset (`pt-7`, which lines it up with the inputs beside it) applies from `sm` up only. | Gap between the Job minimum input and the switch is 18 px on the phone (was about 60 px); on desktop the switch sits beside the inputs. `slice-e-fix-phone-form-top.png`, `slice-e-fix-desktop-form-top.png`. |
| U4 clipped text and missing counters | Every multi-line field (description, included, raises, SEO description, keywords, FAQ answers) grows with its text; FAQ questions are growing textareas instead of single-line inputs. FAQ questions show n/300 and answers n/1200; keywords show n/10 (red past the limit), matching the schema caps. | No textarea in the form scrolls internally on either width (scrollHeight compared with clientHeight on every textarea: none clipped); keywords show 6/10. `slice-e-fix-phone-faq.png`, `slice-e-fix-phone-keywords.png`, `slice-e-fix-desktop-faq.png`. |
| U5 Save scrolls away | Save, Discard and the status sit in a bar stuck to the bottom of the viewport on both widths, with an "Unsaved changes" note once the form differs from what is stored. | With the price changed at the top and the view scrolled to the raises lists, the Save button is inside the viewport on the phone (form 5,735 px tall) and on desktop (3,251 px). `slice-e-fix-phone-sticky-save.png`, `slice-e-fix-desktop-sticky-save.png`, `slice-e-fix-*-form-bottom.png`. |

The first attempt at U5 measured the bar out of view on both widths.
The cause was in the admin shell, not the editor: three wrappers in `src/components/AdminContent.tsx` used `overflow-x-hidden`, which makes an element a scroll container and so silently disables every `position: sticky` inside it.
They now use `overflow-x-clip`, which clips the same way without creating a scroll container.
That also lets the admin header's existing `sticky` class work as written, so on every admin tab the header now stays on screen while the page scrolls; the stub `admin-nav-simplified` browser check, which renders an admin tab through that shell, passed after the change.

In the phone screenshots the round "N" badge at the bottom left is the Next.js dev-mode indicator; it is not in a production build.

### Commands run in this round and their results

| Command | Result |
| --- | --- |
| `git merge --ff-only 913643d` | fast-forwarded to the reviewer's commit |
| Screenshot and measurement script (Playwright, iPhone 13 and 1366 x 900, dev server on 3111 with the rig env) | the values in the table above |
| Live, alone: `TEST_URL=http://localhost:3111 E2E_LIVE_BACKEND=1 playwright test tests/home-services-catalog.spec.ts --project=chromium --workers=1` | 19 passed (the production-chunk scan ran too, against the stub build left in `.next`) |
| Rig table against the seed afterwards (every column except `updated_at` and `updated_by`, jsonb compared key-order independent) | 7 rows, none differing from the seed |
| Live: `playwright test tests/admin-nav-simplified.spec.ts` (chromium and mobile) | 14 passed, 2 skipped (the stub-cookie check, which only works against the GoTrue stub) |
| Stub: `npm run test:build` (with `.env.local` moved aside, since it now holds the rig's service key), `next start` on 3112, `playwright test tests/admin-nav-simplified.spec.ts tests/home-services-catalog.spec.ts` | 38 passed, 16 skipped (live-only), 0 failed |
| `npm run typecheck`, `npm run lint`, `npm run chaos:static` | clean, clean, no new violations |

Both env files in the worktree are now copies of the coordinator's `env.rig`; the repo's production `.env.local` is not used.

## Polish round (re-review ACCEPT at `d426a7f`, notes N1 and N2, plus two older admin phone defects)

Taken in with `git merge --ff-only d426a7f`.
Screenshots are in `docs/phase-2/reports/shots/` with the prefix `slice-e-polish-`, at iPhone 13 (390 x 844) unless the name says desktop (1366 x 900).
The measurements come from the script that took the screenshots, against the dev server on the rig.

| Item | Fix | Evidence |
| --- | --- | --- |
| N1 Enter in a FAQ question | The question box ignores Enter, and a pasted line break becomes a space; answers stay multi-line. The PATCH schema also turns line breaks in a question into spaces, so a question saved any other way is one line too. | Typing Enter then " Really" gave "Is this a repair visit? Really" (no line break); a pasted "Line one\nline two" became "Line one line two"; Enter in the answer still adds a line break. Unit test "CAT5: a FAQ question is saved as one line (review N1); answers keep their line breaks". `slice-e-polish-phone-faq-question.png`. |
| N2 Exterior painting row 4 to 5 px off | On a phone the controls row is full width, so the price's `mr-auto` pushes the switch and Edit to the right edge, and the gap is 8 px below `sm`, so the widest price ("$2.95 / sq ft") no longer pushes them past the edge. | Edit button at x = 263 on all seven rows; one switch position (x = 154) for all seven. `slice-e-polish-phone-list.png`, `slice-e-polish-desktop-list.png`. |
| Smart Banners on a phone (older defect) | `BannerManager.tsx`: the header stacks on a phone, so "New Banner" sits under the title; badges wrap; the four actions take their own right-aligned row. Desktop is unchanged (one row per banner). | No element past the right edge of the 390 px viewport (the reviewer measured 4 at right = 455 to 463); "New Banner" spans x = 10 to 156. `slice-e-polish-phone-banners.png`, `slice-e-polish-phone-banners-full.png`, `slice-e-polish-desktop-banners.png`. |
| "New Post" covering the menu list (older defect) | `AdminSidebar.tsx`: the menu is `h-dvh` (falling back to `h-screen`), so it no longer runs under a phone browser's toolbar; the item list is the only scroller (`min-h-0`) with bottom padding; "New Post" is a footer with a divider and the safe-area inset. | With the list scrolled to the end, the last item ends at y = 573 and the footer starts at y = 583, inside a 664 px viewport; New Post ends at 646. `slice-e-polish-phone-menu.png`, `slice-e-polish-phone-menu-scrolled.png`; desktop sidebar `slice-e-polish-desktop-sidebar-expanded.png` (the second orange item there is the mouse hover). |

`slice-e-polish-phone-blog.png` is the Blog tab with the menu closed, for reference.

### Commands run in this round and their results

| Command | Result |
| --- | --- |
| `git merge --ff-only d426a7f` | fast-forwarded |
| Live, alone: `TEST_URL=http://localhost:3111 E2E_LIVE_BACKEND=1 playwright test tests/home-services-catalog.spec.ts --project=chromium --workers=1` | 20 passed |
| Rig table against the seed afterwards | 7 rows, none differing |
| Live: `admin-nav-simplified`, `smart-banner-push-content`, `admin-dashboard` (chromium and mobile) | admin-nav and smart-banner green; `admin-dashboard` fails 10 live because it signs in with the GoTrue stub cookie by design (its header says it runs against the stub backend), so it was run stub-backed below |
| Stub: `npm run test:build` (`.env.local` moved aside and restored), `next start` on 3112, `playwright test` on `admin-nav-simplified`, `smart-banner-push-content`, `admin-dashboard`, `home-services-catalog` | 54 passed, 16 skipped (live-only), 0 failed |
| `npm run typecheck`, `npm run lint`, `npm run chaos:static` | clean, clean, total 0 and no new violations |

There is no admin spec for the Smart Banners manager or the blog list; `smart-banner-push-content` covers the public banner, and `admin-dashboard` and `admin-nav-simplified` render the admin shell and sidebar this round touched.
