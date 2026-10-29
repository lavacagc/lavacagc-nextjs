# Slice B build report - admin, bid requests, sub inbox, offer page

Builder: Opus (slice B developer).
Branch: `worktree-agent-a477fb67aa4eb0ecf`, based on `fc6fe33` (confirmed with `git log`; the worktree was first cut at `35ba93b` and was reset to `fc6fe33` before any work).
Two shared-rig commits were cherry-picked on request: `e0fc151` (next/image local storage in dev, here `5a20521`) and `5f427a0` (dev CSP for the local rig, here `3fe4a25`).
Nothing here is marked done by me; a reviewer corroborates.

## What was built

### Library (`src/lib/home-services/`, `src/lib/specnook/`)

- `requestsAdmin.ts` - hand-typed request row, statuses, the town-to-county map for every `SERVICE_AREAS` town, append-only note lines, the 30-day summary and close rate, map and dial helpers.
- `offerRules.ts` - pure rules: sub eligibility with the reason (BD3), what the offer page shows (`recipientView`), the confirmable price after Alex answers a counter, the paused-clock extension, row types, decline reasons.
- `offers.ts` - server offer logic: recipient preview, sending one offer per trade, token lookup, the sub's responses, the atomic assignment, Alex's inbox actions, decline-call logging, the expiry run, append-only notes with an optimistic retry.
- `offerEmail.ts` - pure builders for the offer email (branded on `emailShell`) and text, and the follow-up notices (taken, counter accepted or rejected, reply, won), in the sub's language.
- `offerSend.ts` - sends one built message by email and text and maps the results to `sent | failed | not_configured | skipped`.
- `storage.ts` - private bucket access: 7-day signed links, uploads, magic-byte content sniffing.
- `attachments.ts` - up to 3 files of 6 MB each, typed by their bytes, stored at `service-request-photos/offers/<offer id>/<recipient id>/`.
- `adminRoute.ts` - acting admin email, capped JSON body reading, server errors that log detail and answer plainly.
- `i18n.ts` - appended keys for the offer page, the email and the texts, both languages.
- `src/lib/specnook/client.ts` - `isSpecNookConfigured`, `getSubStatus`, `pushJob`, `specNookSignupUrl`, per the AC contract.

### API routes

- `src/app/api/admin/service-requests/route.ts` - list with status, service, source and county filters, held count, offer state per request, 30-day summary.
- `src/app/api/admin/service-requests/[id]/route.ts` - detail (fields, answer lines, signed photos, offers with recipients and responses, bid preview) and PATCH for status, note, Won, Lost.
- `src/app/api/admin/subs/route.ts` - roster list with expiry flags, create, edit.
- `src/app/api/admin/offers/route.ts` - Send bid request.
- `src/app/api/admin/offers/[id]/route.ts` - withdraw an open offer.
- `src/app/api/admin/offers/responses/route.ts` - the Sub Responses inbox.
- `src/app/api/admin/offers/responses/[id]/route.ts` - accept, reject or re-price a counter; answer a detail request with text and files.
- `src/app/api/admin/offers/decline-calls/[id]/route.ts` - log a decline call.
- `src/app/api/admin/pricing-report/route.ts` - per trade and county figures.
- `src/app/api/offers/[token]/route.ts` - the public, token-authed POST for accept, confirm, counter, details, decline.
- `src/app/api/cron/offers-expire/route.ts` - the 24-hour expiry, plus one `vercel.json` cron entry at `*/30 * * * *`.

### Pages and components

- `src/app/offer/[token]/page.tsx` - public, noindex, read-only offer page.
- `src/app/offer/[token]/OfferActions.tsx` - Accept or confirm, Respond with the three forms, the signup-only state, the countdown.
- `src/components/admin/home-services/ServiceRequestsManager.tsx` - list, filters, Held view, summary card, Requests and Sub Responses views.
- `src/components/admin/home-services/RequestDetail.tsx` - the detail panel.
- `src/components/admin/home-services/BidRequestForm.tsx` - Send bid request and its results.
- `src/components/admin/home-services/SubResponsesInbox.tsx` - counters, detail requests, decline calls.
- `src/components/admin/home-services/SubsManager.tsx` - roster with add, edit, approve, suspend and expiry flags.
- `src/components/admin/home-services/PricingReport.tsx` - the report table.
- `src/components/admin/home-services/shared.tsx` - fetch helper, status badge, labelled select, catalog names.

