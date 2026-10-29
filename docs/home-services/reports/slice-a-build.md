# Slice A build report - landing page, service pages, request flow

Developer: Opus (slice A).
Date: 2026-10-29.
Status: built and self-tested; NOT marked done, awaiting the slice A reviewer.

Branch: `worktree-agent-aebc8600219c08d69`.
Base: `fc6fe33` (the worktree was first cut at `35ba93b`; it was fast-forwarded to `fc6fe33` before any work).
Shared rig fixes cherry-picked on request: `e0fc151` as `92549b1` (dev next/image remote pattern) and `5f427a0` as `46bea6c` (dev CSP for the local rig).
Round 2 picks: `363a6f5` as `38793d7` (chaos:static on Node 20) and `69793da` as `80279a4` (county ZIPs, catalog SEO copy, banner rule, Places CSP, local `leads` columns).
`80279a4` conflicted in `supabase/migrations/00000000000001_preview_baseline_fixups.sql` because its parent carries two earlier fix-ups (`rate_limits`, `google_reviews`) that this branch does not; I resolved it to exactly the commit's own 35 added lines (the `leads` block), so a merge with main sees no duplicate.

## Round 2 (coordinator instructions)

1. Picks applied as above.
2. `serviceArea.ts`: in area when `zipInServiceCounties(zip)` OR the ZIP is in `SERVICE_ZIPS` OR the town is in `SERVICE_AREAS`. Hackensack 07601 is accepted and Basking Ridge 07920 is declined, tested as a unit (landing spec, "RF4 service area") and at the API (flow spec, "RF4 county gate": 07920 gets 403 `out_of_area` and no row; 07601 gets a row). `countyForZip` also names the county in the owner alert; nothing new is stored.
3. RF7: the flow spec now proves the `leads` row end to end (one row, linked by `lead_id`, contact fields, `inquiry_type`, `project_type`, `project_timeline`, `preferred_contact_method`, `source`, message lines, score and tier), with no expected-failure marker anywhere. A well-formed request produces no sanitizer adjustments: a source check asserts `adjustments` is empty (including a one-word name), and the dev server log for the full run shows zero `sanitizer adjusted` lines and zero failed leads inserts.
4. `ServicesBottomTabs` gains an optional `quoteHref`; the default is unchanged, so `/commercial-services` still links `/request-estimate` (tested). The landing page passes `#services` (scrolls to the cards). A service page passes `#request`, which opens the flow with that service preselected; the hook adopts that history entry, so Back closes it (tested, and checked by hand at phone size).
5. Decisions recorded below under "Decisions taken by Fable".

One pick did not do what it said, so I fixed it in my worktree as well.
The `bannerRules.ts` exclusion in `80279a4` has no effect: `SmartBanner` renders rows from the admin-managed `smart_banners` table through `/api/banners`, and `bannerRules.ts` only supplies the type.
After the pick, a fresh mobile context still showed the welcome banner over the "Request these" bar on `/home-services?lang=es`.
`2addcc7` adds a code guard in `SmartBanner` (the same kind it already has for `/home-care`); the banner no longer shows on `/home-services` or a service page and still shows on `/about`.
It is in its own commit so it can be dropped or moved.
The landing spec's first-visit test now asserts no banner appears.

## Decisions taken by Fable

- The shared header, footer and trust bar stay English on the Spanish page in this run; site-wide chrome is out of scope and flagged for Alex.
- The `ExitIntentPopup` change `70f891a` is accepted.
- Places autocomplete is unverified until a key exists. `80279a4` adds the Places hosts to the CSP only when `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` is set; neither that CSP branch nor the autocomplete itself has run on this rig.

## Findings from round 1, and where they stand

1. Local `leads` table had no contact columns: fixed by `80279a4`; RF7 is now proven.
2. Welcome banner over the request bar: the rule change in `80279a4` was ineffective; fixed by `2addcc7` (above).
3. `ExitIntentPopup` broke LP4 on a first visit: fixed in `70f891a`, accepted.
4. Catalog SEO copy over the SEO1 limits: fixed by `80279a4`. Every title is at most 59 characters and every description at most 160 with all three county names, in both languages. One sits exactly on a limit: the Spanish cabinet-repainting description is 160 characters. It meets the limit as Fable set it ("to 160") but not a strict reading of the AC text ("under 160"); the test uses the "at most" reading.
5. Places CSP: handled in `80279a4`, unverified (no key).
6. Narrow ZIP list: replaced by the county table in `countyZips.ts` (Fable notes Alex should review it once; it includes Newark and the Oranges).
7. `npm run chaos:static`: works after `38793d7`; exits 0 with no new violations.
8. Shared chrome in English: decided out of scope (above). The bottom Quote tab no longer leaves the home services pages.

