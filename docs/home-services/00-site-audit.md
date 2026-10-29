# Home Services build - existing site audit and decisions

Date: 2026-10-29.
Planner: Fable (CEO and planner role per the build spec).
Owner: Alex, away for this run; every decision below is self-answered and can be overturned at review.

Source specs (both in `~/Downloads`, copied into this folder as `spec-landing-page.md` and `spec-website-build.md`):

- "La Vaca Home Services Landing Page Spec" (the planning doc).
- "La Vaca Home Services Website Build Spec" (the build spec, Oct 29 2026).

The build spec says nothing is built until this audit is signed off.
Signed off by Fable at the end of this file.

## 1. Inventory of what exists today

Everything here was read from source on branch `main` at `35ba93b`.

### Pages that overlap the spec

| Path | What it does today | Overlap |
| --- | --- | --- |
| `/` (`src/app/page.tsx`, `src/components/Hero.tsx`) | Hero with two buttons: "Schedule Your Estimate" (scrolls to the homepage estimate form, or `/free-estimate` on phones) and "View Our Work" (scrolls to `#projects`). | Spec replaces both buttons and puts them under multivariate test. |
| `/home-services` (`src/app/home-services/page.tsx`) | Narrative "home repairs with GC discipline" page: hero CTA to `/request-estimate`, philosophy band, four image cards, a nine-tile catalog from `src/components/services/serviceData.ts` (safety audit, sump test, weatherstripping, storm prep, home passport, interior paint, pre-listing prep, punch list, drywall), process band, remodel links, scope notes, closer, walk-through band. | Spec says extend this page with seven priced cards, checkboxes, one "Request These" button, and a home care section. |
| `/request-estimate` (`src/components/services/RequestEstimateForm.tsx`) | One long form: name, phone, email, town, property type, interests, timing, call window, notes. Posts to `/api/leads/submit` as `services_intake_form`. | Competes with the new three-screen flow for the same audience. |
| `/free-estimate`, homepage `HomeEstimateForm`, `ContactForm`, exit-intent popup | Remodel lead forms. All post to `/api/leads/submit`. | Different audience (remodels). No conflict. |
| `/intake/[token]` (WEB-012) | Post-submit tokenized conversation that collects scope answers and photos for remodel leads. | Photo upload overlaps. Different audience. |
| `/services/[slug]` | DB-driven remodel service pages (Kitchen Remodeling, Bathroom Renovations, Home Additions, Whole Home Remodels, Basement Finishing, Custom Living Spaces) looked up by title. | Spec wants `/services/cabinet-painting` style URLs. Those would 404 here. |
| `/home-care` | Free seasonal checklist product. No monthly price anywhere in the code. | Spec's home care section says "monthly price". |

### Components, forms, tracking and bot protection

| Thing | Where | Note |
| --- | --- | --- |
| `ABTesting.tsx` | `src/components/ABTesting.tsx` | localStorage A/B helper with a hardcoded `hero_cta_button` test. Unreachable from any entry point (codemap). |
| reCAPTCHA Enterprise v3 with v2 checkbox fallback | `src/lib/recaptchaVerify.ts`, `RecaptchaChallengeProvider` | Already wired on every form. Spec allows Turnstile or reCAPTCHA. |
| Rate limiting | `src/lib/rateLimit.ts` (Supabase `rate_limits` table) | Per key, fails open. |
| Lead store | `public.leads` plus `sanitizeLeadForInsert` | One table shared by all forms, scored, alerted by Telegram and email, with a follow-up drip. |
| Owner alerts | `sendTelegramLead`, `sendNewLeadEmail` | Text (Telegram) and email on every lead. The spec's "text to Alex" is satisfied by Telegram. |
| Email | `sendTrackedEmail` (Resend) from `alex@email.lavaca.link` | Only verified sending domain. |
| SMS to customers or subs | none | No Twilio or other SMS provider in the codebase. |
| Address autocomplete | none | No Google Places key in any env file. |
| Chatbot | none | `chatbot` appears only as a lead source label. |
| Analytics | GA4 + Clarity + FB pixel in `layout.tsx` | One analytics stack. No duplicate. |
| Admin | `/vaca-mgmt` (`AdminContent.tsx` + `AdminSidebar.tsx`), 24 tabs in 5 groups, session-gated by middleware | Leads tab lists `leads` rows. |
| Portfolio upload | `ProjectUploadSystem.tsx` + four step components | Four-step wizard, Gemini called at every step (categorize, alt text, title, challenge, solution, SEO). Saves straight to `active=true`. |
| `analyze-project` route | `src/app/api/admin/analyze-project/route.ts` | Gemini proxy. Admin-only. |
| `ai-project-assistant` edge function | called from `ProjectBasicInfoStep.tsx` | Does not exist in `supabase/functions`. The call already fails silently. |

