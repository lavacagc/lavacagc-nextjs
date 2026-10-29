# Slice A review - landing page, service pages, request flow

Reviewer: independent slice A reviewer (did not write this code).
Date: 2026-10-29.
Reviewed: branch `worktree-agent-aebc8600219c08d69`, head `ec37a63`, base `fc6fe33`.

**Verdict: ACCEPT WITH FIXES.**

27 of 30 ACs are confirmed with my own evidence.
RF3 and RF8 are confirmed only on the path this rig can run (no Places key, no SMS provider).
RF12 is not confirmed because no Telegram or Resend key exists locally.
Three medium defects must be fixed before sign-off: photos lost when the sheet is closed and reopened (D1), Back with the price sheet open leaves the page (D2), and the dedupe merge accepts a stranger's submission into someone else's request (D3).
The landing spec is flaky on a dev server (D4); per the house rules that is fixed too.

## How I tested

Next 16 refuses a second `next dev` in one directory, and the developer's server held the lock on 3101.
I copied the worktree at `ec37a63` (clean tree, `git status` empty) to my scratchpad, cloned `node_modules`, and ran every server from that copy on port 3116.
Sabotage edits were made only in that copy and reverted with `git checkout`.
The production build, `next start` and Lighthouse also ran from that copy, and the base commit `fc6fe33` was built from `git archive` for the LP11 comparison.
All of my rows used `ZZTEST-RA`; I deleted them, their `lead_photos`, their storage objects and my own `hs-*` rate-limit buckets.
After cleanup the shared DB holds zero `ZZTEST-RA` requests or leads, zero `lead_photos`, zero objects in `service-request-photos` and zero `hs-*` buckets.
The middleware blocks `curl/` and `HeadlessChrome` user agents, so every request used a browser user agent.

## Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `eslint --max-warnings 0` on all 38 changed `.ts`/`.tsx` files | exit 0 |
| `npm run chaos:static` | exit 0, total 0, NEW 0 |
| `npm run build` (production) | exit 0 |

The baseline in `chaos/static-baseline.json` was emptied by the cherry-picked `38793d7`.
I checked that the two removed entries (`seo-rollback`, `seo-suggest`) were really fixed upstream; they read a bounded batch now, so nothing was hidden.

Build route table: `/home-services` and `/home-services/[slug]` are both dynamic (`ƒ`).
The base build had `/home-services` as ISR (1 m).
The pages are dynamic because they read the `lv_lang` cookie and `searchParams`.
`generateStaticParams` therefore prerenders nothing; it only limits the slugs (with `dynamicParams = false`).
This is acceptable for launch because LP11 holds, but it gives up CDN caching on the two pages that take the Craigslist traffic (D7).

## Spec runs

Command, against my dev server: `TEST_URL=http://localhost:3116 E2E_LIVE_BACKEND=1 node_modules/.bin/playwright test tests/home-services-landing.spec.ts tests/home-services-request-flow.spec.ts --project=chromium`.

| Run | Result |
| --- | --- |
| 1 | 31 passed (51.2 s) |
| 2 | 30 passed, 1 failed: landing "LP8 SEO1 SEO2", two organization JSON-LD nodes |

The developer saw the same failure once and called it a cold-compile artefact.
It is not cold-compile.
I loaded the service page 16 times in Chromium on the dev server: 7 of 16 had two organization nodes, and every one of those 7 logged "Hydration failed because the server rendered HTML didn't match the client".
The mismatch is in the shared `Footer`'s Facebook icon (server sent a `<path>` where the client expected the `<svg>`), and React then regenerated the tree, leaving a second copy of the layout's organization script.
The same mismatch hits `/` (2 of 8) and `/home-care` (3 to 4 of 8) on dev, so it is pre-existing and site-wide, not slice A code.
On the production build it never happens: 0 of 32 loads across four pages failed hydration, and 16 of 16 service-page loads had exactly one organization node.
The raw server HTML always has exactly one.

## Sabotage

Each change was made in my copy, both specs were run, and the change was reverted.

| Sabotage | Specs that failed |
| --- | --- |
| Honeypot ignored (`if (body.honeypot && false)`) | Flow "RF6" |
| `DEDUPE_WINDOW_MS = 0` | Flow "RF10" (en) and "RF10 RF13" (es) |
| `isInServiceArea` always true | Landing "RF4 service area", Flow "RF1 RF4 RF5" (en, es), "RF4 county gate", "RF11" |

