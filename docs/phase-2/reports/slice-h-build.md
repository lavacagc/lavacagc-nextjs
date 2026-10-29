# Phase 2 slice H - build report (experiments framework)

Builder: Opus 5.5 (builder slice H). Planner: Fable. Reviewer: separate agent; nothing here is marked done by the builder.
Branch: `phase2/slice-h`, cut from `phase2/slice-e` at `0d058de`, then merged with `feat/phase-2-admin-catalog-articles-experiments` at `4ddfa0f` (slices E and F) in `725aaac`.
Scope: EX1 to EX8, the "Experiments (slice H, decision 005)" contract, and SEC1 for the new routes.

## What changed

- `supabase/migrations/20261030000003_cta_to_experiments.sql` (guarded, re-runnable): `experiments.expected_effect`, `home_service_requests.visitor_id` and `paid_at`, an index on `experiment_events (visitor_id, event)`, the `updated_at` trigger on `experiments`, the one-running-per-page index recreated with the Phase 1 pair grandfathered, `hero-primary` and `hero-secondary` built from `cta_variants` (status `running`), the uuid-visitor `cta_events` copied into `experiment_events`, and `experiment_funnel(text[])` (grouped counts, service role only).
- `src/lib/experiments/`: `types.ts` (closed payload schema, copy rules, `NoPriceSlots`), `seed.ts` and `assign.ts` (the `cta_v` seed and `ctaIndex` reused), `surfaces.ts` (where experiments render), `evaluate.ts` (pure, seeded Monte Carlo), `store.server.ts`, `events.server.ts` (downstream funnel), `decide.server.ts` (every state change), `withExperiment.server.ts`, `ExperimentZone.tsx` and `client.ts` (beacons), `vetoToken.ts`, `vetoLookup.server.ts`, `messages.ts`, `auth.server.ts`, `schemas.ts`.
- `src/lib/botFilter.ts`: the bot filter's allow-list and `isCrawlerUserAgent`, now shared by middleware and the assignment.
- Routes: `POST /api/experiments`, `GET /api/experiments/report`, `POST /api/experiments/[key]/start`, `POST /api/experiments/[key]/conclude`, `GET|POST /api/experiments/backlog`, `POST /api/experiments/notify`, `POST /api/experiments/event` (public sink), `POST /api/experiments/veto`, `GET /api/cron/experiments-evaluate`, `GET /api/admin/experiments`, `POST /api/admin/experiments/[key]`; page `/experiments/veto/[token]`.
- `/home-services` reads `withExperiment` for `hero`, `services-heading` and `sections` (the sections below the hero became a reorderable map with no visual change).
- Homepage buttons: `src/lib/cta/heroStore.server.ts` maps the hero experiments to the Phase 1 shapes; `variants.server.ts`, `activePairs.server.ts`, `admin.server.ts`, `/api/cta/event` and `/api/admin/cta/variants` read and write experiments and `experiment_events`; nothing writes `cta_variants` or `cta_events`.
- Request route stores `visitor_id` and records `request_submitted`; the admin request route records `quote_accepted` on Won and gains a `paid` action (button "Mark paid") that records `job_paid` with the job's price.
- Admin: tab `experiments` ("Experiments") replaces `cta-tests` in `AdminSidebar.tsx`, `AdminContent.tsx` (old `?tab=cta-tests` links land on it) and `tests/admin-nav-simplified.spec.ts`; `ExperimentsDashboard.tsx` with the homepage buttons editor and the Phase 1 history below.
- Skill `.claude/skills/experiments/SKILL.md`, CLI `scripts/experiments.mjs`, doc `docs/experiments.md`, a CLAUDE.md pointer.
- `vercel.json`: cron `/api/cron/experiments-evaluate` at `30 7 * * 1`.
- `scripts/chaos-static.ts`: `authorizeIngest(` and `authorizeExperiments(` count as auth gates (they are the shared bearer-token gates with their own rate limit); without that the notify route reads as an ungated Telegram send.

## Decisions I took inside the contract (for the reviewer to accept or reject)

