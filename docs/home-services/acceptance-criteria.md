# Home Services build - acceptance criteria and contracts

Planner: Fable. Developer: Opus (one worktree per slice). Reviewer: a second agent per slice.
Nothing is marked done by the agent that built it.
Each AC is verified by a Playwright spec that names it in its title, or by a written manual check in the slice report where a browser cannot reach it.

Prefixes: `LP` landing page, `RF` request flow, `AD` admin requests, `BD` bid requests, `OF` sub offer page, `CT` CTA tests, `PF` portfolio, `SEC` security, `SEO`.

## Shared contracts every slice relies on

These are fixed in slice 0 and are not changed by a slice without a note in its report.

### Files that already exist

- `supabase/migrations/20261029000000_home_services.sql` - every table, column and bucket.
- `src/lib/home-services/catalog.ts` - the seven services, prices, questions, SEO copy, `t()`, `toLang()`, `describeAnswers()`.
- `src/lib/home-services/pricing.ts` - 43% markup, 70% cap, money parsing and formatting.
- `src/lib/home-services/i18n.ts` - every UI string in English and Spanish, `s(key, lang)`.
- Admin tab ids pre-registered in `AdminSidebar.tsx`, `AdminContent.tsx` and `tests/admin-nav-simplified.spec.ts`: `service-requests`, `subs`, `pricing-report`, `cta-tests`. Each renders a placeholder component under `src/components/admin/home-services/` that the owning slice replaces.
- Middleware public routes: `/api/home-services/`, `/api/offers/`, `/api/cta/`, `/api/projects/ingest`. Each route is self-guarded (see SEC).

### Data access

New tables have RLS enabled and no policies, except `cta_variants` (public read of active rows).
Server code reads and writes them with `supabaseRest` (`src/lib/notify/supabase-rest.ts`) or a service-role `createClient`, never the browser client.
Admin UI calls `/api/admin/*` routes; it does not query the new tables from the browser.
Do not regenerate `src/integrations/supabase/types.ts`; type the new rows by hand in the module that owns them.

### Language

`lang` comes from `?lang=es` first, then the `lv_lang` cookie, else `en`.
Every customer-facing screen in the new work renders both languages through `s()` and `t()`.
Sub-facing messages use the sub's `language`.

### Attribution cookies and parameters

- `?src=<tag>` on any `/home-services*` URL is stored in a `lv_src` cookie (30 days) and lands in `home_service_requests.source`. Unknown is `direct`.
- `?lid=<id>` is the listing id, stored the same way in `lv_lid` and `listing_id`.
- `utm_*` parameters are collected into `utm` (jsonb).
- `cta_v` cookie, written by the homepage's inline pre-paint script: `P=<key>;S=<key>;R=<seed>` (for example `P=B;S=A;R=9f2c...`), stored URI-encoded because a raw `;` would end the cookie, so the raw value reads `P%3DB%3BS%3DA%3BR%3D9f2c...`. 180 days, path `/`, SameSite=Lax, Secure, readable by JavaScript.
  `P` and `S` are the variant keys the visitor was shown; `R` is a 32-hex assignment seed drawn from `crypto.getRandomValues` on the first visit, and a new visitor's keys are `fmix32(fnv1a(R + ":" + button)) % activeCount` over the active keys in A-G order.
  A part may be missing (for example no `S` while a button falls back to built-in wording).
  The request route decodes the value, splits on `;` and `=`, ignores unknown parts such as `R`, and stores `P` and `S` (when they are A-G) in `cta_variant_primary` and `cta_variant_secondary`.
- `cta_vid` cookie: the CTA counting identity, `<uuid v4>.<HMAC-SHA256 of the uuid with INTERNAL_WEBHOOK_SECRET, base64url>`, minted only by `POST /api/cta/event` on a visitor's first event; httpOnly, SameSite=Lax, Secure on https, 180 days, path `/`.
  The browser never reads or writes it; `cta_events.visitor_id` is its uuid.
  A missing cookie mints a fresh id and records the event; a present but badly signed one gets 204 with nothing recorded, plus a fresh signed cookie.

### Request flow API (slice A owns, slice B reads)

`POST /api/home-services/photos` multipart, fields `photo` (one file) and optional `draft_token`.
Returns `{ id, draft_token }`. First call mints the token (32 random bytes, base64url).
Limits: 10 per token, 6 MB per file after client compression, jpeg/png/webp/heic.
Stored at `service-request-photos/drafts/<draft_token>/<id>.<ext>`.