## What was built

Pages:

- `src/app/home-services/page.tsx` - rebuilt landing: hero (eyebrow, title, body, button to `#services`, call button, desktop starting-price list linking each service page), seven-card grid, sticky bar, how it works, trust, FAQ, home care (Free seasonal plan to `/home-care`), call closer. Language from `?lang=` then `lv_lang`.
- `src/app/home-services/[slug]/page.tsx` - per-service page with `generateStaticParams`, `dynamicParams = false`, catalog SEO metadata, price card, included and raises lists, FAQ, `Service` and `BreadcrumbList` JSON-LD, "Request this service" opening the flow preselected.
- `src/app/sitemap.ts` - the seven service pages, generated from `SERVICE_SLUGS`.

Components (`src/components/home-services/`):

- `ServiceCatalog.tsx` - the card grid (`<button aria-pressed>` per card), price sheet trigger, sticky "Request these (n)" bar, lazy flow mount.
- `PriceSheet.tsx` - "What's included" and "What raises the price" dialog.
- `RequestFlow.tsx` - the sheet (Radix dialog, full height on phones, centred from `sm`), Details then Contact then Done; `next/dynamic`, never in the initial JS.
- `PhotoUploader.tsx` - camera first on touch devices, browser compression (1600 px, JPEG 0.8, HEIC converted with a dynamically imported `heic2any`), serial upload with progress, remove, cap 10.
- `AddressField.tsx` - Places mode when keyed (falls back if the script fails), else street + ZIP.
- `FlowDone.tsx` - done copy, merged copy, 4-digit code field with resend when a code was sent.
- `useRequestFlow.ts` - open state tied to `#request` and the Back button.
- `RequestServiceButton.tsx`, `LangToggle.tsx`, `AttributionCapture.tsx`, `ServiceIcon.tsx`.

API routes:

- `src/app/api/home-services/photos/route.ts` - one photo per call, magic-byte sniff, 6 MB cap, `hs-photo:<ip>` 30 per 10 min, private bucket, draft token minted on first upload.
- `src/app/api/home-services/request/route.ts` - the contract, in the contract's order of checks.
- `src/app/api/home-services/verify/route.ts` and `verify/resend/route.ts` - held-to-new text code.
- `src/app/api/cron/purge-draft-photos/route.ts` plus the `0 5 * * *` entry in `vercel.json`.

Libraries (`src/lib/home-services/`):

- `serviceArea.ts` - the one service-area predicate (ZIP in Essex, Morris or Bergen via `countyZips.ts`, or in `SERVICE_ZIPS`, or town in `SERVICE_AREAS`), used by browser and server.
- `requests.ts` - schema, validation, canonical answers, dedupe key, leads row, owner alert.
- `photos.ts` - sniffing, token, claim and move, signed URLs.
- `verify.ts` - code generation, salted hash, constant-time compare.
- `attribution.ts`, `lang.ts`, `seo.ts`, `submitRequest.ts` (mirrors `submitLead` for this endpoint, with the v2 challenge).
- `i18n.ts` - keys appended in both languages (no existing key changed).
- `src/lib/leadScoring.ts` - `SERVICE_ZIPS` exported, nothing else.

Tests: `tests/home-services-landing.spec.ts`, `tests/home-services-request-flow.spec.ts`.

Outside the file list, each in its own commit: `src/components/ExitIntentPopup.tsx` (`70f891a`, accepted) and `src/components/SmartBanner.tsx` (`2addcc7`).
`src/components/services/ServicesBottomTabs.tsx` gained the optional `quoteHref` prop (`ec425f5`), as assigned in round 2.

## Acceptance criteria matrix

Specs are named by AC in their titles.
"Landing" means `tests/home-services-landing.spec.ts`; "Flow" means `tests/home-services-request-flow.spec.ts`.

