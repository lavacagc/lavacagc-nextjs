# Home Services build - security and structure review

The third pre-launch review pass the build spec requires: form handling, bot protection, upload handling, admin access, rate limits, calls to SpecNook, HTML structure and accessibility.
Reviewer: security reviewer agent, 2026-10-29.

## What was reviewed

- Head commit reviewed: `959e702` (Merge branch 'worktree-agent-aebc8600219c08d69' into feat/home-services-request-flow).
- Scope: the new surface in `git diff 35ba93b..959e702`, as listed in the review brief (public routes, admin routes, pages, the two storage buckets, and `src/lib/{home-services,cta,projects,specnook}`).
- Rig: the local Supabase stack (`127.0.0.1:55421`), `npm run dev -- -p 3122` for the dynamic checks, then `npm run build && npm run start -- -p 3122` (once plain, once with `VERCEL_ENV=production`) for headers, CSP, raw HTML, the reCAPTCHA bypass and the axe pass.
- Nothing was sent to the hosted Supabase project or to www.lavacagc.com.
  The only production-adjacent action was a public DNS lookup of `www.lavacagc.com`.
- Test rows were prefixed `ZZTEST-SEC` and deleted at the end (see "Cleanup").
- Fixes are committed on this worktree branch, one commit per finding, after `959e702`.

## Verdict

**LAUNCH WITH CONDITIONS.**

No finding in the new code is exploitable by an anonymous visitor beyond the documented rate-limit spoofing, and every contract check (SEC1 to SEC6) held under direct probing.
The conditions are about what the new admin surface stands on rather than what it adds:

1. Upgrade `next` from 16.1.6 to a release that clears the open advisories (S-01) before the first deploy, through the normal gate.
   Several are middleware or proxy bypasses, and middleware is the only gate on every `/api/admin/*` route this branch adds.
2. Confirm in the hosted Supabase dashboard that public sign-up is disabled (S-03).
   The admin gate accepts any signed-in GoTrue user, so open sign-up would hand every homeowner's name, phone, address and photos to anyone who registers.
3. Close direct origin access or narrow the `cf-connecting-ip` trust (S-02), or accept in writing that the per-IP limits are advisory on the `*.vercel.app` origin until that follow-up lands.
4. Run the "verify after the first deploy" list in `follow-ups.md`, plus the production assumptions below.

## Findings

Severity follows CVSS-style judgement of exploitability and impact on this deployment.
"Fixed" names the commit on this branch; everything else is a recommendation.