### Database facts that shape the build

- `projects` and `project_images` are production-only tables created in the dashboard. The preview baseline creates `project_images` with an `id` column only and never creates `projects`. A local replay has neither.
- `active=false` on `projects` means "archived" in the Portfolio Manager. There is no draft state.
- `service_areas` has 21 towns and no county column. The scorer's `SERVICE_AREAS` list has 24 towns and a ZIP list.
- Storage bucket `project-images` has a `drafts/` folder with 20 orphaned uploads (eight of them 8 to 12 MB) and a `projects/` folder with the live images.
- `site_settings` is a one-row table used for feature flags.

## 2. Conflicts, grilled

Each conflict was grilled against the spec's three goals: fewest clicks, one lead store, one source of truth for prices.
The grill rounds are written out in `docs/decisions/001-grill-round-1-click-flow.md` and `docs/decisions/002-grill-round-1-project-upload.md`.
The decision line is the one that stands.

### C1. Existing `/home-services` catalog versus the seven priced cards

Keep both: the page carries two catalogs with two pricing models, and a homeowner has to work out which one applies. Two sources of truth.
Replace: the nine unpriced tiles leave the page; the seven priced cards and the request flow take the top of the page.

Decision: replace.
The nine-tile catalog is a different product (hourly service visits) with no prices, and the spec defines the page as cards with a checkbox each, one button, and a home care section.
`serviceData.ts` stays in the repo because `/commercial-services` and the remodel request form still read it.
Reasoning: one page, one price model, no reader confusion.

### C2. `/request-estimate` form versus the three-screen flow

Keep both as-is: two forms for home services, two click paths, two message formats for Alex.
Replace: retire `/request-estimate`.
Merge: the new flow handles home services; `/request-estimate` stays for commercial and remodel-adjacent requests and no longer links from the home services page.

Decision: merge.
`/request-estimate` keeps serving `/commercial-services` and remains reachable, but every CTA on `/home-services` now opens the in-page flow.
Reasoning: commercial property managers are a different audience with different questions; removing their form to save one route is not fewer clicks for them.

### C3. Hero buttons and `ABTesting.tsx` versus admin-managed CTA variants

Keep `ABTesting.tsx`: hardcoded variants in source, localStorage only, no view or lead attribution, and it is dead code today.
Replace: delete `ABTesting.tsx`; build DB-backed variants managed in admin with view, click, request, valid and won counts.

Decision: replace.
Reasoning: the spec requires admin-managed wording, sticky assignment and a sample-size gate, none of which the old helper does.

### C4. Chatbot

Build the bilingual per-service chatbot from the spec.
Skip it.

Decision: skip, flagged for Alex.
The run instruction was to remove the AI component entirely and cut clicks.
A chatbot is a second path to the same three taps and the spec says its last act is to push the request button anyway.
Reasoning: it adds spend and a parallel path without removing a click.
If Alex wants it, it is additive and nothing here blocks it.

### C5. Bot protection: Turnstile or reCAPTCHA

