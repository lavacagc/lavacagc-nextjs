# Experiments: continuous A/B testing

The site tests copy, layout, buttons, images, section order and FAQ wording, one experiment per page, and decides each one with a Bayesian evaluator.
Prices are never tested (decision 005).
Contract: `docs/phase-2/acceptance-criteria.md`, "Experiments (slice H, decision 005)".
The weekly routine: `.claude/skills/experiments/SKILL.md`.

## How a visitor is assigned

The seed is `R` in the `cta_v` cookie, 32 hex characters, the same seed the Phase 1 homepage buttons used.
The homepage pre-paint script draws it; middleware draws it on a first visit to `/home-services` so the server render can use it.
The variant is `fmix32(fnv1a(seed + ":" + key)) % n` over the active variants in key order (`src/lib/experiments/assign.ts`, reusing `ctaIndex`).
The two migrated homepage buttons keep hashing on `primary` and `secondary`, so the migration moved nobody.
A crawler always gets the control and is never counted.
A visitor without a seed gets the control and is not counted.
A signed-in admin can preview any variant, drafts included, with `?exp=<key>:<variant>`; nothing is recorded.

## Where experiments render

| Page | Element | Slots |
| --- | --- | --- |
| `/home-services` | `hero` | eyebrow, title, body, cta, image, imageAlt |
| `/home-services` | `services-heading` | heading, intro |
| `/home-services` | `sections` | order (every section id once) |
| `/` | `hero-primary`, `hero-secondary` | wording, subtext, color (the Phase 1 buttons) |

`withExperiment(page, element, lang)` (`src/lib/experiments/withExperiment.server.ts`) applies the payload on the server.
A concluded experiment renders its control, which is the promoted winner; a retired or draft one renders the page's own default.
The payload schema is a closed set of slots with no price field (`src/lib/experiments/types.ts`).
Every string of a variant, both languages and the label, goes through the article publish guard's price and legal detectors (`src/lib/articles/publishGuard.ts`) in their strict short-copy mode with no published price allowed: `$99`, `2,095$`, `＄99`, `99 bucks`, `two hundred dollars`, `doscientos dólares`, `half price`, `free`, `discount`, `save`, `deal`, any bare number of three or more digits, and legal claims are all refused, as are the phone number and the license.
The label is for the admin and Telegram only; a visitor only ever sees payload fields, and the homepage button surfaces require `wording`.

## The funnel

| Event | Recorded by |
| --- | --- |
| `view`, `click` | `ExperimentZone` beacons to `POST /api/experiments/event` (the homepage buttons use `/api/cta/event`) |
| `request_started` | the request flow opening, same sink |
| `request_submitted` | `POST /api/home-services/request`, from the signed `cta_vid` cookie |
| `quote_accepted` | the admin marking a request Won (with the price) |
| `job_paid` | the admin marking a Won request Paid (revenue) |

Each event is recorded once per visitor, experiment and variant.
Downstream events go to the variants the visitor viewed while the experiment ran.

## The decision

`GET /api/cron/experiments-evaluate` runs daily at 07:30 UTC.
On the Monday run it evaluates every running experiment (`src/lib/experiments/evaluate.ts`).
Beta(1,1) posteriors on the primary metric per visitor and 10,000 seeded Monte Carlo draws give, per challenger, the probability it beats the control and the expected loss.
A winner needs a 95 percent probability, at most 0.5 percent expected loss, at least `min_visitors` visitors in every variant and at least `min_days` days.
A challenger at 5 percent or less is retired; when every challenger loses, the control is kept and the experiment concludes.
A winner goes to `pending_promotion` and gets a Telegram message carrying a one-tap veto link (`/experiments/veto/<token>`, signed, 7 days, read-only page with one button).
It is promoted only after that message was delivered (Telegram answered `sent`, recorded on the experiment with its time).
If the send failed, Telegram is not configured, or there is no secret to sign the link, it stays pending, every daily run sends it again, and the admin card says "Veto message not delivered".
Once delivered, the daily run at least 24 hours later promotes it unless vetoed (`src/lib/experiments/schedule.ts`; the message and the admin card name that run): the winner becomes the control and the experiment concludes.
A veto keeps the control and concludes the experiment.

## Agent routes

All take `Authorization: Bearer $PROJECT_INGEST_TOKEN` (or an admin session), answer 404 without it, and share a 30 a minute rate limit per IP.

| Route | Does |
| --- | --- |
| `GET /api/experiments/report` | every experiment with funnel, evaluation and decision, the open backlog, the surfaces, and the copy each surface shows today |
| `POST /api/experiments` | create a draft (409 when the page has a running experiment) |
| `POST /api/experiments/<key>/start` | start a draft |
| `POST /api/experiments/<key>/conclude` | `{ winner_key }` (via the veto window) or `{ retire: true, reason }` |
| `GET`, `POST /api/experiments/backlog` | read or add hypotheses |
| `POST /api/experiments/notify` | post the weekly summary to Telegram |

The CLI is `scripts/experiments.mjs` (`report`, `copy`, `backlog`, `backlog-add`, `create`, `start`, `conclude`, `notify`); every command needs `--site`, there is no default.

## Admin

Marketing > Experiments lists running, pending, draft and concluded experiments with the funnel, the probability, the expected loss, revenue per visitor and the decision.
One tap starts, promotes, vetoes or retires, recorded with the admin's id.
The homepage buttons keep their Phase 1 editor there, and the old `cta_events` counts show as read-only history.

## Setup

- Cron: `vercel.json` has `/api/cron/experiments-evaluate` at `30 7 * * *` (daily; evaluation on Mondays inside the route).
- Env: `PROJECT_INGEST_TOKEN` (agent routes), `CRON_SECRET`, `INTERNAL_WEBHOOK_SECRET` (visitor ids and veto links), `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (messages; without them every message reports `not_configured`).
- Migration: `supabase/migrations/20261030000003_cta_to_experiments.sql` (guarded, re-runnable).
- Weekly agent: a `/schedule` routine running the experiments skill every Monday after the cron.