| AC | Result | Evidence |
| --- | --- | --- |
| LP1 | PASS | Landing "LP1 LP5 SEC6": seven cards in catalog order with name, price, unit, description. |
| LP2 | PASS | Landing "LP2": click and keyboard (Space) toggle, Selected state, bar count up and down, bar hides at zero. Landing "LP2 LP4 on a first visit": no promo banner covers the bar. |
| LP3 | PASS | Landing "LP3": sheet lists every included and raises item; card stays unpressed. |
| LP4 | PASS | Landing "LP4" and "LP2 LP4 on a first visit": URL gains `#request`, Back closes, selection survives. The first-visit case needed `70f891a`. |
| LP5 | PASS | Landing "LP1 LP5 SEC6": Free seasonal plan, button to `/home-care`. |
| LP6 | PASS | Landing "LP6" (source), "LP1" (no `/request-estimate` link in `main`) and "LP6: the bottom Quote tab stays on the page" (landing `#services`, service page opens the flow, commercial unchanged). |
| LP7 | PASS (page content) | Landing "LP7": Spanish h1, sections, all seven names, no English page copy, `lang="es"` on `main`, persists via cookie, toggle back sticks. Shared header, footer and trust bar stay English by decision (above). |
| LP8 | PASS | Landing "LP8 SEO1 SEO2" (gutter-cleaning: title, description, canonical, card, lists, FAQ, JSON-LD, flow preselected) and "LP8" (all seven 200, unknown 404). |
| LP9 | PASS | Landing "LP9" (30-day `lv_src`, `lv_lid`, `lv_utm`) and Flow "RF2 RF7 RF9 LP9" (`source = craigslist`, `listing_id` in the row). |
| LP10 | PASS | Landing "LP10" source check and `/sitemap.xml` check. |
| LP11 | PASS | 89 vs 88 median; see Lighthouse below. |
| RF1 | PASS | Flow "RF1 RF4 RF5" en and es: three fieldsets per service, none preselected, tap again clears. |
| RF2 | PASS | Flow "RF2 RF7": 2.0 MB PNG stored as a JPEG under 1 MB, thumbnail done. Camera-first on touch checked manually (Pixel 5 emulation, Spanish: "Tomar foto" then "Elegir fotos"). HEIC conversion path NOT exercised (no HEIC fixture). |
| RF3 | PASS (no-key path) / NOT-TESTABLE-LOCALLY (Places) | Street + ZIP render and gate; address required (Flow "RF1 RF4 RF5"). Places autocomplete and its key-gated CSP are unverified until a key exists. |
| RF4 | PASS | Flow "RF1 RF4 RF5": 08540 shows the decline, Continue stays on Details, ZIP stays editable. Landing "RF4 service area" (07601 in, 07920 out, ZIP+4, scorer ZIP, town) and Flow "RF4 county gate" (07920 403 `out_of_area`, 07601 saved). |
| RF5 | PASS | Flow "RF1 RF4 RF5": name, phone, consent required; email optional but validated; timing defaults to Flexible. |
| RF6 | PASS | Flow "RF6": honeypot and a 1 s submit both 200 `ok`, no row. |
| RF7 | PASS | Flow "RF2 RF7" en and es: one `home_service_requests` row (services, answers, source, listing, `cta_v` keys, language, timing, photo claimed and moved to `requests/<id>/`, token cleared) and one `leads` row linked by `lead_id`, sanitized and scored (`inquiry_type estimate`, `project_type home_services`, `project_timeline asap`, `source home_services:craigslist`, message lines, tier). Landing "RF7 sanitizer": no adjustments for a well-formed request; server log for the run: zero adjustments, zero failed inserts. |
| RF8 | PASS (partial) / NOT-TESTABLE-LOCALLY (send) | Flow "RF8": seeded held request, wrong code rejected, right code flips to `new`, `phone_verified`, attempts counted. No Twilio locally, so the real send is untested. |
| RF9 | PASS | Flow "RF2 RF7": `status new`, `phone_verified false`, `verification skipped`, no code field. |
| RF10 | PASS | Flow "RF10" en and es: second submit with different case and punctuation merges into the first, `merged_count 1`, answers unioned, done screen says so. |
| RF11 | PASS | Flow "RF11": `[403 x5, 429]` per IP and `[403 x3, 429]` per phone against the real local `rate_limits`. |
| RF12 | NOT-TESTABLE-LOCALLY | No Telegram or Resend keys; both report `skipped:not_configured` / `skipped:no_api_key` in the server log. Content is built by `sendOwnerAlert` in `requests.ts` (services as answer lines; timing, source, photo links in `homeDetails`). |
| RF13 | PASS | The es runs of Flow "RF1 RF4 RF5", "RF2 RF7" and "RF10". RF6 and RF11 are request-level and language-independent. |
| SEC1 | PASS | Flow "SEC1 SEC2": 40 KB body 413, bad schema 400 `invalid_request`; every route rate limits by IP; 500s are generic. |
| SEC2 | PASS | Flow "SEC1 SEC2": HTML renamed `.jpg` 415, 6 MB+ 413; private bucket, service role, 7-day signed URLs for alerts. |
| SEC3 | PASS | Draft token is 32 random bytes base64url; Flow "SEC3": unknown id and wrong code both `invalid_code`, resend answers `{ ok: true }` for unknown ids. |
| SEC6 | PASS (slice pages) | One h1 (Landing "LP1", "LP8"), labelled inputs (Flow "RF1" asserts every visible input has a name), 44 px targets, Lighthouse accessibility 98 en, 98 es, 100 service page; the remaining flags are the shared footer heading order and header logo link. |
| SEO1 | PASS | Landing source checks for the landing title and description and for every catalog title (at most 59) and description (at most 160, all three counties, both languages). The Spanish cabinet-repainting description is exactly 160 (see round 1 finding 4). |
| SEO2 | PASS | Landing "LP8 SEO1 SEO2": `Service`, `offers.price` 179.00 USD, three counties, `provider` by `@id` only, no rating, no second organization. |

