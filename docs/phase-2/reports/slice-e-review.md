# Phase 2 slice E - review (catalog in `home_services`, Services & Prices editor)

Reviewer: Opus 5.5 (reviewer slice E), independent of the builder.
Reviewed head: `0d058de` on `phase2/slice-e` (base `1982e0a`).
Rig: local Supabase on 55421 (shared, never reset), branch dev server on 3113, `origin/main` (`687c849`) dev server on 3114 in a separate worktree, then a production build of the branch on 3114.
Environment: the worktree ran on the rig-only env file (`env.rig`); no production key, Resend or Telegram value was loaded by any server I started.

## Overall verdict: REJECT (UI only)

Every CAT item is met and independently reproduced, prices are unchanged, the gates are green and the security checks hold.
The rejection is for the editor's phone layout and labels, which Alex would send back on sight (U1 to U4 below).
Each fix is small and inside `ServicesPricesEditor.tsx`; no data, route or contract change is needed.

Builder must fix:

1. U1: the list row on a phone squeezes the name into a one-word-wide column.
2. U2: field labels lowercase "SEO" ("English seo title", "Spanish seo description").
3. U3: a large empty gap between "Job minimum" and the Active switch on a phone.
4. U4: FAQ and long textareas clip their text on a phone, and the FAQ fields and keywords have no counters although the schema caps them.

Should fix (not blocking): U5, a save bar that stays reachable on a form that is 3,340 px tall on desktop.

For Alex, outside slice E (see "Follow-ups"): production sign-ups are open, so any confirmed account is an "admin" and can now change prices; and the home services pages throw if the migration has not reached production when this deploys.

## CAT items

| AC | Verdict | Evidence |
| --- | --- | --- |
| CAT1 | ACCEPT | Live spec "CAT1" passed (3.0 s). It asserts each table row equals the seed row, then the seven landing cards (name, price, unit, description) and, for all 7 slugs in en and es, `<title>`, meta description, Service JSON-LD name and description, every included and raises line, every FAQ question and the price. Independently, all 16 pages render identically to `main` (below). |
| CAT2 | ACCEPT | Live spec "CAT2" passed: edits Home cleaning to 271 in the UI, checks the row (`updated_by` = the admin), the landing card, the service page and `flow-price-home-cleaning`, then restores. Independently on the production build: a direct REST write of $263 did not show (cached), an admin save expired the cache and $263 showed on the next request, restore gave $259. |
| CAT3 | ACCEPT | Live spec "CAT3" passed: `<title>`, meta description and JSON-LD name on the next request, plus the landing graph, and Spanish untouched. Independently in a real browser (iPhone 13) I changed both SEO titles and the Spanish description of HVAC cleaning: the next request showed the new title in en and es and the new Spanish description in the HTML, the JSON-LD and the phone render. |
| CAT4 | ACCEPT | Live spec "CAT4" (UI switch) passed: 6 cards, 0 sitemap entries, 404 in en and es, no sibling link, then 7, 2, 200. The names test passed (API `answer_lines`, list row, detail, bid form prices while HVAC is off). Independently on the production build, where the sitemap is static: before `entries=2 page=200 page_es=200 cards=7`, off `0 404 404 6`, on `2 200 200 7`. |
| CAT5 | ACCEPT | Unit and live specs passed; the live one checks the three messages under their fields, `aria-invalid`, focus on the first error and a byte-identical row. Independently by HTTP with a session: one PATCH with price 0, empty `name_es` and a 61-character title returned 400 with `fieldErrors` `{"starting_price_cents":"Starting price must be at least 1 cent","name_es":"Spanish name is required","seo_title_en":"English SEO title is at most 60 characters"}`, and the row was unchanged after all rejected writes. |
| CAT6 | ACCEPT | Spec passed (migration contains `seedSql()` verbatim; landing spec imports `./helpers/homeServicesSeed` and no catalog constants). Independently: `main`'s `HOME_SERVICES_CATALOG` minus `questions` is deep-equal to the branch's `HOME_SERVICES_SEED`, in order (0 differences), and the seed SQL appears verbatim in `20261030000000_phase_2.sql`. |
| CAT7 | ACCEPT | Live spec "CAT7" passed (every script the browser loads, including the lazy request flow chunk, for three seed strings). On my production build the chunk-scan test passed, and by grep `.next/static` has 0 files with the HVAC Spanish description, an included line, a raises line, a price unit or the gutter note, while the copy is present in `.next/server` and UI strings such as "Starting at" are present in `.next/static` (positive control). |
| CAT8 | ACCEPT | Spec passed (redirect to `/auth?next=...`, both routes 401). By curl without a session: `PATCH /api/admin/home-services/hvac-cleaning` gave `HTTP/1.1 401` `{"error":"Unauthorized"}`, `GET /api/admin/home-services` gave 401. See follow-up F1 on what "admin" means in production. |