| ID | Area | Severity | Finding | Evidence | Status |
| --- | --- | --- | --- | --- | --- |
| S-01 | Dependencies | High | `next@16.1.6` carries 38 advisories, 4 critical (RCE in the image optimizer with SVG or AVIF, RCE in `use cache`, RCE on Windows hosts) and several high "Middleware / Proxy bypass" issues (GHSA-492v-c6pp-mqqv, GHSA-267c-6grr-h53f, GHSA-26hh-7cqf-hhc6, GHSA-6gpp-xcg3-4w24). Every new admin route relies on middleware alone. Pre-existing, not introduced by the branch, but the branch multiplies what a bypass would expose. | `npm audit --omit=dev`. Twenty known bypass shapes tried locally against the production build (`x-middleware-subrequest`, encoded and dot segments, trailing and double slashes, RSC and segment prefetch on `/vaca-mgmt`, `.rsc` and `.segments` suffixes, public-prefix traversal): all answered 401, 307 to `/auth`, 308 to the canonical path, or 404. No bypass reproduced, which does not clear the advisories. | Recommendation: upgrade `next` (the critical `<=16.4.0` advisories need a release after 16.4.0) through the no-mistakes gate before launch. Defence in depth: have each `/api/admin/*` handler confirm the session itself (one shared helper), so a middleware bypass is not a data breach. |
| S-02 | Rate limits | Medium | `clientIpFromHeaders` trusts `cf-connecting-ip` first, unconditionally. A request that reaches the Vercel origin directly (any `*.vercel.app` URL) can send a fresh value each time and get a fresh bucket for every per-IP limit (request, photos, verify, resend, offers, CTA, ingest). Known follow-up from slice C. | Same `cf-connecting-ip`, six submits: `403 403 403 403 403 429`. Rotating it: six `403`. Rotating only `x-forwarded-for` locally: six `403`. The per-phone limit still holds against rotation: same phone from four IPs gave `403 403 403 429`, and `+1 (973) 555-0499` hit the same bucket as `9735550499`. DNS: `www.lavacagc.com` resolves to `104.21.66.251` and `172.67.210.169` with Cloudflare name servers, so Cloudflare does set the header on `www` traffic. | Recommendation (not applied: a wrong guess about what Vercel puts in `x-real-ip` behind Cloudflare would bucket every customer under a Cloudflare edge IP and 429 real leads). Either turn on Vercel Deployment Protection for generated URLs so only `www` serves the public, or trust `cf-connecting-ip` only when `x-real-ip` falls in Cloudflare's published ranges, verified on a preview first. reCAPTCHA and the phone limit still bound SMS spend meanwhile. |
| S-03 | Admin access | High (conditional) | The admin gate (`middleware.ts` `verifySupabaseSession`, `projects/session.ts` `adminUserId`) accepts any authenticated GoTrue user; there is no role or allowlist. The site ships a `signUp` helper (`src/hooks/useAuth.tsx`). If hosted sign-up is enabled, anyone can register and read every request, sub and offer. Pre-existing pattern, now guarding far more personal data. | Locally a plain user created through the admin API (no role, no metadata) gets `200 {"subs":[...]}` from `/api/admin/subs`. Hosted sign-up setting not checked (out of bounds). | Recommendation: confirm sign-up is off in the hosted project before launch (launch condition 2), and add an allowlist check (an `ADMIN_EMAILS` list or an `app_metadata.role`) next to `getUser()` in middleware and `adminUserId`. |
| S-04 | Uploads | Low | The homeowner photo route and the offer attachment sniffer accepted any file that merely started with an image signature: a JPEG header followed by `<html><script>` was stored as `image/jpeg`. The project upload sniffer already refused that shape. Served back as `image/jpeg`, so no script ran; the risk is stored hostile content in the private bucket. | Before: `POST /api/home-services/photos` with `\xff\xd8\xff\xe0<html><script>...` answered `200 {"id":...}`; the same file as an offer `details` attachment answered `200 {"ok":true,"outcome":"details_sent"}`. After: `415 unsupported_type` and `400 bad_file_type`; a real JPEG still `200`. | Fixed in `1d19fd0` (shared `carriesMarkup` guard from `src/lib/projects/media.ts`). |
| S-05 | Tokens and signed URLs | Low | The public offer page signed homeowner photos and Alex's reply attachments with the 7-day admin TTL, so a link copied from a 24-hour offer kept working a week after the offer closed. | Decoded the signed URL token on `/offer/<token>`: `exp - iat = 604800` before, `86400` after. | Fixed in `6b6f7cb`. Admin views and the SpecNook push keep 7 days (SEC2). |
| S-06 | Input handling | Low | `/api/offers/<token>` returned the zod message for a schema failure, which for a bad decline reason lists every accepted reason. Not an injection (JSON, no echo of input), but it is server detail and inconsistent with the generic codes elsewhere. | Before: `{"error":"Invalid option: expected one of \"pay_too_low\"\|\"too_far\"\|...}`. After: `{"error":"invalid_body"}`; `price_required` and `details_required` still come back for the page to translate. | Fixed in `5636640`. |
| S-07 | Input handling | Low | `/api/home-services/{request,verify,verify/resend}` read the whole body with `request.text()` before comparing it with the cap, so a chunked or falsely declared body was buffered in full first. | After the fix a 5 MB chunked body with no `Content-Length` answers `413 payload_too_large` in 10 to 16 ms on all three routes; bad JSON and empty bodies still `400 invalid_request`. | Fixed in `0328a1d` (the streaming `readCappedJson` the CTA routes already use). |
| S-08 | Uploads | Low | Project signed uploads: the uploader picks the `Content-Type` of the PUT, and `verifyStored` checks only the first 1 KB of bytes, not the stored type. A JPEG header, 1.1 KB of padding, then HTML, PUT as `text/html`, passed verification and became an image on a new draft. Minted keys that are never verified also stay in the public bucket for good. Needs the ingest token or an admin session. | Local storage stored it and served it as `text/plain; charset=UTF-8` (Supabase's own downgrade of `text/html`), so it rendered as a broken image, not a page. A second PUT to the same signed URL answered `409 Duplicate`, so there is no overwrite. | Recommendation: return the stored `Content-Type` from `readStoredHead` and refuse a mismatch with the sniffed type; purge `projects/<ms>-<hex>` keys that nothing references after a day. Not applied: the admin browser path sets the PUT type from `File.type`, so a strict comparison needs testing against real `.mov` and `.m4v` files first. |
| S-09 | Bot protection | Info | The 5-second fill check compares two client-supplied clocks (`started_at`, `submitted_at`), so any script defeats it. It is a cheap filter for naive bots; reCAPTCHA is the real gate and runs after it. | `started_at: 0` with no `submitted_at` passed the timer and reached reCAPTCHA (`403 verification_failed`). Honeypot and a 1-second fill both got the silent `200` with a random id and stored nothing. | Recommendation, optional: a server-issued signed start stamp. |
| S-10 | Accessibility | Low | When the request sheet closes (Escape or the close button), focus lands on `<body>` instead of returning to the button that opened it, on both `/home-services` and a service page. | Focus log on `/home-services/gutter-cleaning`: `focusin BUTTON[request-this]`, `focusin H3`, Escape, `focusout H3 -> null`, then `popstate`; `document.activeElement` is `BODY` while `request-this` is still in the DOM. Hiding the landing page's request bar instead of unmounting it did not change this, so the cause is in the sheet's close path (Radix focus return versus the `history.back()` in `useHashSheet`), not the opener. | Recommendation: capture the opener when the sheet opens and focus it in `onCloseAutoFocus` (falling back to the request bar's button). Left for slice A; it needs a keyboard spec. |
| S-11 | Accessibility | Info | Axe violations exist on the pages, but all are in shared components the branch did not touch. The new components (cards, request bar, sheet, service page body, offer page) have none. | See "Axe results". | Recommendation for the site backlog, not this branch. |
| S-12 | Tokens and ids | Info | `/api/home-services/verify` answers `{ok:true,status}` for an already verified id, which tells a caller that the id exists. A merge returns the earlier request's id, but only to someone who knows its address, services and phone. Request ids are UUIDv4, so neither is a practical oracle. | Unknown id: `400 invalid_code`. Unknown id on resend: `200 {"ok":true}`, same as a real one. | No action. |
| S-13 | CTA counting | Low | Known follow-up: a cookieless client gets a fresh signed visitor on every event, so it can add up to 60 views a minute per IP (more with S-02). Clicks need a prior view by the same visitor, so clicks cannot be inflated without keeping the cookie. A forged `cta_vid` is not trusted. | `cta_events` is not writable with the publishable key (`401`, RLS). | No action beyond the existing follow-up. |
| S-14 | Tokens and ids | Low | Known follow-up: the verify attempt counter is read then written, so parallel guesses can exceed 5 per code. Bounded by the per-id limit of 15 an hour and the 10-minute expiry. | Code review; not reproduced. | No action beyond the existing follow-up. |
| S-15 | SpecNook | Info | The client reads its key per call, sends it only as `Authorization: Bearer` to `SPECNOOK_API_URL`, never logs it and never returns it, and never throws. The public offer page calls `getSubStatus` on every render with no page rate limit, bounded by knowing a 32-byte token. | Code review; SpecNook unset locally, so `subCanAccept` used `subs.status`. | No action. |
| S-16 | Input handling | Info | The ingest multipart path checks `Content-Length` only when declared, so a chunked upload is buffered by `formData()`. Authenticated callers only, and Vercel caps a function body at 4.5 MB. | Code review. | No action. |
| S-17 | Logging | Info | Signed photo URLs are never logged: the owner alert logs channel statuses only. `next.config.ts` `logging.fetches.fullUrl` prints PostgREST URLs, including the offer token filter, but only under `next dev`; on Vercel `removeConsole` strips `console.log` too. | Dev log line: `GET .../offer_recipients?...&token=eq.<token>`. | No action. |

Counts: Critical 0, High 2, Medium 1, Low 8, Info 6.
Fixed on this branch: S-04, S-05, S-06, S-07.
The commits and code comments call these fixes F1 to F4, in that order.

## Checks that passed, with evidence

### 1. Input handling (SEC1)

- Every new public route parses with zod after a body cap and answers generic codes, with no stack trace or database text.
- `/api/home-services/request`: 40 KB `413 payload_too_large`; bad JSON, wrong types, `[]` and `null` all `400 invalid_request`; `GET` `405`.
- `/api/home-services/verify` and `/verify/resend`: 2 KB `413`; bad shape `400 invalid_request`; unknown id on verify `400 invalid_code`.
- `/api/home-services/photos`: no length `411 length_required`; 7 MB `413 too_large`; HTML renamed `.jpg` and SVG `415 unsupported_type`; missing field and garbage multipart `400 invalid_request`.
- `/api/offers/<token>`: malformed and unknown tokens both `404 invalid_link`; 9 KB JSON `413`; files on a non-`details` action `400 invalid_body`; negative and `1e20` counters `400 price_required`; `GET` `405`.
- `/api/cta/event`: 2 KB `413`; an extra key `400 Invalid event` (strict schema).
- Admin routes read capped JSON (1 KB to 256 KB) and validate with zod; failures name a field for the admin form but never a database error (`serverError` logs and answers "Check the server log").
- PostgREST filters are built only from validated values (UUID regexes, catalog slugs, enums) or `encodeURIComponent`; a non-UUID project id on the ingest publish route answered `404 Project not found.`

### 2. Bot protection

- Order on the request route: cap, schema, honeypot (silent 200 with a random id), timer (silent 200), business validation, per-IP limit (5 a minute), per-phone limit (3 an hour), reCAPTCHA, service area.
  The limits run before reCAPTCHA, so a flood costs no reCAPTCHA assessments.
- E2E bypass: an out-of-area ZIP separates the outcomes without storing anything.
  Production build without `VERCEL_ENV`: the bypass token was accepted (`403 out_of_area`, reached after reCAPTCHA).
  Same build started with `VERCEL_ENV=production`: `403 verification_failed`.
  A token one character off: `403 verification_failed`.
  Unset or shorter than 32 characters is inert by code (`isE2eRecaptchaBypass`).

### 3. Uploads (SEC2)

- Object keys are always server-built: `drafts/<server token>/<uuid>.<sniffed ext>`, then `requests/<request id>/...` on claim; offer files `offers/<offer id>/<recipient id>/<who>-<uuid>.<ext>`; project files `projects/<ms>-<12 hex>.<ext>` or `projects/<id>_<n>.<ext>`.
  A `draft_token` of `../../etc` was ignored and a fresh token minted; a token whose photos were already claimed was not reused.
- Private bucket really private: `service-request-photos` has `public = false`; its public URL answered `400`; the authenticated URL with the publishable key and with a plain user JWT answered `400`; listing as anon or user returned `[]`; uploads as anon `403`.
- `project-images` is public by design; anon and plain-user uploads were refused `403` locally (the hosted admin policies are a production assumption).
- Signed URL TTLs: 7 days in alerts, the admin detail and the SpecNook push (`SIGNED_URL_TTL_SECONDS`), one day on the offer page after S-05.
- Orphan purge: `purge-draft-photos` deletes objects first, then rows still unclaimed, older than 48 hours; re-running is harmless.
- Signed project uploads: minted only behind the ingest token or an admin session, for a key the server picks, single-use (second PUT `409 Duplicate`); see S-08 for the type gap.

### 4. Tokens and ids (SEC3, SEC4)

- Offer and draft tokens: `randomBytes(32).toString('base64url')`, matched with `^[A-Za-z0-9_-]{43}$` before any lookup.
- Offer lookups: malformed and unknown both `404 invalid_link` on the API and the same "This link is not valid" page; per-token limit 20 per 10 minutes, fail-closed, tripped at the 16th call from 22 rotating IPs in the test (the earlier calls in that window counted).
- OTP: 4 digits from `randomInt`, stored as `sha256(code + INTERNAL_WEBHOOK_SECRET)`, compared with `timingSafeEqual`, 10-minute expiry, 5 attempts, 3 sends; no verification starts when the salt is unset.
- CTA visitor: `uuid.HMAC-SHA256`, httpOnly, SameSite=Lax, compared in constant time; a forged cookie is not trusted for the event.
- Ingest bearer: both sides hashed with SHA-256 then `timingSafeEqual` (constant time with no length leak); under 32 characters or unset means 404 for everyone (covered by `tests/project-drafts.spec.ts`); no header and a wrong token both `401`; rate limited before the check.

### 5. Authorisation (SEC5)

- All 28 method and path combinations under the new `/api/admin/*` routes answered `401` without a session and with a forged `sb-127-auth-token` cookie; `/vaca-mgmt?tab=service-requests` redirected `307` to `/auth?next=...`.
- PostgREST with real `ZZTEST-SEC` rows present (two requests, three photos, a sub, an offer, a recipient):

| Table | Rows with the publishable key | Rows with a plain user JWT | Rows in the table |
| --- | --- | --- | --- |
| home_service_requests | 0 | 0 | 2 |
| lead_photos | 0 | 0 | 3 |
| subs | 0 | 0 | 1 |
| job_offers | 0 | 0 | 1 |
| offer_recipients | 0 | 0 | 1 |
| offer_responses | 0 | 0 | 0 |
| decline_calls | 0 | 0 | 0 |
| cta_variants | 3 (active only) | 3 | 6 |
| cta_events | 0 | 0 | 2 |

- Anon inserts into `cta_events` and `home_service_requests` were refused by RLS (`401`, `42501`); an anon or user PATCH of `cta_variants` matched nothing (`200 []`).
- The new admin components call only `/api/admin/*`; their only direct Supabase reads are the existing `google_reviews` and `service_areas` tables, and the browser video upload goes through a server-minted signed URL.

### 6. Data exposure

- Production build, raw HTML of a live `/offer/<token>` (57 KB): zero occurrences of the homeowner's notes, phone, email, street, full name, the customer price (`99900`, `$999`), the sub's notes and phone, `admin_notes`, `lead_id`, `specnook_sub_id`, insurance or HIC dates, or any `rest/v1` URL.
  It shows, by design, the trade, town, scope, the sub pay (`$111`) and the signed photo links.
- The development build's page did carry `specnook_sub_id` and the PostgREST URL in React's dev-only debug payload; it is absent from the production build.
- Owner alerts carry the request and signed photo links to Telegram and the owner's email only; no secret, token or key is included, and only channel statuses are logged.
- A merge returns only the earlier request's id and status, and only to the same phone, address and services (dedupe key includes the phone digits); a second household at the same address got its own request.
- The ingest API answers `401` without the token on create, uploads, update and publish.

### 7. Headers and CSP

- Production build: `/`, `/home-services`, `/home-services/gutter-cleaning`, `/home-services?lang=es`, a live and an unknown `/offer/<token>`, and the API routes all carry the site CSP, `X-Frame-Options: SAMEORIGIN`, `nosniff` and HSTS.
- `/offer/*` adds `<meta name="robots" content="noindex, nofollow">` and `referrer: no-referrer`, so the token never leaves in a `Referer`.
  The landing and service pages are `index, follow`, as SEO needs.
- The development-only `http://127.0.0.1:* http://localhost:*` sources are absent from `.next/routes-manifest.json` in the production build (`img-src`, `media-src`, `connect-src` checked).
- `blob:` in `media-src` is justified: the admin project form previews a picked video from `URL.createObjectURL` while it uploads. A `blob:` URL can only be minted by script already running on the page, so it widens nothing an attacker can reach without an existing XSS.

### 8. Crons

- `offers-expire` and `purge-draft-photos` answered `401` with no header, a wrong bearer, an admin session cookie, and `x-vercel-cron: 1` alone.
- With `Bearer CRON_SECRET`: `200`, and a second run returned the same idempotent result (`checked: 0` for expiry, `candidates: 0` for the dry purge).
- `offers-expire` also checks the secret itself in constant time; `purge-draft-photos` relies on the middleware check.

### 9. HTML structure and accessibility (SEC6)

See "Axe results".
Each page has exactly one `h1`, a `main`, the site header, nav and footer (the offer page is a bare `main` by design), `lang` set, and no unlabeled input.
Keyboard: a service card toggles with Space (`aria-pressed=true`) and the request bar appears; Enter on the bar opens the sheet; focus moves into the sheet to the step heading; 40 Tab presses never left the sheet; Escape closes it (focus return is S-10).

### 10. Dependencies

- The branch added no packages: `package-lock.json` is unchanged since `35ba93b`, and `package.json` changed only four script lines (`ts-node -P tsconfig.scripts.json`).
- `npm audit --omit=dev`: 17 vulnerable packages, 1 critical, 9 high, 7 moderate, all pre-existing.
  - `next` 16.1.6 (critical, direct): see S-01.
  - `zod` 4.1.13 (high, direct): memory exhaustion validating oversized constrained collections (GHSA-mrhx-c7xc-m3w5, fixed in 4.6.6). Every new public route caps the body (1 KB to 32 KB) before zod sees it, so the exposure is bounded; upgrade with `next`.
  - `dompurify` (high, direct), `postcss` (high, direct), `sharp`, `lodash`, `picomatch`, `nanoid`, `browserslist`, `source-map-js` (high, transitive).
  - `react-quill`/`quill`, `resend`/`svix`/`uuid`, `postcss-selector-parser`, `baseline-browser-mapping` (moderate).

## Axe results

axe-core 4 (bundled), tags `wcag2a wcag2aa wcag21a wcag21aa best-practice`, viewport 390x844 (mobile, touch), production build.

| Page | Violations | Where |
| --- | --- | --- |
| `/` (homepage hero) | color-contrast (4 nodes, serious), region (1, moderate), scrollable-region-focusable (1, serious) | Header phone link `#ee893c` on white 2.53:1; Home Care banner pills "Ridgewood, NJ" 4.32:1 and "Book it" 2.98:1; "Contact us" in the service-areas section 2.47:1; the Header top bar link outside a landmark; the Services carousel `overflow-x-auto` with no focusable child. None in `Hero.tsx` or the CTA buttons. |
| `/home-services` | heading-order (1, moderate), region (4, moderate) | Footer "Company" `h4`; the Header trust bar (Licensed, HIC#) outside a landmark. |
| `/home-services?lang=es` | Same two as English | Same shared components. |
| Request sheet (details step), scoped to the dialog | 0 | |
| `/home-services/gutter-cleaning` | region (4, moderate) | Header trust bar. |
| `/offer/<live token>` | 0 | |
| `/offer/<unknown token>` | 0 | |

Every violation is in `Header.tsx`, `Footer.tsx`, `HomeCareBanner.tsx` or the homepage Services section, none of which this branch changed; the new components pass (S-11).
Console errors on the local production build were all rig artifacts: the production CSP blocking `127.0.0.1` Supabase URLs that are `xrvbrnrbnyfdwkfdoepq.supabase.co` in production.

## Production assumptions not verified here

- Hosted Supabase has public sign-up disabled (S-03).
- `next` will be upgraded before deploy (S-01); until then the advisories apply to production.
- Cloudflare fronts `www` and sets `cf-connecting-ip` (DNS supports it), and nothing public reaches the Vercel origin directly, or the per-IP limits are advisory there (S-02).
- `RECAPTCHA_E2E_BYPASS_TOKEN` is not set in Vercel Production, and `VERCEL_ENV` is `production` there; either alone keeps the bypass inert.
- The hosted `projects` and `project_images` tables have RLS on, so the anon draft guard applies (already on the follow-ups launch checklist).
- The hosted `project-images` bucket allows writes only to admins and `service-request-photos` is created private by the migration (it is `ON CONFLICT` safe, so check it was not pre-created public).
- Hosted Supabase storage downgrades `text/html` to `text/plain` as the local stack did (S-08).
- The Vercel plan runs `*/30` crons (sub-daily schedules need Pro).
- Twilio, Resend, Telegram and SpecNook were unset locally, so their payloads were reviewed in code only.

## Spec runs after the fixes

- `npm run typecheck`: clean.
- `eslint --max-warnings 0` on the nine changed files: clean (the pre-commit hook also ran eslint and the typecheck on each commit).
- `TEST_URL=http://localhost:3122 E2E_LIVE_BACKEND=1 playwright test` with `home-services-landing`, `home-services-request-flow`, `home-services-offers`, `home-services-admin`, `cta-tests` and `project-drafts`, chromium, one worker, against `next dev` with all four fixes in place: **117 passed**.
- Two earlier attempts went red for reasons outside the code, recorded so nobody chases them.
  In the first, the dev server on 3122 exited partway (exit 0, nothing in its log) and 44 tests failed with `ECONNREFUSED`; on a fresh server those 44 re-ran and 43 passed.
  The remaining failure, RF10 (es) "merged: false", happened while another agent was running the same request-flow spec against the shared database from a `next dev` on port 3000.
  That spec's `beforeAll` and `afterAll` delete every `ZZTEST-A*` request, so the first half of the merge was deleted out from under the second.
  Run alone once that other run had finished, the file passed 17 of 17, and the full set then passed 117 of 117.
  Lesson for the rig: live-backend specs that clean up by prefix cannot run in two worktrees against one database at once.

## Cleanup

Deleted from the shared local stack, by exact id or the `ZZTEST-SEC` prefix only: 2 requests, 4 `lead_photos` rows and their 5 objects in `service-request-photos` (including the polyglot stored before F1 and one offer attachment), 1 sub, 1 offer with its recipient and response, 1 draft project with its image row and its `project-images` object, 2 `leads` rows, 4 `follow_up_queue` rows, the 96 `rate_limits` buckets keyed to the exact test IPs, phones and ids this review used, and the GoTrue user `sec@local.test`.
A final count of each `ZZTEST-SEC` set came back 0.