Decision: reuse the existing reCAPTCHA Enterprise v3 with the v2 checkbox fallback.
Reasoning: one CAPTCHA stack on the site, already verified server-side, already scored.

### C6. Phone verification by text code

There is no SMS provider.
Options: block the launch on Twilio; or build the one-time-code flow behind a provider module and run it only when configured.

Decision: build it behind `src/lib/home-services/sms.ts` (Twilio REST over `fetch`, env `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`).
When unconfigured, requests skip the Held queue and land as New with `phone_verified=false`, and the admin shows that flag.
Reasoning: a Held queue nobody can leave would hide every lead; an unverified flag keeps the leads visible and honest.

### C7. Address autocomplete

No Places key exists.

Decision: one address field with Google Places autocomplete when `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` is set, and a plain address plus ZIP field when it is not.
The ZIP check against the service area runs either way.
Reasoning: the service-area decision is what gates the lead; autocomplete only saves typing.

### C8. Per-service URLs under `/services/` or `/home-services/`

Decision: `/home-services/<slug>` (for example `/home-services/cabinet-repainting`).
Reasoning: `/services/[slug]` resolves against the remodel `services` table by title and would need seven fake rows; a second namespace keeps the remodel pages untouched.
The source tag `?src=` is read on both the landing and per-service pages and stored on the lead.

### C9. Lead store for home services requests

Options: a new standalone table; or `leads` for every request plus a companion table for the home-services fields.

Decision: companion table.
Every request inserts a `leads` row through the existing sanitizer (so scoring, Telegram, email and the follow-up drip keep working), and `home_service_requests` holds services, answers, status, verification, source tags and CTA attribution keyed by `lead_id`.
Photos go to a private bucket with rows in `lead_photos`.
Reasoning: one lead store for Alex, no change to the five existing forms, and the status machine the spec wants without overloading `leads`.

### C10. SpecNook API

SpecNook has no API this site can call today.

Decision: `src/lib/specnook/client.ts` behind `SPECNOOK_API_URL` and `SPECNOOK_API_KEY`.
When unconfigured, sub approval comes from the local `subs.status` that Alex sets in admin, and the push on acceptance is recorded as `specnook_push_status='pending'` for a later retry.
Reasoning: the website contract is defined now and the wire-up is a config change later.

### C11. Home care "monthly price"

Home Care is free today and the site says so in three places.

Decision: the home care section on `/home-services` says "Free seasonal plan" and links to `/home-care`.
No invented price.

### C12. Photos on the service cards

No stock photography exists for the seven services.

Decision: cards render an icon and a colour panel; `image` on each catalog entry is optional and renders when Alex drops a file in.
Reasoning: no fabricated imagery, no credit spend without asking.

### C13. Portfolio upload wizard

Decision: single-page form, drafts by default, one-click publish, no AI.
Grilled separately in `docs/decisions/002-grill-round-1-project-upload.md`.

## 3. What gets built (scope sign-off)

1. Shared contract: migration, service catalog, pricing rules, i18n strings (`src/lib/home-services/*`).
2. Public: `/home-services` rebuilt, `/home-services/[slug]`, the three-screen request flow, photo upload, OTP verify, lead persistence, owner alerts, customer confirmation.
3. Admin: Service Requests (list, detail, status, notes, photos, map link, call and text buttons), Subs roster, Send bid request, Sub Responses inbox, decline call tasks, Pricing report.
4. Sub-facing: offer email and text, `/offer/[token]` response page (accept, counter, details, decline), 24-hour expiry with pause on detail requests.
5. CTA tests: hero buttons from `cta_variants`, sticky cookie, view and click events, lead attribution, admin leader board with sample-size gate.
6. Portfolio: AI removed, single form, draft status, publish button, `POST /api/projects/ingest` for Claude Code.
7. Review passes: click-flow grill (done in 001), SEO review, security and structure review, each with a written report in this folder.

Out of scope for this run, by spec: SpecNook sub signup, agreements, contracts and payments.

Signed off: Fable, 2026-10-29.
