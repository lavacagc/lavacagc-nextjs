# Slice B review - admin, bid requests, sub inbox, offer page

Reviewer: independent review agent (did not write this code).
Branch: `worktree-agent-a477fb67aa4eb0ecf`, reviewed at `7112d88` against base `fc6fe33`.
Rig: own dev server on port 3115, shared local Supabase on 55421 and 55422, real dev CSP, no Resend, Twilio, Telegram or SpecNook keys.

**Verdict: ACCEPT WITH FIXES**

25 of 26 ACs confirmed with my own evidence.
BD9 fails only on the SpecNook push status, which records `skipped` where Fable ruled `pending`.
Two medium defects (homeowner notes leak into every sub's offer, and detail uploads that will exceed the Vercel body limit) should be fixed before deploy.

## AC table

| AC | Result | Evidence |
| --- | --- | --- |
| AD1 | CONFIRMED | Spec passes twice. My walk: the seeded row lists "New, 4m, Gutter cleaning, Drywall patching, Montclair · Essex, direct, unverified". |
| AD2 | CONFIRMED | Walk: detail shows every field, both answer lines, homeowner notes, Call, Text, Email and Map. Signed photo loading is proven by the spec (`naturalWidth` 160 under the real CSP); my seed had no photos. |
| AD3 | CONFIRMED | Walk: New to Contacted wrote `[2026-10-29 07:31 UTC] (admin-b@local.test) Status: New -> Contacted.`; later lines appended, none rewritten. |
| AD4 | CONFIRMED | Spec asserts `won_at`, `customer_price_cents` 200000 and `lost_reason` in the DB; route code read. |
| AD5 | CONFIRMED | Spec passes; sabotage (c) makes it fail. Walk: lapsed sub card shows the red flag "Insurance expired - gets no offers until renewed". |
| AD6 | CONFIRMED | Spec passes (not skipped) twice. Walk: report shows Drywall Essex 2 offers, 4 reached, 1 decline, 25%, "Pay too low (1)", avg counter $360 from the logged call. |
| AD7 | CONFIRMED | Spec passes; walk shows the 30-day card with close rate and by-source counts. |
| BD1 | CONFIRMED | Walk: one block per trade, $175 to $250 and $300 to $429 at 1.43x, scope prefilled, town Montclair, dates. See D2 for what the prefill includes. |
| BD2 | CONFIRMED | Sabotage (b) removing the server check fails the live BD2 test. Walk: the API refuses a $190 counter accept and a $176 reply against a $250 customer price with the `subPayViolation` text. |
| BD3 | CONFIRMED (unconfigured channels only) | Walk: offers went to the 2 eligible gutter subs; suspended and lapsed subs excluded with "Status is suspended" and "Insurance expired"; every email and SMS status `not_configured`. Sabotage (c) fails pure BD3, live BD3 and AD5. Real delivery not tested. |
| BD4 | CONFIRMED | Walk: one gutter offer and one drywall offer from one send. |
| BD5 | CONFIRMED | Walk: counter $190 shown in the inbox with note; Accept disabled while over 70% and the API returns 400; after the customer price was raised, Accept worked and the sub confirmed. See D3 for stale items. |
| BD6 | CONFIRMED | Spec asserts the two-hour extension within a minute and `paused_at` cleared. Walk: the inbox shows "Their clock has been paused since". |
| BD7 | CONFIRMED | Walk: Spanish sub declined "Pago muy bajo"; an open `decline_calls` row appeared; inbox showed name, `tel:+19735550105` and "Reason: Pay too low"; logging $360, yes and a reason marked it done with `called_at` and an admin note. |
| BD8 | CONFIRMED (Telegram not tested) | Walk: without a bearer and with a wrong one the cron answers 401. With the secret, one run closed the unpaused recipient `expired` and left the paused one open with the offer open. After unpausing, the next run expired the offer and wrote "Offer expired with no acceptance - adjust pay and resend (Drywall at $300)." |
| BD9 | FAILED | Sabotage (a) removing `status=eq.open` fails BD9. Walk: offer `assigned` at $190, the other recipient closed `taken`, request `assigned`, winner sees "27 Orchard Lane, Montclair, 07042", loser sees "Job taken". `specnook_push_status` is `skipped`, which Fable ruled wrong (D1). |
| OF1 | CONFIRMED | Walk at 390x844: one h1 "Job offer from La Vaca", `noindex, nofollow`, pay, town only (street absent), "Nov 9 - Nov 13", countdown, Accept and Respond, no horizontal scroll. Spec asserts two GETs write nothing; page code has no write calls. |
| OF2 | CONFIRMED | Walk: expired token shows "Oferta vencida", withdrawn shows "Offer withdrawn", taken shows "Job taken", all with no action buttons. Spec covers unknown and malformed tokens. |
| OF3 | CONFIRMED (unconfigured path) | Spec passes. The SpecNook client was also driven against a local mock API: approved, pending, 404, 500, unreachable and push 201 and 503 all map as documented. |
| OF4 | CONFIRMED | Walk: counter with price and note, details with text, decline with reason, all through the page. Spec covers the required-field errors, the PNG upload path and the byte-sniffed refusal. See D4 for production upload size. |
| OF5 | CONFIRMED | Walk: after the inbox accept, the page showed "Alex accepted your price ... $190" and Confirm assigned the job at $190; the counter row became `confirmed`. |
| OF6 | CONFIRMED | Walk: Spanish sub sees "Oferta de trabajo de La Vaca", "Su pago", "Paneles de yeso", "Quedan 23h 57m", Spanish decline reasons and notice, `main lang="es"`. See D6 for two English strings. |
| SEC1 | CONFIRMED | Spec passes (413, 400, 429, no detail echoed). My probe: a 40 MB multipart answers 413; a chunked 40 MB body without Content-Length answers 400 and stores nothing. |
| SEC3 | CONFIRMED | `randomBytes(32).toString('base64url')`, 43 characters; unknown, short and injected tokens get the same page and the same 404 body; the admin detail strips tokens. |
| SEC5 | CONFIRMED | No file under `src/components/admin/home-services` or `src/app/offer` imports a Supabase client or a publishable key; every fetch targets `/api/admin/*`. |
| SEC6 | CONFIRMED for the offer page | axe on the offer page and its three forms: no violations except a skip link without a target (D5). One h1, labelled inputs, keyboard order Skip, Accept, Respond, Sign up. Admin screens inherit pre-existing shell issues (no `main` landmark, brand button contrast) outside this slice. |

## Defects

| ID | Severity | Where | What breaks | Fix |
| --- | --- | --- | --- | --- |
| D1 | High (ruling) | `src/lib/home-services/offers.ts:542-544`, `src/lib/specnook/client.ts:88` | An unconfigured push records `specnook_push_status='skipped'` and the note says "SpecNook push: skipped". Fable ruled this must be `pending` so the job is retried once SpecNook is configured. Nothing retries `pending` or `failed` pushes either, so even `pending` would sit forever. | Record `pending` when `pushJob` answers `skipped` (keep the client contract), update the two spec assertions (`tests/home-services-offers.spec.ts` BD5/OF5 and BD9) and the admin label. Add a retry path for `pending` and `failed` (for example a step in the offers cron) or record it as an explicit follow-up. |
| D2 | Medium | `src/lib/home-services/offers.ts:760` (`scopeLinesFor`) | The scope prefill appends the homeowner's free-text notes. My seed note "Side gate code 4411" was sent to every recipient and shown on the offer page before anyone won, in both languages. Homeowners often put addresses, gate codes or schedules there, which defeats "town only until one wins". | Leave notes out of the prefill and show them to Alex beside the scope field, or release them only on the won view. |
| D3 | Medium | `src/lib/home-services/offers.ts` (`assign` near 491, `cancelOffer` 320, `expireOffers` 737); `src/app/api/admin/offers/responses/route.ts:24` | Pending counters and detail requests on an offer that is assigned, expired or withdrawn stay in the Sub Responses inbox and its badge count forever. Every action on them is disabled and there is no dismiss, so the inbox fills with dead items. Seen in the walk with Drywall Two's question on the expired offer. | When an offer leaves `open`, close its pending responses (for example status `rejected` with an admin note), or have the inbox route return only responses whose offer is open. |
| D4 | Medium (not verifiable locally) | `src/app/offer/[token]/OfferActions.tsx:108-113`, `src/lib/home-services/attachments.ts:13` | The details form posts up to 3 files of 6 MB as one multipart body (cap about 18 MB) with no client compression. Vercel documents a 4.5 MB request body limit for functions, so two ordinary phone photos will likely be refused before the route runs. The admin detail reply has the same shape. Locally it works, so this is unproven either way. | Compress images in the browser the way slice A does (1600 px, JPEG 0.8) and cap the total under 4.5 MB, or upload through signed storage upload URLs. Verify on a preview deploy. |
| D5 | Low | `src/app/offer/[token]/page.tsx:228` | The root layout's "Skip to main content" link has no target on the offer page (axe `skip-link`). | Add `id="main-content"` to the offer page `main`. |
| D6 | Low | `src/app/offer/[token]/page.tsx:29`; scope prefill | A Spanish sub sees an English browser title "Job offer - La Vaca" and English scope lines, because the prefill uses English answer labels for every recipient. | Use `generateMetadata` with the sub's language; consider prefilling scope per recipient language or noting the language in the bid form. |
| D7 | Low | `src/lib/home-services/offers.ts:547` | Assigning the first trade of a two-trade request sets the whole request to `assigned` while the other trade is still out. In the walk the request read Assigned while drywall later expired. | Set `assigned` only when every trade on the request is assigned, or show per-trade state in the list. Fable's call. |
| D8 | Low | `src/components/admin/home-services/BidRequestForm.tsx` (`bid-violation`) | axe flags the destructive-red helper text for contrast. | Use a darker red for small text. |
| D9 | Low | `src/lib/home-services/requestsAdmin.ts:111-127` | County comes only from the town name. A request accepted by ZIP with a town outside the map (for example "Upper Montclair", 07043) gets no county and reaches only subs with no county list. The map itself covers all 24 `SERVICE_AREAS` towns with correct counties. | Fall back to a ZIP-to-county map built from `SERVICE_ZIPS`. |

Pre-existing, outside this slice, noted for the record:

- `clientIpFromHeaders` in `src/lib/rateLimit.ts` trusts `cf-connecting-ip` first. On Vercel without Cloudflare a caller can set it, so per-IP limits can be sidestepped. The per-token limit on the offer route still holds.
- The admin shell has no `main` landmark and the brand orange button fails contrast (2.53:1).
- The scope prefill renders "How many stories?: 2" with a doubled punctuation from `describeAnswers` in the catalog.

## Contract checks

- Admin reads go through `/api/admin/*` only: confirmed by grep (no Supabase client, no `from('...')` in client components).
- Tokens are 32 random bytes: confirmed.
- Offer page GET performs no writes: confirmed by code read and the spec; response count unchanged after my probes on closed tokens.
- State machine refuses closed recipients: accept, counter, decline and confirm all answer 409 with `cancelled`, `expired` or `won` on withdrawn, expired and won tokens, and wrote nothing.
- `pushJob` and `getSubStatus` degrade when unconfigured (`skipped` and `unknown`) and never throw: confirmed against a mock and unreachable host.
- `subPayViolation` is enforced server-side on send, inbox accept and reply price: confirmed by sabotage and by API calls.
- Signed URL TTL is `7 * 24 * 60 * 60` seconds: confirmed in `storage.ts`.
- Email: sub messages go through `sendTrackedEmail` with `sub_offer` and `sub_offer_notice`; owner alerts use `lead_notification`. The `sendEmail.ts` diff adds only the two union members. The two `Record<EmailCategory, true>` lists needed the new keys to typecheck.
- Telegram alerts use `sendTelegramMessage`: confirmed.
- `/offer/` analytics exclusion and `/offer` private-page entry are correct; `isPrivateTokenPage` matches `/offer` and `/offer/...` only, and no other route starts with `/offer`. The AC-R12 pin update is justified.
- Town-to-county map covers every `SERVICE_AREAS` town: confirmed (see D9 for ZIP-only towns).

## Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `eslint --max-warnings 0` on every changed `.ts`/`.tsx` file | pass |
| `ts-node ... scripts/chaos-static.ts` (without `--transpile-only`) | pass, 0 new violations |
| `npm run build` | pass |

## Spec runs (port 3115)

| Run | Result |
| --- | --- |
| 1 | 29 passed, 0 skipped (13.5 s) |
| 2 | 29 passed, 0 skipped (12.9 s) |

Sabotage, each reverted afterwards (`git diff` empty):

| Sabotage | Caught by |
| --- | --- |
| (a) assign PATCH without `status=eq.open` | BD9 fails: both concurrent accepts return 200 |
| (b) no 70% check in `sendBidRequest` | live BD2 fails: 200 instead of 400 |
| (c) expired insurance eligible | pure BD3, live BD3 and AD5 fail |

The specs assert the ACs they name, with one gap: no test fails if `specnook_push_status` is wrong in Fable's sense, because both pin `skipped`.

## Report claims I could not reproduce

- "The Dashboard tab fails because the local `leads` table has no `created_at`." Not true now: `\d leads` shows `created_at timestamptz not null default now()`. The dev log shows the real cause is `column blog_posts.title does not exist` in the local stub. It is a rig issue, not this slice.
- "`npm run chaos:static` cannot start; use `--transpile-only`." The command Fable gave, without `--transpile-only`, ran fine here.
- Repeat runs with `--repeat-each` were not rerun; two plain runs were.

## Must be verified after deploy

None of these ran against a real provider:

1. Resend delivery of the offer email and the notices (taken, won, counter accepted or rejected, reply), in both languages, and the owner alert emails.
2. Twilio SMS for offers and notices, including the 160-character shape and links.
3. Telegram alerts: counter, details, decline, job assigned, offer expired.
4. SpecNook `getSubStatus` and `pushJob` against the real API, the `pending` status after D1 is fixed, and a retry of pending pushes.
5. The Vercel cron entry `*/30 * * * *` calling `/api/cron/offers-expire` with the production `CRON_SECRET`.
6. Detail uploads with real phone photos on a Vercel deployment (D4).
7. The per-IP limit behaviour behind Vercel's real client IP headers.

## Cleanup

All `ZZTEST-RB` rows are deleted: 1 lead, 1 request, 6 subs, 3 offers with their recipients, responses and decline calls, and the rate-limit buckets for my tokens and IPs.
No storage objects were created under `service-request-photos/offers/` by my walk.
One bucket for a random, non-existent token from the body-size probe remains; it expires with its window.
