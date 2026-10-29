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

## Database

- The migration `20261029000000_home_services.sql` and `20261029000001_projects_anon_draft_guard.sql` apply through the normal pipeline (Supabase branching on the PR, production on merge).
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
- Homepage CTA variants render on the production hostname, events arrive in `cta_events`, and the CTA Tests tab shows them.
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
- CTA events: a request with no cookie still mints a counted visitor, so a cookieless script can inflate views from one IP up to the rate limit (slice C re-verification); consider requiring the `cta_v` seed cookie to exist before minting.
- The homepage pushes three history entries after load on the base commit as well, so one Back press stays on `/` (slice C re-verification); separate ticket.
- Dev server intermittently fails to SSR `Testimonials` with "No QueryClient set": not reproduced in about 550 renders by the reviewer; keep an eye on Vercel logs.
- Playwright: the home-services and offers specs can time out on a cold dev server under load; warm the pages in `beforeAll` (slice A and B re-verifications).
- Playwright: RF10 (merge) failed once in four full-file runs on the merged branch while another agent was probing the same route; the response had the silent-drop shape (`ok: true, merged: false`, random id), which the route returns for a submit timed under five seconds or a filled honeypot. It passed in isolation and in three full-file runs. If it recurs, log the drop reason server-side under a debug flag and check whether the sheet's `started_at` can reset between screens.

## Craigslist and listings

Post per service and county with the matching URL and tags, for example:
`https://www.lavacagc.com/home-services/gutter-cleaning?src=craigslist&lid=<post id>` and `?lang=es` for Spanish posts.
Leads by source and service appear on the Service Requests summary card and the CTA Tests tab.