Purge cron: Flow "purge cron" (401 without the secret; 49-hour draft deleted with its object; fresh draft kept).

## Lighthouse (LP11)

Mobile, performance only, against `next build` + `next start` on port 3101, three runs each, same machine.

| Page | Runs | Median |
| --- | --- | --- |
| Old `/home-services` (unchanged `fc6fe33` build) | 78, 88, 88 | 88 |
| New `/home-services` | 76, 89, 89 | 89 |
| New `/home-services/gutter-cleaning` | 90, 89, 89 | 89 |

The first run of each set is a cold cache.
LCP is 3.8 s new versus 3.9 s old; TBT 0 ms; CLS 0.
Own JS is 470 KB versus 451 KB; I checked that none of the initial scripts contains the request flow or `heic2any`.
Total page weight fell from 1071 KB to 963 KB (the hero and card images are gone).

## Decisions the contracts did not cover

1. A failing `leads` insert does not lose the request: the `home_service_requests` row is still written with `lead_id` null, the owner is still alerted, and `sendFormFailureAlert` reports the insert failure.
2. Timing check: the client also sends `submitted_at` (an additive, optional field) so elapsed time is measured on one clock; a phone with a skewed clock would otherwise be dropped silently. Without it the server clock is used.
3. When SMS is configured, the confirmation and the code go in one text, not two.
4. Owner alert: `services` carries the `describeAnswers` lines; address, timing, language, listing, notes, photo links and the verification line go in `homeDetails`. Telegram gets at most three photo links (its 4096-character limit would reject ten signed URLs) and points to the email, which gets all of them.
5. A held request whose code text fails to send is released to `new` and alerted immediately, so it cannot sit unverifiable.
6. Held status is used only when SMS is configured, the phone is a US number and `INTERNAL_WEBHOOK_SECRET` (the hash salt) is set.
7. A merge sends no new owner alert; when the second submitter's name or phone differs, or they left notes, a `[merged <time> from ...]` line is appended to `notes` so their contact is not lost.
8. Answers are canonicalised against the catalog (unknown services, keys and values are dropped server-side).
9. Consent is required server-side as well (`consent_sms` must be true).
10. A removed photo is simply not named on submit; the purge deletes it after 48 hours. A draft token is reused only if it already has unclaimed photos, otherwise a fresh one is minted.
11. HEIC is converted in the browser and not accepted by the server sniff (jpeg, png, webp only).
12. `landing_path` comes from the same-origin `Referer` path.
13. `preferred_contact_method: 'text'` is sent; the sanitizer documents that column as plain text with no CHECK.
14. Buttons and the selected state use navy (`secondary`), not the orange gradient: white on `#EE9639` is about 2.3:1 and fails AA.
15. `?lang=` also writes `lv_lang`, so a Spanish listing visitor stays in Spanish on return.
16. Service page titles use the catalog title verbatim with ` | La Vaca` only when that stays under 60 characters; `title.absolute` avoids the site template suffix.
17. The landing page renders per request (it reads the language cookie); it was ISR before.
18. On a service page the Quote tab is a plain `#request` link; the flow hook opens on that hash (opt-in, service pages only) and marks the entry as its own, so one Back closes it. On the landing page the tab scrolls to the cards, because the flow needs a selection first.
19. The owner alert names the county (`countyForZip`); a request accepted through the scorer ZIP list or the town list says it is outside the three counties.
20. The `SmartBanner` exclusion is a code guard rather than a `smart_banners` row, so a banner added in admin later cannot cover the request bar either.