1. Two running experiments on `/`. The contract migrates both Phase 1 buttons and the slice 0 index allows one running experiment per page. I kept both running (they were tested side by side in Phase 1 with independent hashes) and recreated the index with `key NOT IN ('hero-primary','hero-secondary')`; the create and start routes still refuse a third experiment on `/` (they check every live experiment on the page).
2. Hash names. `hero-primary` and `hero-secondary` hash on `primary` and `secondary`, not their keys, so the migration reassigned no visitor; every other experiment hashes on its key, as the contract says.
3. Homepage crawler rule. The homepage is ISR, so its buttons stay on the client pre-paint script; it now returns at once for `/bot|crawl|spider|slurp|google/i`, which leaves the CSS default (the control, rendered first) and sends nothing. The pattern is short because the script must stay under 1 KB (the CT spec's fix 2 test, seven variants per button, and CT1 on the served HTML both pass; a first, longer pattern failed both at 1,080 and 1,073 bytes); link-preview bots run no script and get the same default.
4. Admin preview on the homepage. `?exp=` previews work on the server-rendered `/home-services` surfaces; the static homepage buttons are previewed in their editor instead.
5. `quote_accepted` is the Won status (it carries the agreed price); `job_paid` needed a new `paid` action and `paid_at` column, because no status meant paid.
6. Veto concludes. A veto keeps the control and concludes the experiment, so the next Monday does not propose the same winner again.
7. Agent conclude with a challenger goes through the same 24 hour veto (pending, Telegram link); with the control it concludes at once; retire is immediate. The admin tab's Promote is immediate (Alex is the veto).
8. Every refusal of the agent routes is 404 (no token, wrong token, token unset), so a caller cannot tell the routes exist; only the rate limit answers 429. Admin sessions are accepted too, like the project ingest.
9. Surfaces. The create route refuses a (page, element) nothing renders and slots the surface does not read, requires both languages on bilingual surfaces, the same slots in every variant, and a full permutation for a section order.
10. Copy rules on top of the price-free schema: copy may not state an amount, a percentage, a phone number or the license.
11. The cron and report take `?now=` and `?keys=` only off Vercel production (and on a production build only with `EXPERIMENTS_FAKE_CLOCK=1`), which is how the spec runs the cron twice with a fake clock on the shared database.
12. `POST /api/experiments/notify` was added so the skill can post its weekly summary to Telegram (EX8 needs a message) without a Telegram token in the agent's hands.
13. The veto page answers 200 with a plain message for a dead link (a page component cannot send 410); the veto route answers 410.
14. Hex colours only for the homepage buttons now (a payload colour is hex); the Phase 1 seed had none set.

## Evidence per AC

| AC | Evidence | Result |
| --- | --- | --- |
| EX1 | `experiments.spec.ts` "EX1: the two Phase 1 buttons are running experiments with their variants and history; landing-hero is the seeded draft" (live: rows, payloads, the admin tab cards, the homepage buttons section, the old deep link). `cta-tests.spec.ts` (20 tests: CT1 to CT5 and fixes 1 to 6) passes with only its lookups moved to `experiments` and `experiment_events` and the tab name. | pass |
| EX2 | Live: "a visitor keeps the same variant across visits and pages, and the view is counted once" (both variants, Spanish, a service page, the homepage and back, one view and one click), "a brand-new visitor gets a seed from the first response, and the render already uses it", "a crawler gets the control and is never counted" (Googlebot by API and in a browser: control copy, no beacon, no visitor id), "an admin ?exp= preview shows the named variant (drafts too) and records nothing; anyone else gets their own variant" (including a forged x-exp-preview header), "the event sink counts only the variant the seed hashes to". Unit: "EX2 (unit): the assignment reuses the Phase 1 hash...". | pass |
| EX3 | Live: "request_started, request_submitted, quote_accepted and job_paid are recorded for the visitor's variant, once each": a real request through `/api/home-services/request` (sent twice, merged), Won, Paid, Paid again, Won again; exactly one row per step, revenue 27900 on quote and paid. | pass |
| EX4 | Units: winner at 300 per arm; the same rates at 50 give "not enough data" with `ready_on` 2026-12-01 (and the day mark when only age is short); a loser retires (two-arm and three-arm); p and expected loss within Monte Carlo error of exact Beta integrals by quadrature; revenue per visitor exact; determinism. | pass |
| EX5 | Live: "the cron proposes with a veto link, waits 24 hours, then promotes; a vetoed winner is never promoted": run at T proposes (Telegram `not_configured`, message with the link), the veto page is read-only and noindex, its button vetoes, the link is then dead, run at T+1h waits, run at T+24h+1m promotes (control becomes B), the vetoed one is untouched. | pass |
| EX6 | Live: "every agent route answers 404 without the token, 400 on a bad body, and refuses any price field" (7 routes, no token and wrong token; bad bodies on create, conclude, start, backlog, notify; `priceDisplay`, `startingPriceCents`, nested `minimumCents`; "$99" in copy) and "EX2 + EX6: the agent creates and starts...; a second one on the page is refused" (409 on create, start and duplicate key). Unit: "prices are unaddressable" (`@ts-expect-error` on a typed payload with `priceDisplay`, every price field refused by the schema). | pass |
| EX7 | Live: "the admin tab shows the funnel, probability and decision, and one tap promotes or retires with the admin id" (counts, probability, verdict text, Promote and Retire clicks, `decision.promoted.by` and `decision.retired.by` = `admin:<uuid>`). Screenshot `test-results/experiments-*-admin-id-chromium/ex7-experiments-tab.png`, which I checked: cards, tables, verdict boxes and the buttons section render cleanly at 1280 px. | pass |
| EX8 | For the reviewer. I ran the CLI end to end against the rig (report, create `slice-h-cli`, start, retire, notify; all answered, Telegram `not_configured`) and deleted the row. | for review |
| SEC1 | Unit "SEC1 + wiring" (middleware lists `/api/experiments/` with the reason; every agent route calls `authorizeExperiments`; sink and veto rate limited; the preview header is stripped and only set after a session check); `npm run chaos:static` total 0, baseline empty. | pass |

## Commands run and results

| Command | Result |
| --- | --- |
| `psql postgresql://postgres:postgres@127.0.0.1:55422/postgres -v ON_ERROR_STOP=1 -f supabase/migrations/20261030000003_cta_to_experiments.sql` (twice, to prove it re-runs), then `NOTIFY pgrst, 'reload schema'` | applied; second run changed nothing |
| `npm run typecheck`, `npm run lint`, `npm run chaos:static` on the merged head `725aaac` | clean, clean, total 0 baselined 0 new 0 |
| Live, dev server on 3120 (rig env), merged head: `TEST_URL=http://localhost:3120 E2E_LIVE_BACKEND=1 playwright test tests/experiments.spec.ts tests/cta-tests.spec.ts tests/home-services-landing.spec.ts --project=chromium --workers=1` | 67 passed |
| Stub: `npm run test:build` (with `.env.local` moved aside), `next start -p 3121`, `E2E_STUB_BACKEND=1 TEST_URL=http://localhost:3121 playwright test` (full suite, chromium and mobile) | 2615 passed, 448 skipped (live-only), 2 failed: `proposal-pod-slice2-browser.spec.ts` B32 in both projects, which arrived with the merge, not with slice H (see below); after the fix the file alone gives 72 passed |
| CLI smoke: `node scripts/experiments.mjs --site http://localhost:3120 report|create|start|conclude --retire|notify` | all answered as documented |

Rig rows: the specs create only `slice-h-*` experiments, `slice-h*` requests and backlog rows with source `slice-h-spec`, and delete them in `afterAll`; after the runs the table holds `hero-primary`, `hero-secondary` (running) and `landing-hero` (draft, as seeded).

### The one red test after the merge

B32 in `tests/proposal-pod-slice2-browser.spec.ts` expects an ancestor that clips the forced overrun to be named.
Its probe only counted `overflow-x: hidden | auto | scroll`, and the slice E polish round (`fb95c6d`) moved the admin shell's wrappers to `overflow-x-clip`, so the clipping ancestor stopped being seen.
I counted `clip` as clipping in the probe (one line, commented); the spec's own claim is unchanged, and the file passes on the merged build (72 passed).
The reviewer of slice E may prefer that fix to land on the integration branch directly.

## Cron and env

- Cron: `{ "path": "/api/cron/experiments-evaluate", "schedule": "30 7 * * 1" }` in `vercel.json` (Monday 07:30 UTC, `CRON_SECRET`).
- Env (all already exist): `PROJECT_INGEST_TOKEN`, `CRON_SECRET`, `INTERNAL_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`. Optional and test-only: `EXPERIMENTS_FAKE_CLOCK=1` (never set it in production; the hooks are off on Vercel production regardless).
- Weekly agent: a `/schedule` routine running the experiments skill every Monday at 08:30 America/New_York; the skill names the command. I did not create the routine (it runs against production and is Alex's to switch on).

## Left out, and why

- `landing-hero` is not started: the brief keeps it as the migration seeded it; the skill (EX8) starts it.
- Homepage `?exp=` preview (decision 4) and a homepage-button image slot: the homepage is static and the buttons have no image.
- Production follow-ups: run the migration after the deploy a second time (re-runnable) to carry any `cta_events` the old code wrote between migration and deploy; the public read policy on `cta_variants` is now unused and can be dropped once the deploy is live.
- `home-services-admin.spec.ts` and the other slices' live specs were not run live (shared database); their stub halves ran in the full stub run.

## Fix round 1

Review: `docs/phase-2/reports/slice-h-review.md` (REJECT at `d0e369b`), taken by fast-forward to `fc1efcd`.
Then merged `feat/phase-2-admin-catalog-articles-experiments` at `ba6967a` (slice G) in `740089d`.
Conflicts: `CLAUDE.md` (both pointers kept) and `src/middleware.ts`: slice G's bot-filter exemption for the unpublish link is kept, and its copy of the good-bot list is dropped in favour of `src/lib/botFilter.ts` (one list).

### What changed

- F1, prices in copy (the reject). No separate detector any more: `forbiddenClaim` (`src/lib/experiments/types.ts`) runs slice G's detectors, `priceClaimsIn` and `legalClaimsIn`, newly exported from `src/lib/articles/publishGuard.ts`, on every copy string in both languages and on the label, with no published price allowed.
  The shared detector now also holds, for articles too: a currency sign after the number (`2,095$`), the full-width sign (`＄99`), euro and pound, `bucks`, `dólares`, spelled-out amounts in English and Spanish (`two hundred dollars`, `doscientos dólares`), and `half price`, `half off`, `a mitad de precio`, `two for one`, `BOGO`.
  A strict short-copy mode, used only by experiments, adds deal words (free, gratis, discount, descuento, deal, oferta, sale, rebaja, save, ahorre, off, promo, cheap, barato) and any bare number of three or more digits; these stay out of articles because prose legitimately says "feel free", "save time", "in 2026" and links the free-estimate page.
  Legal claims (insured, guaranteed, permits, warranty...) are now refused in variant copy too; the phone number and the license checks stay.
- F2: the homepage buttons render only payload `wording` (no label fallback; a variant without wording renders nothing), and the button surfaces require `wording` in every variant (the create route refuses a colour-only variant). Labels are held to the copy rules anyway.
- F3: a proposed winner is promoted only after its veto message was delivered. `decision.pending` records `proposed_at` (the veto token is bound to it), `veto_outcome`, `attempts`, `last_attempt_at`, `veto_sent_at` and `promote_at`. Not delivered (failed, not configured, or no secret to sign the link): it stays pending, every daily run sends it again, and the admin card says "Veto message not delivered" with the outcome and attempts. Admin Promote and Veto still work at any time.
- F6: the cron is daily, `30 7 * * *`; evaluation runs on the Monday run only; promotion is checked daily. `promote_at` is the first 07:30 UTC run at least 24 hours after delivery (with ten minutes of slack for the scheduler starting early), and the Telegram message, the veto page and the admin card name that exact run (`src/lib/experiments/schedule.ts`).
- F4: the preview test names `&lang=en` on every URL. F5: the spec header gives the full run line (production build, `EXPERIMENTS_FAKE_CLOCK=1`, `RECAPTCHA_E2E_BYPASS_TOKEN` on the server and the test), EX3 skips with that reason when the token is missing, and the admin contexts in both specs use `bypassCSP` (only the admin ones, so the visitor contexts still prove the inline pre-paint script under the real CSP).
- F7: at phone width each variant is a stacked block with "Beats control" first and every number on screen; the table is kept for wider screens. Promote preselects the pending or evaluated winner, else the challenger with a better than even chance, else the control ("Promote A (keep the control)"); the button says the chance and is the primary style only for an evaluated winner. Probabilities near certainty read ">99.9%" or "<0.1%"; the header says the cron proposes; the control-wins reason reads correctly.
- F8: the skill starts drafts first (the seeded `landing-hero`), maps backlog items to surfaces (`sections` for "How it works above the service cards"), gives a key naming rule, and uses `node scripts/experiments.mjs copy --site <url> --page ... --element ...` to print today's copy (the report now carries `current_copy` per surface). The CLI refuses to run without `--site`, and `start` and `conclude` print the message Alex receives.
- The veto page is also in `PRIVATE_TOKEN_PATHS` (no sticky CTA or popups on it) and exempt from the bot filter like the unpublish link; `tests/proposal-pod-slice3.spec.ts` AC-R12 lists both Phase 2 links (it was red on the integration branch after slice G added the unpublish link).
- Specs: both record every visitor id the server mints for their browser contexts (any response, including the homepage itself) and remove those visitors' `hero-primary` and `hero-secondary` rows in `afterAll`; I deleted the 18 rows my own earlier runs of this round had left. Experiment fixture copy carries no digits (the strict rule refuses them).

### Evidence

| Fix | Evidence |
| --- | --- |
| F1 | Units: `experiments.spec.ts` "prices are unaddressable" (19 refused phrasings including every one the review got through, two legal claims, nine of today's real copies accepted, a priced label refused) and `articles-publish-guard.spec.ts` "price pattern (slice H)" (nine new forms held in articles) plus "the strict short-copy rules stay out of articles". Live EX6: the review's seven phrasings in a valid body on `/home-services hero` and a `$99 special` label all answer 400 "never tested". |
| F2 | Unit: no `?? v.label` in `heroStore.server.ts`; a colour-only button variant is refused with "renders nothing without wording". |
| F3, F6 | Units: `promotionRunAfter`, `isPromotionDue`, `isEvaluationDay`, the daily schedule in `vercel.json`, the message text. Live EX5 with a fake clock on the next Monday: proposed but not delivered (`not_configured`, attempt 1, `promote_at` null), the admin card shows "Veto message not delivered", Tuesday and Thursday runs retry and promote nothing, a winner seeded on Tuesday is not evaluated until Monday, the veto link still works while undelivered (the page says the promotion is not scheduled), and once delivery is recorded the run one hour early waits and Friday's run promotes. |
| F4, F5 | The full live run below passes on a production build with the documented command. |
| F7 | Live EX7: ">99.9%" on the desktop table, "Promote B (>99.9% chance it beats A)" for a winner, "Promote A (keep the control)" for an experiment whose challenger is losing, and on an iPhone 13 viewport the stacked block is inside 390 px with no page-level sideways scroll. I looked at the phone render of the `hero-primary` card: every number visible, buttons on one row. |
| F8 | Read the skill against the review's list; the CLI prints the "--site" refusal with no argument. |

### Commands run and results

| Command | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run chaos:static` on the final head | clean, clean, total 0 baselined 0 new 0 |
| `npm run build` (env exactly `env.rig`), `EXPERIMENTS_FAKE_CLOCK=1 RECAPTCHA_E2E_BYPASS_TOKEN=<32+ chars> next start -p 3120`, then `RECAPTCHA_E2E_BYPASS_TOKEN=<same> TEST_URL=http://localhost:3120 E2E_LIVE_BACKEND=1 playwright test tests/experiments.spec.ts tests/cta-tests.spec.ts tests/home-services-landing.spec.ts --project=chromium --workers=1` | 68 passed; afterwards `hero-primary` and `hero-secondary` hold the same 6 rows as before the run, and no `slice-h-*` experiment remains |
| `npm run test:build` with `.env.local` moved aside, `next start -p 3122`, `E2E_STUB_BACKEND=1 TEST_URL=http://localhost:3122 playwright test` (chromium and mobile) | 2765 passed, 476 skipped (live-only), 0 failed; `.env.local` restored and identical to `env.rig` |
| `curl -A "facebookexternalhit/1.1 python-requests" /experiments/veto/x.y` on the production build | 200 (exempt from the bot filter like the unpublish link) |

The bypass token is passed on the command line only; the env files stay exactly `env.rig`.
The rig still holds `hero-primary`, `hero-secondary` (running) and `landing-hero` (draft, as seeded).