### Tests

- `tests/home-services-offers.spec.ts` - pure pricing and rule tests, a rendered-email test, and the live offer state machine and page tests.
- `tests/home-services-admin.spec.ts` - the admin screens with a real local session, desktop and phone, saving evidence screenshots.

### Edits outside the listed files (each one line or a pinned list, all required)

- `src/lib/notify/sendEmail.ts` - the two `EmailCategory` members, as instructed.
- `src/app/api/admin/emails/route.ts` and `src/app/vaca-mgmt/emails/page.tsx` - both hold a `Record<EmailCategory, true>`, so adding categories does not typecheck until they list `sub_offer` and `sub_offer_notice` too.
- `src/lib/analytics/excluded.ts` - adds `/^\/offer\//`, so Clarity does not record a page whose URL is a credential and which shows the winner the full address (same reasoning as `/crew/`).
- `src/lib/privatePages.ts` - adds `/offer`, so the sticky CTA, exit popup, review toast and banners stay off the sub's page.
- `tests/proposal-pod-slice3.spec.ts` - AC-R12 pins that list; updated to include `/offer` and to assert `/offer/abc` is private.

## AC matrix

Every PASS below was seen passing in `tests/home-services-offers.spec.ts` or `tests/home-services-admin.spec.ts` against the dev server on port 3102 and the shared local Supabase, unless the evidence column says otherwise.