## Uncertain or not verified

- The Places branch and its fill of ZIP and town have never run (no key).
- Real Twilio, Telegram and Resend sends have never run; only their `not_configured` / `skipped` outcomes were observed.
- The v2 checkbox fallback path is wired like `submitLead` but was not exercised (the local placeholder site key cannot score).
- With the placeholder site key, a real browser without the stub gets the generic "call us" error, which is the intended degrade; I saw that happen.
- HEIC conversion was not exercised.
- One run of the landing spec, against a cold dev compile, saw two organization JSON-LD blocks once; it did not recur in three repeats or any later run. The assertion stays strict and now prints the blocks if it fails.
- `countyZips.ts` is Fable's table; I tested two ZIPs from it, not the whole list.

## Commands for the reviewer

From the worktree root, with the local Supabase stack up and `.env.local` as in the brief (plus `CRON_SECRET=<any 32+ chars>` for the purge test):

```bash
npm ci
npm run dev -- -p 3101
TEST_URL=http://localhost:3101 E2E_LIVE_BACKEND=1 node_modules/.bin/playwright test tests/home-services-landing.spec.ts tests/home-services-request-flow.spec.ts --project=chromium
npm run typecheck
node_modules/.bin/eslint --max-warnings 0 src/lib/home-services src/app/api/home-services src/app/api/cron/purge-draft-photos src/components/home-services src/app/home-services src/app/sitemap.ts src/lib/leadScoring.ts src/components/ExitIntentPopup.tsx src/components/SmartBanner.tsx src/components/services/ServicesBottomTabs.tsx tests/home-services-landing.spec.ts tests/home-services-request-flow.spec.ts
npm run chaos:static
```

Last results (round 2, at `70c8009`): 31 passed with no expected failures, typecheck clean, lint clean, `npm run chaos:static` exit 0 with no new violations.
The suites delete their own rows; after the last run the shared DB held zero `ZZTEST-A` requests, zero `lead_photos`, zero objects in `service-request-photos`, zero `hs-*` rate-limit buckets, zero `ZZTEST-A` leads and zero `zztest-a` follow-ups.

## Fixes after review

Review: `docs/home-services/reports/slice-a-review.md` (`cd545b8`), verdict ACCEPT WITH FIXES.
Fix commits: `0587bdc` (D1, D2, D5), `27f9f23` (D3, D8, D10, D11), `02532af` (D6, D12), `25600fa` (specs).

