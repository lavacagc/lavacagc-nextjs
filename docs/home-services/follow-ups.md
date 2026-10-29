# Home Services build - follow-ups and launch checklist

Items the build surfaced that are deliberately not in this branch, plus what must be done or verified before and after the first deploy.
Owner: Alex unless noted.
Written by Fable, 2026-10-29; updated as the reviews closed.

## Decisions for Alex to confirm or overturn

Each is recorded with its reasoning in `00-site-audit.md` or `docs/decisions/`.

1. No chatbot (audit C4).
2. reCAPTCHA kept instead of Turnstile (C5).
3. Phone verification runs only once Twilio is configured; until then every request lands as New with `phone_verified=false` (C6).
4. Per-service pages live at `/home-services/<slug>`, not `/services/<slug>` (C8); Craigslist links should use the new URLs with `?src=craigslist`.
5. Home care section says "Free seasonal plan" because no monthly price exists (C11).
6. Service cards use icons; drop a photo into each catalog entry's `image` when there is one (C12).
7. Starting prices are the spec's figures, hard-coded in `src/lib/home-services/catalog.ts`; change there and deploy.
8. The county ZIP table in `countyZips.ts` includes Newark and the Oranges because they are Essex County; remove any ZIP you do not want to serve.
9. A request becomes Assigned only when every trade on it is assigned (slice B ruling D7).
10. Sub pay is capped at 70% of the customer price everywhere, including when Alex accepts a counter.
11. The shared header, footer, trust bar and bottom tabs stay English on the Spanish page; only the new pages and the flow are bilingual.

## Environment variables to set in Vercel before deploy

| Variable | Purpose | Required |
| --- | --- | --- |
| `PROJECT_INGEST_TOKEN` | bearer for `POST /api/projects/ingest` (32+ chars); unset means the route answers 404 | for Claude Code ingest |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | customer confirmation text, one-time code, sub offer texts | optional; unset degrades |
| `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` | address autocomplete; also widens the CSP for maps hosts at build time | optional |
| `SPECNOOK_API_URL`, `SPECNOOK_API_KEY`, `SPECNOOK_SIGNUP_URL` | sub status check and job push | optional; unset degrades |
| `GOOGLE_GEMINI_API_KEY` | no longer read anywhere in `src/`; remove | remove |