| AC | Result | Evidence |
| --- | --- | --- |
| AD1 | PASS | `AD1:` test - newest-first order of three seeded rows, status, services, town and county, source, verified flag, age (1h, 2d, 5d); status, service, county filters; Held tab. |
| AD2 | PASS | `AD2:` test - every field, answer lines, homeowner notes, `tel:` and `sms:` hrefs, the exact Google Maps URL, and a signed photo that actually loads (`naturalWidth` 160) under the real dev CSP. |
| AD3 | PASS | `AD3/AD4:` test - status persists in the DB; each change is a `[YYYY-MM-DD HH:MM UTC] (admin-b@local.test) ...` line; notes append, never rewrite. |
| AD4 | PASS | Same test - Won stores `won_at` and `customer_price_cents` 200000; Lost stores `lost_reason`. |
| AD5 | PASS | `AD5:` test - add via the dialog, red flag "Insurance expired - gets no offers until renewed", the bid preview excludes that sub with reason "Insurance expired", edit clears the flag, suspend and approve persist. |
| AD6 | PASS | `AD6:` test - exact figures for an isolated group (duct cleaning, Passaic): offers 2, declines 2, decline rate, top reasons, average counter $365 from one page counter plus one logged call counter, average pay $350, average customer $500.50. It skips with a stated reason if that group already has data. |
| AD7 | PASS | `AD7:` test - the 30-day by-source count for the test's tag is 3 (a 40-day-old row is excluded); the card's close rate equals won over non-held rows read straight from the DB. |
| BD1 | PASS | `BD1:` test - one block per trade, 1.43x customer price ($1,400 -> $2,002), margin "$602 (30.1%)", scope prefilled from the answers, town only, photos, dates; results table. |
| BD2 | PASS | Pure test of `subPayViolation`; `BD2:` live test - a 75% offer is refused with the reason and creates nothing; the UI blocks Send with the same text. |
| BD3 | PASS | `BD3:` test - of eight tagged subs only the approved, in-trade, in-county or any-county, in-date ones get a recipient; tokens are 43-char base64url; `email_status` and `sms_status` are `not_configured` with no Resend or Twilio keys; request becomes `bid_sent`; a second open offer for the trade is refused. Email content: rendered-email test (English and Spanish). Actual delivery: NOT-TESTABLE-LOCALLY (no keys). |
| BD4 | PASS | `BD4:` test - two services, two offers, one per trade; a trade not on the request is refused. |
| BD5 | PASS | `BD5/OF5:` and `BD5/BD7:` tests - counters are never auto-approved; accept over 70% is blocked; reply with a price; accept from the inbox UI; a second click on a handled response is refused. |
| BD6 | PASS | `BD6:` test - a detail request pauses the clock; after a two-hour pause the reply moves `expires_at` by two hours (within a minute) and clears `paused_at`. |
| BD7 | PASS | `BD7:` and `BD5/BD7:` tests - a decline creates an open `decline_calls` row; the inbox shows name, phone (with a `tel:` link) and reason; logging counter, will-take and reason marks it done. |
| BD8 | PASS | `BD8:` test - the cron with the bearer expires a stale offer, closes its recipients `expired`, adds the admin note; a paused recipient keeps its offer open; a wrong bearer gets 401. The Telegram alert: NOT-TESTABLE-LOCALLY (no bot token). |
| BD9 | PASS | `BD9:` test - two concurrent accepts: exactly one 200 and one 409 `taken`; one accept row; loser closed `taken`; request `assigned`; `specnook_push_status` `skipped`; the winner's page shows the full address, the loser's says taken with no buttons. The "taken" notice is sent through `sendToSub`; delivery NOT-TESTABLE-LOCALLY. |
| OF1 | PASS | `OF1:` test - one `h1`, `robots` noindex, pay, town only (street address absent), start window, countdown, Accept and the three responses; two loads write no response and no `opened_at`. |
| OF2 | PASS | `OF2/SEC3:` test - unknown, short and injected tokens get the same "This link is not valid"; an expired offer shows its message and no buttons; taken is covered in BD9. |
| OF3 | PASS | `OF3:` test - a sub set back to pending sees only "Sign up on SpecNook to accept jobs" with `trade` and `ref=<offer id>`; accept answers 403. SpecNook-configured path: NOT-TESTABLE-LOCALLY (no SpecNook API exists). |
| OF4 | PASS | `OF4:` test through the page - counter needs a price, details needs text and stores a PNG attachment at the contracted path, decline stores the reason; a fake JPEG is refused by its bytes. |
| OF5 | PASS | `BD5/OF5:` test - after Alex accepts $1,450 the page shows the confirm step and confirming assigns at $1,450. |
| OF6 | PASS | `OF6:` test - the page in Spanish for a Spanish sub; the rendered-email test covers the Spanish email and text. |
| SEC1 | PASS | `SEC1:` test - 413 over the cap, 400 on bad JSON or an unknown action, no server detail in answers, 429 after the per-token limit; per-IP limit is in the code and fail-closed (not separately driven to 429). |
| SEC3 | PASS | Tokens are 32 random bytes; unknown and malformed tokens get one answer on the page and the API; the admin detail never returns a token (asserted in BD3). |
| SEC5 | PASS | No file of this slice imports the browser client or reads a publishable key (grep); every admin screen calls `/api/admin/*`. |
| SEC6 | PASS for my screens | One `h1` on the offer page (asserted); labels on every input (tests drive them by label); offer actions are real buttons; the admin page `h1` belongs to `AdminContent`, so my tabs use `h2`. A full axe run was not done. |

## Decisions the contracts did not cover

