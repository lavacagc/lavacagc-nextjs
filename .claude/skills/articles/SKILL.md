---
name: articles
description: Write, refresh or SEO-edit a La Vaca blog article and publish it through the article CLI. Use when asked to write a blog post or article, refresh or fix a decaying post, answer an SEO queue action, or improve an article for search, AEO or local SEO.
---

# La Vaca articles

You write and publish La Vaca General Contractors blog articles yourself, with no human in the loop, so the article must be true, plain and safe before it goes live.
The site's publish guard is the last gate: it holds any article with a price claim, a legal claim, a wrong phone or license, or a bad shape, and Alex gets a Telegram either way.
Your job is that the guard never has to hold yours.

Everything runs through one CLI, `scripts/ingest-article.mjs` (full flags: `node scripts/ingest-article.mjs --help`, the API: `docs/articles-ingest.md`).
It needs `PROJECT_INGEST_TOKEN` in the shell; `--site` defaults to production, so pass `--site http://localhost:<port>` on the local rig.

## 1. Read the feedback

```bash
node scripts/ingest-article.mjs feedback --summary
```

Done when you have the summary's decaying pages, open actions, new-article candidates, **locked facts** and **counties** in front of you.
The locked facts and counties are the only sources for the phone, license, service area, year and place names you will write.
For the full JSON (every page, every candidate): drop `--summary`.

## 2. Pick the target

In this order, take the first that applies:

1. The topic Alex asked for. If an open action matches it, keep that action id.
2. An open action from the summary (`new`, `refresh` or `consolidate`); keep its id.
3. A decaying page that is a blog post (it shows `post <id>`): a refresh of that post.
4. A new-article candidate query with real impressions.

Write down, before drafting: the target (new post, or the post id you refresh), the action id if any, the one question the article answers, and the town and county it is for.

## 3. Draft

Write `article.md` (first line `# Title`) and `faq.json` (`[{ "q": "...", "a": "..." }]`).
The shape, every item required:

- An **answer-first** opening paragraph: 25 to 70 words that answer the question in full, no link in it.
- `##` sections for the rest; at least one.
- At least three internal links, such as `/home-services/<slug>`, `/services/<slug>`, `/locations/<slug>`, `/free-estimate`, `/process`.
- One FAQ block of 2 to 6 real questions in `faq.json` (required when the title starts with How, What, Why, When, Should, Can, Does or Is).
- At least one town and one county from `counties`, and the `service_area` fact sentence, worded as the fact says.
- Phone and license exactly as the locked facts give them, or not at all.

Claims you leave out (the guard holds them, so write around them):

- **Prices**: no dollar amounts, per-square-foot prices, "starting at", "costs N", discounts or percentages off.
  The one exception is a home-services starting price quoted exactly as `/home-services` shows it, in a paragraph that names that service.
- **Legal**: no permits, code compliance, warranties, guarantees, insured, bonded, liability, lawsuits, ADA, OSHA, EPA, lead-safe, asbestos or mold remediation.
  The one exception is a locked `claim_*` fact sentence, quoted verbatim.
  Explain what the homeowner should ask their town or check themselves instead of promising anything.

The detailed AEO and local-SEO checklist is in [references/aeo-local-seo.md](references/aeo-local-seo.md); read it for every new article.

## 4. Grill the draft

Run every check in [references/grill.md](references/grill.md) against `article.md` and `faq.json`, and fix the draft until each one passes.
Done when every item in the grill is marked pass with its evidence; a single unverified factual sentence means rewrite or cut it.

## 5. Create or patch

New article:

```bash
node scripts/ingest-article.mjs create --file article.md --category "<category>" --faq faq.json [--action <action id>]
```

Refresh of a live post (from a `refresh` or `consolidate` action; the live post stays unchanged until publish):

```bash
node scripts/ingest-article.mjs patch <post id> --file article.md --faq faq.json --action <action id>
```

A plain `patch` of a live post without `--action` is checked by the guard too; exit code 2 means nothing changed.
Done when the CLI printed the post id and the preview link.

## 6. Publish

```bash
node scripts/ingest-article.mjs publish <post id> [--action <action id>]
```

- Exit 0: it is live. Report the URL, the unpublish link and the Telegram status it printed.
- Exit 2: the guard held it and printed the reasons. Fix each reason in `article.md`, `patch`, and `publish` again.
  If a reason is a claim the article cannot do without, stop and leave it held for Alex; report the reasons and the admin link.
  Only Alex can publish over a hold ("Publish anyway" in the admin); never work around the guard.
- Exit 1: an error; report it.

## 7. Report

Tell Alex, in this order: what you published or left held, its URL or admin link, the target and action id, the questions it answers, and the grill result in one line per section.