`POST /api/home-services/request` JSON:

```
{
  services: string[],            // catalog slugs, 1..7
  answers: { [slug]: { [key]: value } },
  address: string, zip: string, town?: string,
  photo_ids: string[], draft_token?: string,
  first_name: string, last_name?: string, phone: string, email?: string,
  timing: 'this_week' | 'two_weeks' | 'flexible',
  notes?: string, consent_sms: boolean,
  lang: 'en' | 'es',
  started_at: number,            // epoch ms when the sheet opened (timing check)
  honeypot?: string,             // must be empty
  recaptchaToken: string, recaptchaAction: 'home_services_request', recaptchaV2Token?: string
}
```

Order of checks: body size cap (32 KB), schema, honeypot (silent 200), started_at under 5 s (silent 200), rate limit per IP (5 per minute) and per phone (3 per hour), reCAPTCHA (reuse `verifyRecaptcha`, `verifyRecaptchaV2`, the E2E bypass token), ZIP in service area (403 `{ error: 'out_of_area' }`), dedupe (same normalised address + same service set within 24 h merges: appends answers and photos to the existing request, `merged_count + 1`, returns `{ merged: true }`), then insert `leads` through `sanitizeLeadForInsert` + `scoreLead` with `inquiry_type='estimate'`, `project_type='home_services'`, `source='home_services:<src>'`, `message` = `describeAnswers()` lines plus notes, then insert `home_service_requests`, claim photos (`request_id` set, moved to `requests/<request_id>/`), send `sendTelegramLead` and `sendNewLeadEmail` with `services` and photo links (signed, 7 days), send `createLeadFollowUpSequence` when there is an email, send the customer confirmation text when SMS is configured, and start OTP when SMS is configured (`status='held'`), else `status='new'`.
Response: `{ ok: true, request_id, status, verification: 'sent' | 'skipped', merged }`.

`POST /api/home-services/verify` `{ request_id, code }` and `POST /api/home-services/verify/resend` `{ request_id }`.
Code is 4 digits, hashed (sha256 with `INTERNAL_WEBHOOK_SECRET` as salt), expires in 10 minutes, 5 attempts, 3 sends.
Success sets `phone_verified`, `phone_verified_at`, `status='new'` and fires the owner alert if it was held.

Service area: ZIP in `SERVICE_ZIPS` (export it from `leadScoring.ts`) or town in `SERVICE_AREAS`.
The county list in the copy is Essex, Morris and Bergen; the ZIP list is the gate.

### SMS (slice A owns, slice B uses)

`src/lib/home-services/sms.ts` exports `sendSms({ to, body }) => Promise<{ status: 'sent' | 'not_configured' | 'failed'; sid?: string; error?: string }>` and `isSmsConfigured()`.
Twilio Messages API over `fetch`, env `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`.
Never throws.

### SpecNook (slice B owns)

`src/lib/specnook/client.ts` exports `isSpecNookConfigured()`, `getSubStatus(specnookSubId) => 'approved' | 'pending' | 'unknown'`, `pushJob(payload) => { status: 'sent' | 'skipped' | 'failed' }`.
Env `SPECNOOK_API_URL`, `SPECNOOK_API_KEY`, `SPECNOOK_SIGNUP_URL` (default `https://specnook.com/signup`).
Unconfigured: status comes from `subs.status`, push returns `skipped`.

### Project ingest (slice D owns)

`POST /api/projects/ingest` with `Authorization: Bearer <PROJECT_INGEST_TOKEN>` (constant-time compare, 32+ chars, unset means 404) or an admin session.
Body JSON or multipart (`project` JSON field plus `files[]`).
Always creates `status='draft', active=false, source='api'`.
Returns `{ id, url_slug, admin_url: '/vaca-mgmt?tab=projects&project=<id>' }`.

---

## LP - landing page `/home-services`