| # | Fix | Spec that proves it |
| --- | --- | --- |
| D1 | The upload queue (items, draft token, in-flight uploads) moved into `usePhotoUploads`, owned by `RequestFlow`, which stays mounted while the sheet's content unmounts. It is reset only after a submitted request. | Flow "D1": two photos uploaded, sheet closed with the X and reopened, closed with Back and reopened, both thumbnails still done, submit claims both under `requests/<id>/`. |
| D2 | `useRequestFlow` became `useHashSheet(hash)`; the price sheet uses `#price`, so Back closes it and the X pops its entry. | Landing "D2": Back closes the sheet and stays on the page (URL back to the page, h1 visible); the X leaves no `#price`; selection unchanged. |
| D3 | Ruling applied: the dedupe key ends with the phone digits. A merge now only happens for the same phone, so another person's request id and status are never returned to a different caller. | Flow "D3": same address and services from two phones gives two requests, `merged_count` 0 each, two distinct leads. Flow "RF10" (en, es) still merges when the phone repeats. |
| D4 | The organization-count and offer checks read the JSON-LD from the server HTML (`request.get`), not the hydrated DOM. | Landing "LP8 SEO1 SEO2" asserts exactly one organization node in the server HTML. |
| D5 | A decline or a refused Continue scrolls the message into view, centred above the sticky footer; a refused Continue (and a server `out_of_area`) also focuses the field. The message was already the element directly under the ZIP field. | Landing "D5" at 390x844 in Spanish: message within 24 px under the ZIP, fully above the footer, after the blur and after a refused Continue from the top of the sheet, with focus on `hs-zip`. Checked by hand in English and Spanish too (16 px under the ZIP, 20 px above the footer). |
| D6 | `?lang=es` pages are self-canonical; both versions carry `hreflang` `en`, `es` and `x-default` (English). A page that is Spanish only because of the cookie keeps the English canonical, since a crawler has no cookie. The sitemap lists the eight Spanish URLs. | Landing "D6" on the server HTML of the landing and a service page in both languages; Landing "LP10 D6" for the sitemap; source check for the sitemap entry. |
| D8 | `hs-photo-day:<ip>`, 60 per 24 h, checked after the 30 per 10 minutes limit. | Flow "D8": a bucket seeded at 60 answers 429; an IP under the cap uploads. |
| D10 | The silent 200 is `{ ok: true, request_id: <random uuid v4>, status: 'new', verification: 'skipped', merged: false }`. | Flow "RF6": exact shape for honeypot and fast submit, two different ids, no row with either id. |
| D11 | Ruling applied: a five-digit ZIP decides alone (county table or scorer ZIP list); the town counts only when the ZIP is missing or malformed. The alert's county line no longer mentions a town rescue. | Landing "RF4 service area" (Montclair with 07920 and with 99999 declined; Montclair with no ZIP accepted) and Flow "D11" (API 403 `out_of_area`, no row). |
| D12 | A per-unit price with a minimum is a `UnitPriceSpecification` (`unitText: 'per square foot'`, `minPrice` from the minimum); flat prices keep `price`. Exterior painting is the only per-unit service, so the per-unit branch keys off `minimumCents`. | Landing "D12": exterior painting has `priceSpecification` with `2.95`, `per square foot`, `3500.00` and no `price`; drywall keeps `price: '249.00'`. |

Also fixed from the review notes: the flow spec's cleanup deleted every `hs-*` rate-limit bucket in the shared table; it now records every IP, phone and request id it sends and deletes exactly those buckets.

One regression found and fixed while doing this: under a full parallel run the service page's Quote tab once left `#request` in the URL with no sheet (5 of 5 passes alone).
The cause is a tap before the page hydrates: the plain `#request` link changes the hash while no `hashchange` listener exists yet.
`useHashSheet` now adopts a hash already present at mount; when the page was loaded with the hash (a direct link or a reload) it opens the sheet without adopting the entry, so closing strips the hash instead of leaving the site.
The landing spec covers the loaded-with-`#request` case. I could not reproduce the before-hydration tap exactly: holding the JS chunks also stalls the dev server's HTML stream, so the link never renders. That branch is covered by reasoning and by the two clean full runs below, not by a dedicated test.

D2 note: the instruction said both "must not push a history entry" and "Back with it open closes the sheet". Back can only close a sheet that added an entry when it opened, so I used the request sheet's pattern (push `#price`, pop it on close), which is the option the instruction names second.

Not changed, as the review allowed: an already-verified request id still answers `{ ok: true }` to any code (the other half of review D10). The code hash is cleared on success, so there is nothing left to compare against.

### Rulings recorded (no code change)

- D7: dynamic rendering of `/home-services` and `/home-services/<slug>`, because the language comes from the cookie and `searchParams`, is accepted for this launch. A static Spanish route is a follow-up ticket.
- D9: the read-then-write verify attempt counter is accepted; it is bounded by the per-id limit of 15 an hour.
- The site-wide, dev-only hydration mismatch on the footer's Facebook icon is logged by the coordinator as a separate ticket.

### Results after the fixes

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| eslint `--max-warnings 0` on every changed file | exit 0 |
| `npm run chaos:static` | exit 0, no new violations |
| Both specs, run 1 | 39 passed (51.1 s) |
| Both specs, run 2 | 39 passed (50.4 s) |

After the runs the shared DB held zero `ZZTEST-A` requests and leads, zero `lead_photos`, zero objects in `service-request-photos`, zero `hs-*` buckets and zero `zztest-a` follow-ups.
