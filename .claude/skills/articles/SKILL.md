---
name: articles
description: Write, refresh or SEO-edit a La Vaca blog article, publish it through the article CLI, write its social copy and post it through Postiz. Use when asked to write a blog post or article, refresh or fix a decaying post, answer an SEO queue action, improve an article for search, AEO or local SEO, or write social posts for an article.
---

# La Vaca articles

You write and publish La Vaca General Contractors blog articles yourself, with no human in the loop, so the article must be true, plain and safe before it goes live.
The site's publish guard is the last gate: it holds any article with a price claim, a legal claim, a wrong phone or license, or a bad shape, and Alex gets a Telegram either way.
Your job is that the guard never has to hold yours.

Everything runs through one CLI, `scripts/ingest-article.mjs` (full flags: `node scripts/ingest-article.mjs --help`, the API: `docs/articles-ingest.md`).
It needs `PROJECT_INGEST_TOKEN` in the shell.
`--site` defaults to the LIVE site: on the local rig, a dry run or a test, pass `--site http://localhost:<port>` on every command, or you publish to production.
Write `article.md` and `faq.json` in a scratch folder outside the repo (for example `$TMPDIR/articles/<slug>/`), never in the working tree.

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
5. Nothing above (an empty feedback and no topic from Alex): one question homeowners ask about a home service, for one county in `counties`; say in the report that you chose it.

Write down, before drafting: the target (new post, or the post id you refresh), the action id if any, the one question the article answers, and the town and county it is for.

## 3. Draft

Write `article.md` (first line `# Title`) and `faq.json` (`[{ "q": "...", "a": "..." }]`).
The shape, every item required:

- An **answer-first** opening paragraph: 25 to 70 words that answer the question in full, no link in it.
- `##` sections for the rest; at least one.
- At least three internal links, such as `/home-services/<slug>`, `/services/<slug>`, `/locations/<slug>`, `/free-estimate`, `/process`.
- One FAQ block of 2 to 6 real questions in `faq.json` (required when the title starts with How, What, Why, When, Should, Can, Does or Is).
- At least one county from `counties` and a town inside one of those counties (only `counties` decides where; never a town outside them), and the `service_area` fact sentence, worded as the fact says.
- Phone and license exactly as the locked facts give them, or not at all.

Claims you leave out (the guard holds them, so write around them):

- **Prices**: no dollar amounts, per-square-foot prices, "starting at", "costs N", discounts or percentages off.
  The one exception is a home service's starting price (the main price on `/home-services`, not a second line such as "Two story from $349"), quoted exactly, as a starting price, in a paragraph that names that service; never inside "save", "off" or "discount" wording.
- **Legal**: no permits, code compliance, warranties, guarantees, insured, bonded, liability, lawsuits, ADA, OSHA, EPA, lead-safe, asbestos or mold remediation.
  The one exception is a locked `claim_*` fact sentence, quoted verbatim.
  Explain what the homeowner should ask their town or check themselves instead of promising anything.

The detailed AEO and local-SEO checklist is in [references/aeo-local-seo.md](references/aeo-local-seo.md); read it for every new article.

SpecNook links (optional): run `node scripts/ingest-article.mjs specnook-articles` and add at most two, only where the topic genuinely overlaps, never in the opening paragraph and never counted among the three La Vaca links, following [references/specnook-links.md](references/specnook-links.md).

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

## 6. Social copy

Write the article's social copy to `docs/social/<slug>.md` in the repo (the slug the CLI printed), following [references/social.md](references/social.md): an Instagram and Facebook caption, a plain Google Business post (no hashtags), an X post, a Threads post of its own, 3 to 5 hashtags, the article URL and today's date.
It obeys the article's price and legal rules word for word; done when every item in the social.md checklist passes.
It goes out with the publish below, which checks it like the article and puts the caption in Alex's Telegram.

## 7. Publish

```bash
node scripts/ingest-article.mjs publish <post id> --social docs/social/<slug>.md [--action <action id>]
```

- Exit 0: it is live. Report the URL, the unpublish link and the Telegram status it printed.
- Exit 2: the guard held it, or the social copy failed (nothing published), and it printed the reasons. "paragraph N" counts every blank-line block, headings and lists included.
  Fix each reason in `article.md` (then `patch`) or in the social file, and `publish` again.
  "Price catalog unavailable" is not about the text: change nothing and `publish` again in a minute.
  If a reason is a claim the article cannot do without, stop and leave it held for Alex (only he can "Publish anyway"; never work around the guard), and report the reasons and the admin link.
- Exit 1: an error; report it.

## 8. Social PR, then post through Postiz

Only after exit 0: commit the social file alone on a branch from main and open its PR (no Co-Authored-By line), then publish the posts through Postiz without Alex's approval (decision 007; pass `--draft` only if he asked to see this one first).
A docs-only social PR is the one change that may skip the no-mistakes gate (CLAUDE.md, "Shipping changes"); the time suffix keeps a second run on the same day from colliding with the first branch.

```bash
git fetch origin && git switch -c social/<slug>-<YYYY-MM-DD>-<HHMM> origin/main && git add docs/social/<slug>.md
git commit -m "docs(social): <article title>" && git push -u origin HEAD && gh pr create --fill
node scripts/postiz-posts.mjs --file docs/social/<slug>.md --postiz "$POSTIZ_URL"
```
Needs `POSTIZ_API_KEY` (plus `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` for the hosted instance), skips channels that already have the post so a re-run is safe, and prints each channel as published with its link, FAILED, or still publishing: exit 2 when a channel failed (report which), exit 1 when the request itself failed (401, 403, 429: report its message), else 0, the article staying published either way.

## 9. Report

Tell Alex, in this order: what you published or left held, its URL or admin link, the social copy file, the Postiz result per channel (publishing, skipped, or the failure), the target and action id, the questions it answers, and the grill result in one line per section.