- **LP1** The page renders the seven catalog cards with name, starting price, unit and the two-line description, in catalog order.
- **LP2** Tapping anywhere on a card except the price toggles selection; the card shows a checked state and the sticky "Request these (n)" bar appears with the count.
- **LP3** Tapping the price opens a sheet with "What's included" and "What raises the price" from the catalog; the sheet does not change selection.
- **LP4** "Request these" opens the request flow in-page (no navigation, URL gains `#request`); browser back closes it.
- **LP5** A home care section follows the cards: pitch, "Free seasonal plan", one button to `/home-care`.
- **LP6** The old nine-tile catalog, the old hero CTAs to `/request-estimate` and the walk-through band are gone from this page.
- **LP7** `?lang=es` renders every string on the page in Spanish, the toggle switches back, and the choice persists on reload via cookie.
- **LP8** `/home-services/<slug>` exists for all seven slugs, carries the catalog SEO title and description, the service's card, included and raises lists, FAQ, and opens the flow with that service preselected; an unknown slug 404s.
- **LP9** `?src=craigslist` on either page is stored and reaches `home_service_requests.source`.
- **LP10** Sitemap lists `/home-services` and the seven service pages.
- **LP11** Lighthouse mobile performance for `/home-services` is at or above the current page's score (measure before and after; record both).

## RF - request flow

- **RF1** Step 1 (details) shows, for each selected service, its three tap groups from the catalog; nothing is required.
- **RF2** Photos: camera first on mobile, gallery second; each picked file is compressed in the browser (max 1600 px, JPEG 0.8) and uploaded immediately; thumbnails show progress; up to 10.
- **RF3** Address is required. With no Places key a street field and a ZIP field render; with `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` set, one autocomplete field renders and fills ZIP and town.
- **RF4** An out-of-area ZIP shows the polite decline on step 1 and does not proceed.
- **RF5** Step 2 (contact): name and phone required, email optional, timing three taps defaulting to flexible, consent checkbox required, submit.
- **RF6** A submit under five seconds from open, or with the honeypot filled, returns 200 and saves nothing.
- **RF7** A valid submit creates one `leads` row (scored, alerted) and one `home_service_requests` row with services, answers, source, lang, cta keys and timing; photos are claimed.
- **RF8** The confirmation screen shows the done copy; when SMS is configured it also shows the 4-digit code field, and a correct code flips status held to new.
- **RF9** With SMS unconfigured the request is `new`, `phone_verified=false`, and no code field is shown.
- **RF10** The same address and service set within 24 hours merges rather than duplicating, and the UI says so.
- **RF11** Rate limits: the sixth submit from one IP inside a minute gets 429; the fourth for one phone inside an hour gets 429.
- **RF12** The owner Telegram and email carry the services, the answers as lines, the timing, the source and signed photo links.
- **RF13** All of RF1 to RF11 pass in Spanish.

## AD - admin service requests

- **AD1** Customers > Service Requests lists requests newest first with status, services, town, source, phone-verified flag and age; filters by status, service, source and county; a Held tab shows unverified ones.
- **AD2** A request opens to a detail panel: every field, the answers as lines, a photo gallery from signed URLs, a map link (Google Maps search of the address), one-click call and SMS links, notes, status change.
- **AD3** Status change persists and is logged in `admin_notes` with a timestamp.
- **AD4** Marking Won stores `won_at` and `customer_price_cents`; marking Lost stores `lost_reason`.
- **AD5** Subs tab: list, add, edit, approve or suspend, trades and counties, language, insurance and HIC expiry; expired dates show a red flag and block offers.
- **AD6** Pricing report: per service, decline rate, top decline reasons, average counter price, grouped by county, from `offer_responses`, `job_offers` and `decline_calls`.
- **AD7** A dashboard card on Service Requests shows counts by source and service for the last 30 days and the close rate (won over new+).

## BD - bid requests

- **BD1** "Send bid request" on a request opens a form: trade (one per service on the request, pre-filled), sub pay, computed customer price (sub pay x 1.43), scope summary, town, photos to share, target dates.
- **BD2** Sub pay above 70% of the customer price is blocked with the reason from `subPayViolation`.
- **BD3** Sending creates `job_offers` (expires in 24 h) and an `offer_recipients` row for every sub whose status is approved, trades include the trade, counties include the request's county (or any county when none set), and no expired insurance or HIC; it sends each one an email (Resend) and a text (SMS lib) in the sub's language with the offer link.
- **BD4** A multi-service request creates one offer per trade.
- **BD5** Sub Responses inbox lists pending counters and detail requests with reply actions: accept counter (sub must then confirm), reject, reply with a new price, answer details (text and files).
- **BD6** Answering a detail request extends that recipient's `expires_at` by the paused duration.
- **BD7** A decline creates a `decline_calls` row; the inbox shows open call tasks with name, phone and reason; Alex logs the outcome, counter price and whether they will take it.
- **BD8** An offer with no acceptance after 24 h is marked expired by `/api/cron/offers-expire` and the request is flagged for Alex.
- **BD9** The first confirmed acceptance assigns the offer, closes every other recipient with reason taken, sends them a notice, releases the full address to the winner, sets the request to assigned, and calls `pushJob` (recording the push status).

