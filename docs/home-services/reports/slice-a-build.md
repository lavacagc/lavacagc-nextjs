# Slice A build report - landing page, service pages, request flow

Developer: Opus (slice A).
Date: 2026-10-29.
Status: built and self-tested; NOT marked done, awaiting the slice A reviewer.

Branch: `worktree-agent-aebc8600219c08d69`.
Base: `fc6fe33` (the worktree was first cut at `35ba93b`; it was fast-forwarded to `fc6fe33` before any work).
Shared rig fixes cherry-picked on request: `e0fc151` as `92549b1` (dev next/image remote pattern) and `5f427a0` as `46bea6c` (dev CSP for the local rig).

## Headline findings for Fable

These need a decision or an owner outside slice A.

1. **Local `leads` table has no contact columns.** The preview baseline creates `leads` with `id` plus the scoring columns only, so every sanitized insert fails locally with `PGRST204 Could not find the 'address' column`. This also breaks `/api/leads/submit` locally. The request route survives it by design (see Decision 1), so the flow works, but the "one `leads` row" half of RF7 cannot be proven on this rig. An additive fix-up (for example `ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_name text ...` for the columns listed in `src/lib/leadSanitize.ts`) would make it testable; I did not write a migration or alter the shared DB.
2. **The site-wide `welcome-new` promo banner covers the "Request these" bar.** `src/lib/bannerRules.ts` shows every first-time visitor (the Craigslist audience) an English "Get a free estimate for your home renovation project" box linking to `/free-estimate`, layered over the sticky bar, on the Spanish page too. Fix: add `'/home-services'` to `excludePaths` on each rule. Not edited (outside slice A).
3. **`ExitIntentPopup` broke LP4 for first-time visitors.** It pushes a history entry at the current URL whenever its effect re-runs, so with the sheet open there were two `#request` entries and Back did not close the sheet. Reproduced in a fresh browser context. I fixed it with a one-line exclusion of `/home-services` in its own commit, `70f891a`, so it can be dropped if another slice owns that file. My hook was also hardened (`fb42c85`) to only pop an entry it pushed.
4. **Catalog SEO copy fails SEO1** (catalog.ts is slice 0's, rendered verbatim here). Titles: cabinet-repainting en 66 and es 64, exterior-painting es 64, gutter-cleaning en 61 and es 61. Descriptions: cabinet-repainting en 162, exterior-painting en 165. No county names: all seven Spanish descriptions, plus the gutter-cleaning English one. The test for it is a declared expected failure (`test.fail`) that will flip red once the copy is fixed.
5. **Places autocomplete would be blocked by CSP in production.** `next.config.ts` has no `https://maps.googleapis.com` in `script-src` or `connect-src` (nor `maps.gstatic.com` in `img-src`). The address field falls back to street + ZIP when the script fails to load, so nothing breaks, but setting `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` alone will not turn autocomplete on.
6. **The service-area ZIP list is narrow.** `SERVICE_ZIPS` has about 30 ZIPs (mostly Essex and Morris), while the copy promises Essex, Morris and Bergen Counties. Most Bergen ZIPs (Hackensack 07601, Paramus 07652, Ridgewood 07450) are declined as out of area. The contract says the ZIP list is the gate, so I kept it; the list probably needs widening.
7. **`npm run chaos:static` does not run on this machine** (`ERR_UNKNOWN_FILE_EXTENSION` from ts-node under Node 20.20, before and after my changes). The same script runs cleanly as `node_modules/.bin/ts-node-transpile-only --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' scripts/chaos-static.ts` and reports no new violations. `package.json` is outside slice A.
8. **Shared chrome stays English on the Spanish page.** Header, Footer, `ServicesTrustBar` and `ServicesBottomTabs` are not translated, and the bottom tab "Quote" still links to `/request-estimate`. Everything the slice renders is bilingual.

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

- `serviceArea.ts` - the one service-area predicate (ZIP in `SERVICE_ZIPS` or town in `SERVICE_AREAS`), used by browser and server.
- `requests.ts` - schema, validation, canonical answers, dedupe key, leads row, owner alert.
- `photos.ts` - sniffing, token, claim and move, signed URLs.
- `verify.ts` - code generation, salted hash, constant-time compare.
- `attribution.ts`, `lang.ts`, `seo.ts`, `submitRequest.ts` (mirrors `submitLead` for this endpoint, with the v2 challenge).
- `i18n.ts` - keys appended in both languages (no existing key changed).
- `src/lib/leadScoring.ts` - `SERVICE_ZIPS` exported, nothing else.

Tests: `tests/home-services-landing.spec.ts`, `tests/home-services-request-flow.spec.ts`.

Outside the file list, flagged above: `src/components/ExitIntentPopup.tsx` (one line, own commit `70f891a`).

## Acceptance criteria matrix

Specs are named by AC in their titles.
"Landing" means `tests/home-services-landing.spec.ts`; "Flow" means `tests/home-services-request-flow.spec.ts`.

| AC | Result | Evidence |
| --- | --- | --- |
| LP1 | PASS | Landing "LP1 LP5 SEC6": seven cards in catalog order with name, price, unit, description. |
| LP2 | PASS | Landing "LP2": click and keyboard (Space) toggle, Selected state, bar count up and down, bar hides at zero. |
| LP3 | PASS | Landing "LP3": sheet lists every included and raises item; card stays unpressed. |
| LP4 | PASS | Landing "LP4" and "LP4 on a first visit": URL gains `#request`, Back closes, selection survives. First-visit case needed the ExitIntent fix. |
| LP5 | PASS | Landing "LP1 LP5 SEC6": Free seasonal plan, button to `/home-care`. |
| LP6 | PASS | Landing "LP6" (source) and "LP1" (no `/request-estimate` link in `main`). The bottom tab bar still has one (shared component). |
| LP7 | PASS (page content) | Landing "LP7": Spanish h1, sections, all seven names, no English page copy, `lang="es"` on `main`, persists via cookie, toggle back sticks. Shared chrome stays English (finding 8). |
| LP8 | PASS | Landing "LP8 SEO1 SEO2" (gutter-cleaning: title, description, canonical, card, lists, FAQ, JSON-LD, flow preselected) and "LP8" (all seven 200, unknown 404). |
| LP9 | PASS | Landing "LP9" (30-day `lv_src`, `lv_lid`, `lv_utm`) and Flow "RF2 RF7 RF9 LP9" (`source = craigslist`, `listing_id` in the row). |
| LP10 | PASS | Landing "LP10" source check and `/sitemap.xml` check. |
| LP11 | PASS | 89 vs 88 median; see Lighthouse below. |
| RF1 | PASS | Flow "RF1 RF4 RF5" en and es: three fieldsets per service, none preselected, tap again clears. |
| RF2 | PASS | Flow "RF2 RF7": 2.0 MB PNG stored as a JPEG under 1 MB, thumbnail done. Camera-first on touch checked manually (Pixel 5 emulation, Spanish: "Tomar foto" then "Elegir fotos"). HEIC conversion path NOT exercised (no HEIC fixture). |
| RF3 | PASS (no-key path) / NOT-TESTABLE-LOCALLY (Places) | Street + ZIP render and gate; address required (Flow "RF1 RF4 RF5"). Places mode needs a key and a CSP change (finding 5). |
| RF4 | PASS | Flow "RF1 RF4 RF5": 08540 shows the decline, Continue stays on Details, ZIP stays editable. Server 403 `out_of_area` in Flow "RF11". |
| RF5 | PASS | Flow "RF1 RF4 RF5": name, phone, consent required; email optional but validated; timing defaults to Flexible. |
| RF6 | PASS | Flow "RF6": honeypot and a 1 s submit both 200 `ok`, no row. |
| RF7 | PASS (request row) / NOT-TESTABLE-LOCALLY (leads row) | Flow "RF2 RF7": services, answers, source, listing, `cta_v` keys, language, timing, photo claimed and moved to `requests/<id>/`, token cleared. Locally the leads insert is refused (finding 1); the spec asserts the lead_id-null fallback and annotates `schema-gap`; it asserts the lead row instead when the table is complete. |
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
| SEO1 | PASS (landing) / FAIL (service pages, catalog copy) | Landing source check for the landing; finding 4 for the catalog. |
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

## Uncertain or not verified

- The Places branch and its fill of ZIP and town have never run (no key).
- Real Twilio, Telegram and Resend sends have never run; only their `not_configured` / `skipped` outcomes were observed.
- The v2 checkbox fallback path is wired like `submitLead` but was not exercised (the local placeholder site key cannot score).
- With the placeholder site key, a real browser without the stub gets the generic "call us" error, which is the intended degrade; I saw that happen.
- HEIC conversion was not exercised.
- One run of the landing spec, against a cold dev compile, saw two organization JSON-LD blocks once; it did not recur in three repeats or the final runs. The assertion stays strict and now prints the blocks if it fails.

## Commands for the reviewer

From the worktree root, with the local Supabase stack up and `.env.local` as in the brief (plus `CRON_SECRET=<any 32+ chars>` for the purge test):

```bash
npm ci
npm run dev -- -p 3101
TEST_URL=http://localhost:3101 E2E_LIVE_BACKEND=1 node_modules/.bin/playwright test tests/home-services-landing.spec.ts tests/home-services-request-flow.spec.ts --project=chromium
npm run typecheck
node_modules/.bin/eslint --max-warnings 0 src/lib/home-services src/app/api/home-services src/app/api/cron/purge-draft-photos src/components/home-services src/app/home-services src/app/sitemap.ts src/lib/leadScoring.ts src/components/ExitIntentPopup.tsx tests/home-services-landing.spec.ts tests/home-services-request-flow.spec.ts
node_modules/.bin/ts-node-transpile-only --compilerOptions '{"module":"commonjs","moduleResolution":"node"}' scripts/chaos-static.ts
```

Last results: 27 passed (one of them the declared expected failure), typecheck clean, lint clean, no new chaos violations.
The suites delete their own rows; after the last run the shared DB held zero `ZZTEST-A` requests, zero `lead_photos`, zero objects in `service-request-photos`, zero `hs-*` rate-limit buckets and zero `zztest-a` follow-ups.