### Does each spec test its claim

I read every assertion in `tests/home-services-catalog.spec.ts`.
Each live test asserts the outcome the AC names, on the next request, and restores what it touched.
One gap, not a reject: CAT1 checks the landing cards in English only; my main-versus-branch render diff covers the Spanish landing page.
The dev server cannot show the hourly cache, so the spec alone does not prove "next request" under production caching; the builder's manual check and mine on the production build both do.

## Prices unchanged

- Rig rows before my run match decision 005 exactly: cabinet $2,095, HVAC $299, duct $449, home cleaning $259, exterior $2.95 / sq ft with `minimum_cents` 360000, gutter $279 with note "Two story from $349", drywall $349.
- Render diff, `main` (3114) against the branch (3113), both dev servers on the rig: for `/home-services` and all 7 service pages in en and es, title, meta description, keywords, canonical, every JSON-LD block, the full `<main>` text and every dollar amount are identical: "pages with differences: 0 of 16".
- `/sitemap.xml` home-services entries hash identically on both (`798e9a28...`).

## Admin editor in a real browser

Script: Playwright, sign-in through the `/auth` form as `review-e-admin@local.test`, iPhone 13 for the edit, Desktop Chrome at 1366 px for the restore.

```
phone save banner: Saved at 12:26 PM. Live on the next page load.
after edit en: 200 "review-e HVAC Cleaning in Essex, Morris & Bergen NJ"
after edit es: 200 "review-e Limpieza de HVAC en Essex, Morris y Bergen NJ"
  es body has new description: true | es JSON-LD description new: true
  en body has new es description (should be false): false
  phone browser es page shows new description: true
phone console errors: none
desktop form loaded the edited text: true
after restore en: "HVAC Cleaning in Essex, Morris & Bergen NJ from $299" | es: "Limpieza de HVAC en Essex, Morris y Bergen NJ desde $299" | es has orig description: true | new gone: true
```

No horizontal overflow at 390 px on the list or the form.

## UI findings

Screenshots are under `docs/phase-2/reports/shots/`.

- U1 (must fix): on a phone each list row puts the name, the Spanish name and the path into a column about 100 px wide, so "Duct and vent cleaning" wraps one word per line and `/home-services/duct-and-vent-cleaning` breaks mid-slug, while the fixed `w-28` price box, the switch and the badge take the rest of the row and Edit drops to its own line.
  Shot: `slice-e-review-phone-list.png`.
  Fix direction: stack the row on small screens (name block full width, then price, switch and Edit on one line), drop the fixed price width below `sm`.
- U2 (must fix): `pair()` builds labels with `label.toLowerCase()`, so the form reads "English seo title", "Spanish seo title", "English seo description".
  Shots: `slice-e-review-phone-seo-counters.png`, `slice-e-review-desktop-form-full.png`.
- U3 (must fix): on a phone the Active switch label keeps `pt-7`, meant to align it with the inputs beside it on desktop, so after it wraps there is a gap of about 60 px of empty space above it.
  Shot: `slice-e-review-phone-form-top.png`.
- U4 (must fix): on a phone the FAQ answers (`rows=4`) and the longer descriptions clip mid-line and need an inner scroll, the FAQ questions are single-line inputs that cut the question off, and neither has a counter although the schema caps questions at 300 and answers at 1,200; the keywords box has no "n/10" count either.
  Shot: `slice-e-review-phone-saved.png`, `slice-e-review-phone-form-full.png`.
  Fix direction: auto-grow or larger rows for textareas at phone width, counters on FAQ fields and a keyword count.
- U5 (should fix): Save and Discard sit only at the bottom of a form 3,340 px tall on desktop and far longer on a phone; a sticky save bar would let Alex change the price at the top and save without scrolling through every FAQ.
  Shot: `slice-e-review-desktop-form-full.png`.