## OF - sub offer page `/offer/[token]`

- **OF1** GET is read-only and noindex; it shows job summary, trade, town only, start window, pay, expiry countdown, and the four responses.
- **OF2** An unknown token shows the generic invalid message; an expired or taken offer shows its message and no buttons.
- **OF3** Accept is shown only when the sub is approved (SpecNook status when configured, else `subs.status`); otherwise the single button is the SpecNook signup link carrying `?trade=<trade>&ref=<offer id>`.
- **OF4** Counter requires a price and takes an optional note; details requires text and allows files; decline takes an optional reason.
- **OF5** After Alex accepts a counter the page shows the confirm step and confirming assigns the job (BD9).
- **OF6** All of the above in Spanish for a sub whose language is es.

## CT - CTA tests

- **CT1** The hero renders two buttons from active `cta_variants`: primary links to `/home-services#services`, secondary to `/portfolio`.
- **CT2** Assignment is even and sticky: a visitor keeps the same variant across reloads via `cta_v`; a view event is recorded once per visitor per variant.
- **CT3** A click records a click event once per visitor per variant.
- **CT4** Marketing > CTA Tests shows, per button and variant: views, clicks, requests, valid leads (phone verified or, when SMS is unconfigured, status new or later), won jobs, conversion rate, and the current leader with sample size; below `site_settings.cta_min_visitors` it says "not enough visitors yet" instead of a leader.
- **CT5** Variants are editable in admin: wording, subtext, colour, active; at most seven per button.
- **CT6** `ABTesting.tsx` is deleted.

## PF - portfolio

- **PF1** The Projects tab opens a single-page form: title, location (datalist from service areas), service types, one drop zone, Save draft. No step indicator, no AI buttons, no Gemini call anywhere in `src/`.
- **PF2** Each thumbnail has a Before / During / After toggle, a featured star, a remove, and the pair link tool stays.
- **PF3** Save draft inserts `status='draft', active=false` through `/api/admin/projects`; the public site never renders it (`/projects/<slug>` 404s, galleries exclude it).
- **PF4** The manager has a Drafts section with Publish and Publish + feature buttons; Publish sets `status='published', active=true, published_at`, and the project renders publicly within the ISR window.
- **PF5** `POST /api/projects/ingest` with the bearer token creates a draft from JSON (with existing storage paths) and from multipart files; without the token it 401s; with the token unset it 404s.
- **PF6** A "Draft photos in storage" panel lists `project-images/drafts/*` and can start a draft from a selection without re-uploading.
- **PF7** Editing an existing published project keeps it published; the edit form is the same single page.
- **PF8** `analyze-project` route and `GOOGLE_GEMINI_API_KEY` reads are removed from the project upload path.

## SEC - security and structure

- **SEC1** Every new public route rejects bodies over its cap, validates with zod, rate limits by IP, and never echoes server errors.
- **SEC2** Photo uploads are server-side into a private bucket; admin views use signed URLs with a 7-day TTL; content type is checked by magic bytes, not the client header.
- **SEC3** Offer tokens and draft tokens are 32 random bytes; lookups never distinguish unknown from expired to an unauthenticated caller beyond the spec'd messages.
- **SEC4** `/api/projects/ingest` compares the bearer token in constant time.
- **SEC5** No admin page or API reads a new table with the publishable key.
- **SEC6** HTML structure: one `h1` per page, landmarks, labels on every input, buttons reachable by keyboard, colour contrast on the cards at AA.

## SEO

- **SEO1** Landing and service pages have unique titles under 60 characters and descriptions under 160 with the county names.
- **SEO2** Each service page emits `Service` JSON-LD with `offers.price` from the catalog and `areaServed` for the three counties, merged under the site organization `@id`.
- **SEO3** The homepage hero buttons are real links (crawlable) to `/home-services` and `/portfolio`.