- A trade with no eligible sub creates nothing for that trade, but the other trades on the same request still go out; the results say which went to nobody and why.
- Only one open offer per trade per request; a resend before expiry needs Withdraw first (`POST /api/admin/offers/<id>` with `cancel`).
- Alex's "reply with a new price" is something the sub can confirm directly on the page, exactly like an accepted counter; the confirmed price becomes the offer's `sub_pay_cents`.
- Counters above 70% can be submitted by the sub (so Alex learns the number) but cannot be accepted or replied to above 70%.
- A local `suspended` status blocks Accept even when SpecNook says approved, so Alex can stop a sub without waiting on SpecNook.
- An unknown request county matches only subs with no county list.
- A decline keeps the sub's offer live (Alex may still win them on the call).
- The won view shows the customer's first name and full address, not the phone.
- `opened_at` is never written: the page is strictly read-only on GET, and a scanner fetch would make the stamp meaningless.
- The cron expires an offer when no live recipient remains, so a sub whose deadline was extended by a detail reply keeps the offer open past the original 24 hours.
- Offer and notice emails carry no unsubscribe link (transactional work the sub signed up for) but keep the postal address.
- Owner alerts for counter, details and decline go to Telegram and to an email at `LEAD_NOTIFICATION_EMAIL`.
- The audit (C10) says an unconfigured push records `pending`; the AC contract says `skipped`. I followed the AC contract.
- The SpecNook wire shape (`GET /subs/<id>`, `POST /jobs` with an idempotency key) is my proposal, documented in `client.ts`.

## Bugs found and fixed while verifying

- An offer whose recipient insert failed (a sub deleted between preview and send) was left open with nobody on it and blocked any resend; recipients now come from a fresh read and the offer is removed on failure.
- A tap on the offer page before hydration was silently lost; the buttons stay disabled until React owns the page.
- A slow list answer for an old filter could replace the current one, and stale rows stayed clickable; stale answers are dropped and the list is inert while loading.
- The Spanish email ended its expiry line with "p.m..".

## What is uncertain

- Real email and text delivery, Telegram alerts and the SpecNook API were not exercised; only the unconfigured paths ran.
- Resend's handling of the `sub_offer` emails is untested beyond rendering.
- The per-IP limit (60 per 10 minutes) and per-token limit (20) are my choices; a sub behind a busy carrier NAT is unlikely to reach 60 but it is not measured.
- AD6 assumes no other process writes duct-cleaning offers in Passaic; if one does, the test skips and says so rather than passing on wrong numbers.
- Running the admin spec with `--repeat-each` can race two AD6 copies against each other; single runs are deterministic.
- The default Dashboard tab shows "Failed to load dashboard data" locally because the local `leads` table is a stub with no `created_at`; that is the rig, not this slice, and not production.
- `npm run chaos:static` fails to start on this machine (`ERR_UNKNOWN_FILE_EXTENSION` from ts-node); the same script run as `node_modules/.bin/ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' scripts/chaos-static.ts` reports 0 new violations.

## Commands for the reviewer

Setup as in the slice brief (`.env.local`, local admin user `admin-b@local.test` / `LocalAdmin!2026`, which the specs also create if missing), then:

```
npm ci
npm run dev -- -p 3102
npm run typecheck
node_modules/.bin/eslint --max-warnings 0 src/components/admin/home-services src/app/offer src/lib/home-services src/lib/specnook src/app/api/admin/service-requests src/app/api/admin/subs src/app/api/admin/offers src/app/api/admin/pricing-report src/app/api/offers src/app/api/cron/offers-expire tests/home-services-admin.spec.ts tests/home-services-offers.spec.ts
TEST_URL=http://localhost:3102 E2E_LIVE_BACKEND=1 node_modules/.bin/playwright test tests/home-services-admin.spec.ts tests/home-services-offers.spec.ts --project=chromium
node_modules/.bin/ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' scripts/chaos-static.ts
```

Last run: 29 passed (offers spec 20, admin spec 9); the offers spec also passed 57 of 57 with `--repeat-each=3` and the admin spec 18 of 18 with `--repeat-each=2`.
Evidence screenshots: `test-results/home-services-admin-evidence/` and `test-results/home-services-offer-email/`.
If port 9099 is busy, another builder's Playwright run holds the GoTrue stub; wait and rerun.
Every row the specs create carries a `ZZTEST-B-` tag and is deleted in `afterAll`, with only the rate-limit buckets the run used.