All three were caught.
Gaps in the specs: no test uploads two photos, claims with another token's photo ids, sends an eleventh photo, keeps a claimed photo through the purge, or closes and reopens the sheet after uploading.
I covered each of those by hand below; the close-and-reopen case is D1.
The flow spec's cleanup deletes every `hs-*` rate-limit bucket in the shared DB, not just its own (`tests/home-services-request-flow.spec.ts:166`).

## Acceptance criteria

| AC | Result | Evidence |
| --- | --- | --- |
| LP1 | CONFIRMED | Spec run 1 and my walk: seven cards in catalog order with name, price, unit, description. |
| LP2 | CONFIRMED | Walk at 390x844 with touch: one tap selects, bar reads "Request these (1)", `elementFromPoint` at the bar centre is the bar (no banner over it, no pre-dismissal). |
| LP3 | CONFIRMED | Tapping the drywall price opens the sheet with every included and raises item; the card stays `aria-pressed=false`. See D2 for Back. |
| LP4 | CONFIRMED | URL gains `#request`; Back closes the sheet and stays on the page, in English and Spanish. |
| LP5 | CONFIRMED | Spec: "Free seasonal plan" and the button to `/home-care`. |
| LP6 | CONFIRMED | `page.tsx` imports only the new components; no `/request-estimate` link in `main`; Quote tab goes to `#services` here and `/request-estimate` on `/commercial-services` (spec). |
| LP7 | CONFIRMED | `?lang=es` renders the page in Spanish; reloading `/home-services` with no parameter stays Spanish via `lv_lang=es` (365 days). Header, footer, trust bar and bottom tabs stay English by Fable's decision. |
| LP8 | CONFIRMED | All seven slugs 200, unknown 404 (spec); per-slug title, description, h1, lists, FAQ checked on the production server; Request opens the flow preselected. |
| LP9 | CONFIRMED | `/home-services/gutter-cleaning?src=craigslist` then submit gave `source='craigslist'`, `leads.source='home_services:craigslist'`, `landing_path='/home-services/gutter-cleaning'`. |
| LP10 | CONFIRMED | Production `/sitemap.xml` lists `/home-services` and the seven slugs. |
| LP11 | CONFIRMED | Median mobile performance 89 new versus 88 base (table below). |
| RF1 | CONFIRMED | Three tap groups per service, none preselected, tap again clears, Continue works with none answered. |
| RF2 | CONFIRMED | "Take a photo" first on touch, "Choose photos" second; two JPEGs showed two thumbnails immediately and both were uploaded within 161 ms; 2 MB PNG stored as a JPEG under 1 MB (spec). HEIC not exercised. See D1. |
| RF3 | CONFIRMED (no-key path only) | Street and ZIP fields render and address is required. Places autocomplete is not testable here. |
| RF4 | CONFIRMED | 07920 shows "We don't serve that ZIP yet..." (es: "Aún no atendemos ese código postal...") and Continue stays on Details; API 403 `{"error":"out_of_area"}` and no row. |
| RF5 | CONFIRMED | Name, phone, consent required; email optional; timing defaults to Flexible. |
| RF6 | CONFIRMED | curl: honeypot 200, no row; `started_at` 2 s ago 200, no row. |
| RF7 | CONFIRMED | See the database check below. "Alerted" is only observable as `skipped` locally (RF12). |
| RF8 | CONFIRMED (verify path only) | Seeded held rows: wrong codes counted 1 to 5, the sixth try refused even with the right code, the right code flipped `held` to `new` with `phone_verified`, `phone_verified_at`, hash cleared; expired code refused. The real code text is not testable here. |
| RF9 | CONFIRMED | `status='new'`, `phone_verified=false`, `verification:'skipped'`, no `#hs-code` on the done screen. |
| RF10 | CONFIRMED | Same address and service again in the same session: `merged:true`, same `request_id`, `merged_count=1`, done screen says so (en and es). See D3. |
| RF11 | CONFIRMED | curl: per IP `403 403 403 403 403 429`; per phone `403 403 403 429`. |
| RF12 | NOT CONFIRMED | No Telegram or Resend keys. By reading `sendOwnerAlert`, services go as `describeAnswers` lines and timing, source and signed photo links go in `homeDetails`. |
| RF13 | CONFIRMED | Full Spanish walk (Montclair 07042): decline, submit, merge, rows; RF6 and RF11 are language-independent. |
| SEC1 | CONFIRMED | 33 KB body 413; bad schema and bad JSON 400 `invalid_request`; per-IP limits on request, photos, verify, resend; every error body is a code, never a server message. |
| SEC2 | CONFIRMED | HTML renamed `.jpg` 415; 7 MB 413; bucket `public=false`; public URL and anon-key GET of a claimed photo both 400; anon list returns `[]`; signed URLs use 7 days (code). |
| SEC3 | CONFIRMED | Draft token is `randomBytes(32)` base64url; unknown id and wrong code both `invalid_code`; resend answers `{ ok: true }` for unknown ids. Minor notes in D9 and D10. |
| SEC6 | CONFIRMED (slice pages) | One h1 per page; every visible input labelled (spec); 0 focus escapes over 40 Tabs in the sheet; no target under 44 px in `main`; Lighthouse accessibility 98 (landing, en and es) and 100 (service page); the only flag is the shared footer's heading order. |
| SEO1 | CONFIRMED | Production render of 16 URLs: titles 50 to 59, descriptions 133 to 160, all three counties in every one, 16 unique titles. The Spanish cabinet-repainting description is exactly 160, which meets Fable's "to 160" and not a strict "under 160". |
| SEO2 | CONFIRMED | Every service page: `Service` with `offers.price` from the catalog, three `areaServed` counties, `provider` `{ "@id": ".../#organization" }` only, no rating, exactly one organization node (the layout's). |

## Database check for my English walk (07601 Hackensack)

`home_service_requests`: one row, `status new`, `services {gutter-cleaning}`, answers for all three questions, `language en`, `source direct`, `timing flexible`, `phone_verified f`, `lead_id` set, `merged_count 1` after the repeat, `landing_path /home-services`, `dedupe_key zztest ra walken main st|07601|gutter-cleaning`.
`leads`: one row, `inquiry_type estimate`, `project_type home_services`, `source home_services:direct`, score 65, tier warm, message lines for the answers, timing and language.
`lead_photos`: two rows, `request_id` set, `draft_token` null, paths `requests/<id>/<photo>.jpg`; both objects exist under that prefix and none remain under `drafts/`.
The Spanish walk (07042 Montclair) gave the same shape with `language es` and tier hot.
The production-build walk (07601) gave one request with two claimed photos and `merged_count 1`.
`cta_v` lands in `cta_variant_primary` and `cta_variant_secondary` (spec, `P=B;S=A`).

## Tap count and screens

Screens: landing, then Details ("Step 1 of 2"), then Contact ("Step 2 of 2"), then Done.

| Path | Taps | Typed fields | Other |
| --- | --- | --- | --- |
| Landing, one service, all three answers, two photos | 9 | 4 | 1 photo picker selection |
| Same, with the 07920 decline first | 10 | 4 | ZIP corrected in place |
| Landing, no answers, no photos (minimum) | 5 | 4 | |
| Service page with `?src=craigslist`, no answers, no photos | 4 | 4 | |
| Repeat request for the merge, same session | 6 | 0 | address, ZIP and name kept; consent must be ticked again |

The taps are: card, Request these, three answers, Choose photos, Continue, consent, Send.
The grill predicted two typed fields; without a Places key there are four (street, ZIP, name, phone).

## Lighthouse (LP11)

Mobile, performance and accessibility, `next build` plus `next start` on 3116, three runs each, same machine.

| Page | Performance runs | Median | Accessibility |
| --- | --- | --- | --- |
| Old `/home-services` (`fc6fe33`) | 93, 88, 88 | 88 | 93 |
| New `/home-services` | 90, 89, 89 | 89 | 98 |
| New `/home-services?lang=es` | 89, 89, 89 | 89 | 98 |
| New `/home-services/gutter-cleaning` | 89, 98, 89 | 89 | 100 |

LCP is 3.6 to 3.8 s new versus 3.3 to 3.9 s old; TBT 0 to 40 ms; CLS 0 to 0.003.
The developer's 89 versus 88 and 98 / 100 are reproduced.
The one-point gain is inside run-to-run noise; the honest reading is "not worse".
My first attempt at the new-page numbers accidentally measured the still-running base server (`next start` renames itself `next-server`, so `pkill -f "next start"` missed it); those runs were discarded and re-measured after killing the port's listener.

## Defects

| # | Severity | Where | What breaks | Fix |
| --- | --- | --- | --- | --- |
| D1 | Medium | `src/components/home-services/RequestFlow.tsx:310`, `src/components/home-services/useRequestFlow.ts:18` | Close the sheet with X or Back after uploading photos, reopen it: answers and address are kept but the thumbnails are gone (2 uploaded, 0 shown, en and es). `PhotoUploader` lives inside Radix `Dialog.Content`, which unmounts on close; its items, in-flight XHRs and draft token are lost and the parent's `photo_ids` reset to empty. A homeowner who peeks at another card then submits sends no photos without being told. The hook's comment promises the flow keeps its state. | Lift the uploader's items and token into `RequestFlow` (or `forceMount` the content and hide it when closed), and add a spec: upload, close, reopen, submit, two photos claimed. |
| D2 | Medium | `src/components/home-services/PriceSheet.tsx:22` | With the price sheet open, the phone's Back button leaves `/home-services` instead of closing the sheet (in my test it went to `about:blank`; for a Craigslist visitor it goes back to Craigslist). On a phone this is a full-width bottom sheet, so Back is the natural way to close it. | Give the price sheet the same history handling as the request sheet (push a hash on open, close on `popstate`, pop on X). |
| D3 | Medium | `src/app/api/home-services/request/route.ts:163-187`, `src/lib/home-services/requests.ts:108-131` | The dedupe key is address, ZIP and service set, with no contact. Anyone who knows an address can submit the same service within 24 h and (a) learn that someone there asked for it (`merged:true`, the existing `request_id` and its `status` are returned), (b) overwrite that household's answers (`mergeAnswers` lets the newer submission win), (c) attach their photos to it, and (d) a genuinely different person at the same address (tenant, neighbour typo) gets no `leads` row and no owner alert, only a `[merged ...]` line in `notes`. | Merge only when the normalised phone also matches (put the phone digits in the key). Otherwise insert a new request and flag it as a possible duplicate of the earlier one. Never return another contact's `request_id` or `status`. |
| D4 | Low | `tests/home-services-landing.spec.ts:305-307` | Flaky on dev: about half the loads hit the site-wide footer hydration mismatch and render two organization nodes (run 2 failed). Production is clean. | Assert the organization count on the server HTML (`request.get(...)`) rather than the hydrated DOM, and raise the footer Facebook-icon mismatch on dev as a separate site-wide issue. |
| D5 | Low | `src/components/home-services/RequestFlow.tsx:149-173` | On 390x844, after the ZIP blur and after the blocked Continue, the decline text sits below the fold under the sticky Continue footer; the homeowner sees only a red border (screenshot taken, en and es). | Scroll the ZIP error into view (and focus the ZIP field) when the decline is shown or Continue is refused. |
| D6 | Low | `src/app/home-services/page.tsx:44`, `src/app/home-services/[slug]/page.tsx:52` | `?lang=es` pages declare the English URL as canonical while `hreflang="es"` points at `?lang=es`; search engines get conflicting signals and will not index the Spanish pages the Craigslist links use. | Make the Spanish URL self-canonical when `lang` comes from `?lang=es`. |
| D7 | Low | `src/app/home-services/page.tsx:32`, `src/app/home-services/[slug]/page.tsx:35` | Both pages render per request (`ƒ`); the landing was ISR and the seven service pages are never prerendered. No local Lighthouse cost, but no CDN caching for the listing traffic. | Accept for launch, or render the language from the URL only (middleware rewrite on the cookie) so the pages can be static. |
| D8 | Low | `src/app/api/home-services/photos/route.ts:75-84` | The 10-per-token cap is bypassed by omitting `draft_token` (a fresh token is minted each time); only the per-IP 30 per 10 minutes bounds storage, and the photo route has no CAPTCHA. The 48 h purge cleans up. | Add a per-IP daily cap or a total unclaimed-bytes cap per IP. |
| D9 | Low | `src/app/api/home-services/verify/route.ts:63-67` | The attempt counter is read then written, so parallel wrong guesses all count as attempt 1; the per-id limit of 15 per hour is the real bound, not 5. | Make the increment conditional and atomic (`PATCH ...&verify_attempts=lt.5` and check the returned row, or an RPC). |
| D10 | Info | `request/route.ts:69-71`, `verify/route.ts:61` | The silent 200 for honeypot and timer returns `request_id: null`, so a bot can tell it was dropped. An already-verified id answers `{ ok: true }` to any code, unlike an unknown id. | Return a random UUID in the silent 200; answer `invalid_code` for a verified id with a wrong code. |
| D11 | Info | `src/lib/home-services/serviceArea.ts:30-31` | The server accepts any ZIP when the client sends a town in `SERVICE_AREAS` (07920 with `town: "Montclair"` was accepted). The UI never sends a town without a Places key, so only a crafted request can do this. | Accept the town rescue only when the town came from Places, or drop it now that the county table exists. |
| D12 | Info | `src/lib/home-services/seo.ts:38-44` | Exterior painting's `offers.price` is `2.95` with no unit, which reads as a $2.95 job. | Use a `UnitPriceSpecification` with `unitText: "square foot"` for per-unit prices. |

Checked and fine: the request route composes the helpers and `/api/leads/submit` is unchanged; `sms.ts` is unchanged and aborts after 8 s; Telegram 6 s, email 4 s, follow-up 4 s and the failure alert 4 s are capped; the code hash is `sha256(code + INTERNAL_WEBHOOK_SECRET)` with a constant-time compare and no hash without the salt; claiming needs both the id and the token, moves the object and clears the token (another token, no token, and a replay of a used token all claimed 0 photos); the owner alert fires once per request (merge sends none, verify alerts only on the conditional `held` to `new` update); `lv_src`, `lv_lid`, `lv_utm` are 30 days and `lv_lang` 365 days, all `SameSite=Lax` and sanitised (`CraigsList<x>` became `craigslistx`); `ServicesBottomTabs` keeps `/request-estimate` by default; the `SmartBanner` guard (`2addcc7`) is one `pathname.startsWith('/home-services')` line next to the existing `/home-care` guard and leaves other pages alone; the `ExitIntentPopup` change (`70f891a`) adds one prefix to its existing exclusion list and nothing else; the purge cron 401s without or with a wrong bearer, `?dry=1` deletes nothing, and a real run deleted exactly my nine backdated unclaimed drafts and their objects while keeping two backdated claimed photos.
The production CSP walk (no `bypassCSP`) uploaded, submitted and merged with no CSP violation in the console; the only console noise was a pre-existing `<link rel=preload>` warning and my own aborted reCAPTCHA script.

## Claims I could not reproduce

- "31 passed": reproduced once; the second run failed one test (D4).
- "Seen two organization blocks once on a cold compile; did not recur": it recurs on a warm dev server about half the time, from a site-wide hydration mismatch.
- Everything else in the build report that this rig can run, I reproduced: Lighthouse, the cookie lifetimes, the purge, the county gate, the rate limits, the leads row and the cleanup.

## Not testable locally, verify after deploy

1. Twilio: a real submit with SMS configured lands as `held`, the homeowner gets one text with the confirmation and the 4-digit code, the done screen shows the code field, the right code flips to `new` and fires the owner alert once, resend works twice and then refuses.
2. A held request whose text fails is released to `new` and alerted with the "code text failed" line.
3. Telegram: the owner alert arrives with services as answer lines, county, timing, source, at most three signed photo links, and stays under 4096 characters with ten photos.
4. Resend: the owner email carries every signed photo link and the links open for 7 days; the follow-up sequence starts when an email is given.
5. Places autocomplete with `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`: the script loads under the production CSP, picking an address fills ZIP and town, and the area check runs on the filled ZIP.
6. reCAPTCHA Enterprise with the real site key on the production domain: a normal homeowner passes, and a low score shows the v2 checkbox and then succeeds.
7. The rate limits key on the real client IP behind Vercel, not on a spoofable `X-Forwarded-For`.
8. The Vercel cron at 05:00 UTC calls the purge with `CRON_SECRET` and returns 200.
9. HEIC photos from an iPhone convert and upload.
10. Camera-first on a real iPhone and Android phone opens the camera.