- Outside slice E, seen along the way: the "Welcome Back" toast covers the top of the editor for several seconds on a phone after sign-in (`slice-e-review-phone-form-top.png`); the Spanish service page shows the English promo bar "Free seasonal home checklist", which also contains an em dash (`slice-e-review-phone-public-es-after-edit.png`).

## Security

- Signed out: 401 on PATCH and GET (curl above); the editor URL redirects to sign-in (spec).
- Signed in, by HTTP: zero, negative and string prices, unknown key `trade`, 13 included lines and invalid JSON each return 400 with a field message or a plain error; an unknown slug and an encoded `&slug=neq.x` suffix return 404 (`isServiceSlug` gates the slug before it reaches the PostgREST path); a 70 KB body returns 413; the row was byte-identical afterwards.
- Reads are capped: both `home_services` reads carry `limit=50`, and every other read in the diff goes through `getAllServices()`.
- `chaos:static`: `total 0, baselined 0, NEW 0`, and `chaos/static-baseline.json` is `[]` and unchanged by the slice.

## Gates on `0d058de`

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, no problems |
| `npm run chaos:static` | total 0, baselined 0, new 0; baseline empty |
| `npm run test:e2e -- tests/home-services-catalog.spec.ts tests/home-services-landing.spec.ts tests/admin-nav-simplified.spec.ts` (stub, `.env.local` and `.env.development.local` moved aside, restored after) | exit 0, 52 passed, 50 skipped (live-only), 0 failed |
| Live `home-services-catalog.spec.ts` alone on 3113 | 18 passed, 1 skipped (chunk scan needs a production `.next`) |
| Chunk scan on my production build | 1 passed |
| `npm run build` with the rig env | exit 0 |

The stub run logged `Error fetching service: {}` four times; that comes from the older remodel page `src/app/services/[slug]/page.tsx`, not from this slice.

Table state: I dumped `home_services` before my runs, after the live spec, after the browser edit and after the production checks.
Each dump equals the seed rows field for field (`updated_at` and `updated_by` aside), and the seed SQL is verbatim in the migration.

## Builder's choices

1. Seed fallback without a service key: ACCEPT.
   It lets the stub suite render the pages, and with the key set a failed read throws instead of showing a stale price.
   See F2 for the production side of that throw.
2. Price line added to the request flow: ACCEPT.
   CAT2 names "the request flow's price line" and there was none; it is client-rendered, so SEO1 output is untouched (my render diff shows 0 differences).
3. JSON-LD name is the service name, not the SEO title: ACCEPT.
   On `main` the Service node's `name` is the service name, SEO1 forbids a shape change, and CAT3's spec covers both the title and the name.
4. Trade routing stays in code and `trade` is not editable: ACCEPT.
   The contract says the admin edits content, not the set; the schema refuses `trade` (verified by HTTP).
5. English and Spanish lists travel together with equal length: ACCEPT.
   The page pairs them line by line; the message tells Alex exactly what to fix.
6. FAQ editable, with a stale-price note: ACCEPT.
   Prices are quoted in FAQ and SEO copy, so without this a price change would leave two prices on the page.
7. Tab in the Customers group: ACCEPT.
   The contract fixes only the id, the label and the three registrations, and keeping it away from the remodel "Services" tab avoids confusing the two.
8. "Only admins" means any Supabase session: ACCEPT for this slice, because it is the rule every `/api/admin/*` route already follows and a role check on one route would be inconsistent.
   It is not safe in production as configured; see F1.
9. `getServiceNames()` never throws: ACCEPT.
   A name in an alert is cosmetic and must not fail a homeowner's request.

## Follow-ups for Alex (not slice E defects)

- F1: production GoTrue has sign-ups on. `GET <production>/auth/v1/settings` returns `disable_signup: false` with email confirmation required.
  Anyone who confirms an email gets a session, and a session is all `/api/admin/*` checks, so since this slice that includes changing prices.
  I did not try to sign up on production.
  The quick close is "Allow new users to sign up: off" in the Supabase dashboard; a role check in middleware is the durable one.
- F2: production does not have `home_services` yet. With the key set and the table missing, `/home-services` and every service page throw.
  Confirm `supabase migration list --linked` shows `20261030000000` applied before the Vercel deploy of this branch goes live.
