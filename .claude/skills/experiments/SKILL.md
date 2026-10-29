---
name: experiments
description: Weekly A/B testing routine for the La Vaca website. Use when running the Monday experiments review, reading experiment results, concluding or promoting a variant, picking the next hypothesis from the backlog, or starting a new copy, layout, button, image, section-order or FAQ test on lavacagc.com. Prices are never tested.
---

# Experiments: the weekly routine

The site runs one A/B experiment per page and decides it with a Bayesian evaluator.
The Monday cron (07:30 UTC) evaluates, proposes winners on Telegram with a 24 hour veto link, and promotes unvetoed winners.
This routine runs after it, every Monday, and keeps the pipeline full.

Every call goes through `scripts/experiments.mjs` with `PROJECT_INGEST_TOKEN` set (add `--site http://localhost:<port>` on the local rig).
Background: `docs/experiments.md`.

## Rules (never break these)

1. Never prices. No amount, discount, percentage, `priceDisplay`, `startingPriceCents` or `minimumCents`, in any slot or any wording. The API refuses them; do not try to get around it.
2. Never the phone number or the license (HIC). They are fixed facts.
3. One experiment per page. Only start on a page the report lists as free.
4. Both languages, always: every copy slot on `/home-services` needs `en` and `es`, with the same meaning. Write the Spanish yourself, plainly, as a native speaker would say it.
5. Write the hypothesis and the expected effect (metric, direction, rough size) before starting. No hypothesis, no experiment.
6. Only surfaces the report lists under "Surfaces", only their slots. A new surface is a code change, not an experiment.
7. Do not promote by hand around the veto window: `conclude --winner` with a challenger goes through the same 24 hour Telegram veto.

## Steps

1. Read the report:
   `node scripts/experiments.mjs report`
2. Act on what it says, per experiment:
   - `pending_promotion`: nothing to do; it promotes itself after 24 hours unless Alex vetoes. Mention it in the summary.
   - `running` with verdict `winner` but not pending (the cron has not run yet): `node scripts/experiments.mjs conclude <key> --winner <variant>`.
   - `running` with `not_enough_data`: leave it; note the expected ready date.
   - `running` far past its ready date with `keep_running` for 8 weeks or more: retire it, `conclude <key> --retire "no difference after N weeks"`.
3. Pick the next test for every page with nothing running: the highest-priority open backlog item whose page and element are in "Surfaces".
   If none fits, add a sharper hypothesis with `backlog-add` and say so; do not invent a surface.
4. Write the variants in a JSON file (template below): the control is today's copy exactly as the page shows it; each challenger changes one idea.
   Use the slots of that surface only, the same slots in every variant.
5. Create, preview, start:
   `node scripts/experiments.mjs create /tmp/exp.json` (prints the admin preview links `?exp=<key>:<variant>`; a signed-in admin sees each variant, nothing is recorded),
   then `node scripts/experiments.mjs start <key>`. Starting sends the "Experiment started" Telegram.
6. Post the summary, five lines or fewer: what concluded or is pending, what started (key, hypothesis, expected effect), what waits for data and until when.
   `node scripts/experiments.mjs notify "..."`

## Variant file template

```json
{
  "key": "landing-hero-2",
  "page": "/home-services",
  "element": "hero",
  "hypothesis": "Naming the three counties in the hero title raises requests from local visitors.",
  "expected_effect": "request_submitted per visitor up about 10 percent; clicks roughly flat.",
  "primary_metric": "request_submitted",
  "variants": [
    { "key": "A", "label": "Current hero", "payload": { "title": { "en": "<current English title>", "es": "<current Spanish title>" } } },
    { "key": "B", "label": "Counties in title", "payload": { "title": { "en": "...", "es": "..." } } }
  ]
}
```

Slots: copy (`eyebrow`, `title`, `body`, `cta`, `heading`, `intro`, `imageAlt`) as `{ "en", "es" }`; `order` as the full list of section ids; `image` as a path under `/public`.
Defaults: `control_key` A, 200 visitors per variant, 14 days.

## Errors you will see

- 409 "already has a running experiment": the page is taken; pick another page or wait.
- 400 "Prices are never an experiment variable" or "Copy may not ...": remove the price, amount, phone or license.
- 400 "Both languages": add the Spanish.
- 404 on every call: the token is wrong, or unset on the site.

## Schedule

A `/schedule` routine runs this skill every Monday at 08:30 America/New_York, after the cron.
Set it up once with: `/schedule` "Every Monday 08:30 America/New_York: run the experiments skill in the lavaca website repo against https://www.lavacagc.com".
