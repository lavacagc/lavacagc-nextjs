---
name: experiments
description: Weekly A/B testing routine for the La Vaca website. Use when running the Monday experiments review, reading experiment results, starting a drafted experiment, concluding or promoting a variant, picking the next hypothesis from the backlog, or starting a new copy, layout, button, image, section-order or FAQ test on lavacagc.com. Prices are never tested.
---

# Experiments: the weekly routine

The site runs one A/B experiment per page and decides it with a Bayesian evaluator.
The cron runs daily at 07:30 UTC: on Mondays it evaluates and proposes winners on Telegram with a veto link; every day it retries an undelivered veto message and promotes a winner 24 hours after its message was delivered, unless vetoed.
This routine runs after the Monday cron and keeps the pipeline full.

Every call goes through `scripts/experiments.mjs` with `PROJECT_INGEST_TOKEN` set and `--site` given every time (no default): `--site http://localhost:<port>` on the local rig, `--site https://www.lavacagc.com` only for the real Monday run.
Background: `docs/experiments.md`.

## Rules (never break these)

1. Never prices. No amount in any form (`$99`, `2,095$`, `99 bucks`, `two hundred dollars`, a bare `2095`), no deal words (free, half price, discount, save, deal, off), no price field. The API refuses them with the reason; do not try to get around it.
2. Never the phone number, the license (HIC), or a legal claim (insured, guaranteed, permits, warranty). They are fixed facts.
3. One experiment per page. Only start on a page the report lists as free.
4. Both languages, always: every copy slot on `/home-services` needs `en` and `es`, with the same meaning, written plainly the way a native speaker would say it.
5. Write the hypothesis and the expected effect (metric, direction, rough size) before starting. No hypothesis, no experiment.
6. Only surfaces the report lists under "Surfaces", only their slots, and every slot a surface requires. A new surface is a code change, not an experiment.
7. Do not work around the veto: `conclude --winner` with a challenger goes through the same delivered-message, 24 hour window.

## Steps

1. Read the report: `node scripts/experiments.mjs report --site <url>`.
2. Act on what it says, per experiment:
   - `pending_promotion` with the veto message sent: nothing to do; it promotes itself at the run the report names unless Alex vetoes. Mention it.
   - `pending_promotion` with "veto message not delivered": it will not promote. Say so in the summary, so Alex can fix Telegram or decide in the admin.
   - `running` with `not_enough_data`: leave it; note the expected ready date.
   - `running` with `keep_running` for 8 weeks or more past its ready date: `conclude <key> --retire "no difference after N weeks"`.
3. Drafts first. If the report lists a draft (under "Drafts") on a page with nothing running, start it: `node scripts/experiments.mjs start <key> --site <url>`. The seeded `landing-hero` (decision 005, Q17) is the first one.
4. Otherwise pick the next test for every free page: the highest-priority open backlog item that maps to a surface.
   "How it works above the service cards" (and any "put X before Y") maps to `/home-services sections` (an `order`); "services heading" maps to `/home-services services-heading`.
   If none maps, add a sharper hypothesis with `backlog-add` and say so; do not invent a surface.
5. Get today's copy for the control: `node scripts/experiments.mjs copy --site <url> --page /home-services --element hero` prints the payload the page shows now.
   Put in every variant ONLY the slots the test changes (the slots must be the same in every variant); every other slot keeps showing today's copy.
   Variant A takes those slots exactly as `copy` printed them; each challenger changes one idea.
   A slot `copy` marks "locked" states a fixed fact (the hero `body` carries the license line) and can never be in a variant: leave it out.
   Example: to test the hero title, both variants carry only `title` (the template below), never `body`.
6. Write the variants file (template below), then create, preview, start:
   `node scripts/experiments.mjs create /tmp/exp.json --site <url>` prints the admin preview links (`?exp=<key>:<variant>`; a signed-in admin sees each variant, nothing is recorded);
   `node scripts/experiments.mjs start <key> --site <url>` sends the "Experiment started" Telegram and prints the message.
7. Post the summary, five lines or fewer: what concluded or is pending (and whether its veto message was delivered), what started (key, hypothesis, expected effect), what waits for data and until when.
   `node scripts/experiments.mjs notify --site <url> "..."`

Key names: `<element>-<yyyymmdd>` of the start day, for example `services-heading-20261102`.

## Variant file template

```json
{
  "key": "hero-20261102",
  "page": "/home-services",
  "element": "hero",
  "hypothesis": "Naming the three counties in the hero title raises requests from local visitors.",
  "expected_effect": "request_submitted per visitor up about 10 percent; clicks roughly flat.",
  "primary_metric": "request_submitted",
  "variants": [
    { "key": "A", "label": "Current hero", "payload": { "title": { "en": "<from the copy command>", "es": "<from the copy command>" } } },
    { "key": "B", "label": "Counties in title", "payload": { "title": { "en": "...", "es": "..." } } }
  ]
}
```

Slots: copy (`eyebrow`, `title`, `body`, `cta`, `heading`, `intro`, `imageAlt`) as `{ "en", "es" }`; `order` as the full list of section ids; `image` as a path under `/public`.
The label is for Alex only and is never shown to visitors; it follows the same rules.
Defaults: `control_key` A, 200 visitors per variant, 14 days.

## Errors you will see

- 409 "already has a running experiment": the page is taken; pick another page or wait.
- 400 "Prices are never an experiment variable" or "Copy may not ...": remove the price, amount, deal word, phone, license or legal claim.
- 400 "Both languages": add the Spanish. 400 "renders nothing without": add the required slot.
- 404 on every call: the token is wrong, or unset on that site.

## Schedule

A `/schedule` routine runs this skill every Monday at 08:30 America/New_York, after the cron, with `--site https://www.lavacagc.com`.
Set it up once with: `/schedule` "Every Monday 08:30 America/New_York: run the experiments skill in the lavaca website repo with --site https://www.lavacagc.com".