`INTERNAL_WEBHOOK_SECRET`, `CRON_SECRET`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`, `TELEGRAM_*` and the reCAPTCHA keys are already in production and are reused.

## Security review conditions (docs/home-services/reports/security-review.md)

- S-01 Next.js was upgraded from 16.1.6 to 16.4.3 on this branch (38 advisories on the old version, including middleware bypasses); the gates and the full suite were re-run after the upgrade.
- S-02 Direct `*.vercel.app` production traffic now 301s to `www.lavacagc.com`, so per-IP rate limits only ever see Cloudflare-set client IPs; preview deployments are unaffected. The `rateLimit.ts` header order is unchanged.
- S-03 Launch check: confirm in the Supabase dashboard that public sign-up is disabled (Authentication > Providers > Email > "Allow new users to sign up" off). The admin gate admits any signed-in user, so an open sign-up would expose every request and photo.
- S-08 Recommendation: the admin's signed video upload lets the uploader pick the stored content type; a JPEG-headed HTML file is stored (served as text, harmless today). Validate the type server-side after the upload lands.
- S-10 Recommendation: focus should return to the opening button when the request sheet closes.

## Done after launch (2026-10-29)

- S-03: public sign-up turned off in the hosted Supabase project through the Management API (`disable_signup: true`), after confirming the only `signUp` caller is the unused helper in `src/hooks/useAuth.tsx`; a sign-up probe now fails.
- Production migration history repaired and the Home Services migrations applied (see Database below).
- `PROJECT_INGEST_TOKEN` set in Vercel production and preview; the eight drafts from the orphaned `drafts/` photos were created by CLI and wait unpublished in the admin.

## Database

- The migration `20261029000000_home_services.sql` and `20261029000001_projects_anon_draft_guard.sql` were expected to apply through the Supabase GitHub integration on merge. They did not (2026-10-29, merge 4f0e295): the integration's production apply failed at `20260218000000_create_lead_events.sql` with `policy "Allow public inserts" for table "lead_events" already exists`, because every migration from February 2026 on exists in production without being recorded in `supabase_migrations.schema_migrations`. Until the history is repaired, every merge fails the same way and no new table reaches production.
  Repaired 2026-10-29 after Alex logged in: every unrecorded migration was dry-run against production inside a rolled-back transaction (scratch script `migration-dryrun.py`); the 46 whose objects already existed were marked applied with `supabase migration repair --status applied`, and `supabase db push --linked` then applied `20260923000000`, `20261029000000` and `20261029000001`. REST probes of `home_service_requests`, `cta_variants`, `subs`, `job_offers` and `projects.status` answer 200. From here on, a merge to main applies new migrations through the Supabase GitHub integration as long as the history stays in sync; `supabase migration list --linked` shows any gap.
- Launch check: confirm in the Supabase dashboard that the `projects` and `project_images` policies for the `anon` role do not expose `active=false` rows.
  The restrictive guard in `20261029000001` narrows anon reads only where row security is already on; if the dashboard shows RLS off for `projects`, turn it on with a permissive `active = true` SELECT policy for anon and an `authenticated` policy for admin writes.
- Vercel crons added: `purge-draft-photos` (daily 05:00), `offers-expire` (every 30 minutes).

## Verify after the first deploy (not provable locally)

- A real submit from a phone on `/home-services` arrives in Telegram and email with the services, answers, timing, source and signed photo links.
- With Twilio set: the confirmation text arrives, the code field appears, a correct code flips Held to New.
- Photo upload of a 10 MB phone photo through the request flow and through the admin project form (Vercel's 4.5 MB function body cap; both paths compress in the browser first).
- Sub offer email renders in Gmail and the offer page opens from it; the Respond button is the outlined one.
- Signed video upload to hosted Supabase from the admin project form.
- Publish from the Portfolio Manager shows the project on `/portfolio` and the homepage within the ISR window.
- `POST /api/projects/ingest` from Claude Code with the Vercel token (see `docs/projects-ingest.md`).
- Homepage CTA variants render on the production hostname, events arrive in `experiment_events` as `hero-primary` / `hero-secondary`, and the Experiments tab shows them (Phase 2 replaced `cta_events` and the CTA Tests tab).
- Google Places autocomplete, once a key exists.
- SpecNook status and push, once the API exists.
- The reCAPTCHA v2 fallback on the new request route with a real low score.

## Engineering follow-ups found during review (not in this branch)

- Static Spanish route: `/home-services` and the service pages render per request because language comes from cookies and `searchParams`; a `/es/` route tree would make both languages static (slice A review D7).
- Site-wide dev-only hydration mismatch on the footer Facebook icon and the Services section; production is clean (slice A review D4, slice C report).
- Dev server intermittently fails to SSR `Testimonials` with "No QueryClient set" (slice C report); confirm it never happens on Vercel.
- `rateLimit.ts` trusts `cf-connecting-ip` before `x-real-ip`; against a direct `*.vercel.app` origin that header can be spoofed per request. Restrict direct origin access or trust `cf-connecting-ip` only when the request has Cloudflare's `cf-ray` (slice C review).
- Verify-code attempt counter is read-then-write; bounded by the per-id limit of 15 an hour (slice A review D9).
- Bulk Feature, Archive and Reorder in the Portfolio Manager now go through the server; the remaining browser-side reads rely on the production admin policies.
- Dashboard tab on the local rig fails on a missing `blog_posts.title` column; add it to the preview baseline with the other production-only columns.
- CTA events: middleware now issues the signed visitor cookie with the first homepage response and a click never waits on the view beacon (CT3 lost clicks on slow connections before this). A request with no cookie still mints a counted view, so a cookieless script can inflate views from one IP up to the rate limit; clicks cannot be inflated that way. Consider requiring the `cta_v` seed cookie before minting.
- The homepage pushes three history entries after load on the base commit as well, so one Back press stays on `/` (slice C re-verification); separate ticket.
- Dev server intermittently fails to SSR `Testimonials` with "No QueryClient set": not reproduced in about 550 renders by the reviewer; keep an eye on Vercel logs.
- Playwright: the home-services and offers specs can time out on a cold dev server under load; warm the pages in `beforeAll` (slice A and B re-verifications).
- Playwright: the live-backend specs cannot run from two checkouts against one database at once; each file's cleanup deletes every row with its prefix, so a concurrent run loses its own rows mid-test (that is what the one RF10 failure on the merged branch was). Run them from one place, or give each run its own prefix.

## Craigslist and listings

Post per service and county with the matching URL and tags, for example:
`https://www.lavacagc.com/home-services/gutter-cleaning?src=craigslist&lid=<post id>` and `?lang=es` for Spanish posts.
Leads by source and service appear on the Service Requests summary card.
