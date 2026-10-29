# Writing blog articles from Claude Code

Claude Code writes, edits, publishes and takes down La Vaca blog articles through four routes and a small CLI, and reads search performance from a fifth.
It replaced the OpenAI drafters, which are gone (decision record `docs/decisions/004-grill-round-1-phase-2.md`, Q9 to Q13).
A new article is created as a DRAFT, which never shows on the public site.
Publishing runs the publish guard first, and a held article stays a draft with its reasons recorded for Alex.

Acceptance criteria: `docs/phase-2/acceptance-criteria.md` (ART, FB, RM).
The project ingest this mirrors: `docs/projects-ingest.md`.

## One-time setup

The article routes use the same token as the project ingest, `PROJECT_INGEST_TOKEN`.
This document calls it the ingest token (`INGEST_TOKEN` in prose); it is that one variable, not a second one.

1. If the project ingest is already set up, there is nothing to do.
2. Otherwise generate a token of at least 32 characters (`openssl rand -hex 32`), add `PROJECT_INGEST_TOKEN` in Vercel for Production (and Preview if you test there), and redeploy.
3. Keep the same value in your shell or in `.env.local` as `PROJECT_INGEST_TOKEN` for the CLI.

If the variable is missing or shorter than 32 characters, every `/api/articles/*` route answers 404 to everyone, signed-in admins included.
That is deliberate: a deploy that forgot the token exposes nothing.

## The CLI

`scripts/ingest-article.mjs` needs Node 18 or newer and nothing else.

```bash
export PROJECT_INGEST_TOKEN=...   # the value from Vercel

node scripts/ingest-article.mjs create --file article.md --category "Kitchen Remodeling" --faq faq.json
node scripts/ingest-article.mjs patch <post id> --file article.md
node scripts/ingest-article.mjs publish <post id>
node scripts/ingest-article.mjs unpublish <post id>
node scripts/ingest-article.mjs feedback --summary
```

| Option | Meaning |
| --- | --- |
| `--site` | The site to post to. Default `ARTICLE_INGEST_SITE`, then `PROJECT_INGEST_SITE`, then `https://www.lavacagc.com`. |
| `--token` | The ingest token. Default `PROJECT_INGEST_TOKEN`. |
| `--file` | The article in markdown. A first line `# Title` becomes the title (unless `--title` is given) and is left out of the body. |
| `--title`, `--category` | Required on create (the title may come from the file). Category is free text, for example `Kitchen Remodeling`. |
| `--slug` | Optional. Lowercase letters, digits and hyphens. Left out, it comes from the title, with `-2`, `-3` added when taken. |
| `--excerpt`, `--meta-title`, `--meta-description`, `--keywords` | Optional SEO fields. Left out, the excerpt and meta description come from the opening of the article and the meta title is the title. |
| `--image` | Optional featured image, an https URL. |
| `--faq` | A JSON file holding `[{ "q": "...", "a": "..." }]`, up to 10 items. It renders as a FAQ section under the article and as `FAQPage` structured data. |
| `--action` | The id of a content action from the SEO queue this article answers (see below). |
| `--publish` | On create, publish right after creating. |
| `--days` | For `feedback`: the window, 7 to 90 days, default 28. |
| `--summary` | For `feedback`: a short readable summary instead of the full JSON. |
| `--dry-run` | Show what would be sent, send nothing. |

The CLI exits 0 on success, 2 when the publish guard held the article or refused a change to a live one (it prints the reasons), and 1 on any other failure.

## Worked example for Claude Code

Alex says: "Write something for people searching how long a kitchen remodel takes in Bergen County, and publish it if it passes."

1. Read what search is saying first.

   ```bash
   node scripts/ingest-article.mjs feedback --summary
   ```

   It lists decaying pages, open actions from the weekly SEO queue, and new-article candidates.
   If an open `new` action matches the topic, use its id with `--action` so the queue knows this article answers it.
2. Write `article.md`: a `# Title` line, an opening paragraph that answers the question in 25 to 70 words with no link in it, `##` sections, at least three internal links such as `/services/kitchen-remodeling` and `/free-estimate`, and the town and county.
   Use the phone number and license only exactly as they are in `content_facts`; never write a price, a discount or a legal claim (permits, code, warranty, insurance) unless it is one of the locked fact sentences.
3. Write `faq.json` with two to six questions people actually ask.
4. Create the draft and look at it.

   ```bash
   node scripts/ingest-article.mjs create --file article.md --category "Kitchen Remodeling" --faq faq.json \
     --action 6f1c2d3e-0000-4000-8000-000000000000
   ```

   It prints the post id, the slug, a preview link (admin sign-in) and an admin link.
5. Publish.

   ```bash
   node scripts/ingest-article.mjs publish <post id> --action 6f1c2d3e-0000-4000-8000-000000000000
   ```

   On success it prints the live URL; the article is on `/blog`, its own page and `sitemap.xml` on the next request.
   On exit code 2 it was held: fix what the reasons name and publish again, or leave it for Alex and say so.
6. To take it down: `node scripts/ingest-article.mjs unpublish <post id>`.

### Refreshing an existing article from the SEO queue

A `refresh` (or `consolidate`) action rewrites a post that is already live.
Patch that post with the action id: the live post is NOT changed, the new version is stored on the action as its draft.

```bash
node scripts/ingest-article.mjs patch <live post id> --file article.md --action <action id>
node scripts/ingest-article.mjs publish <live post id> --action <action id>
```

The publish checks the post as it would read with the draft applied, then applies it the way the admin's "Apply to live post" does: the current version is saved to `blog_post_revisions` first and its 14-day click-through rate recorded, so the weekly rollback check can put the old version back if the refresh hurts.
Alex can apply the same draft from the admin instead (SEO tab, "Apply to live post").

A patch WITHOUT `--action` changes the post directly, live or not, and a live post's pages refresh at once; it gets no snapshot, so use the action path for refreshes.

## The API, for anything that is not the CLI

All routes take `Authorization: Bearer <PROJECT_INGEST_TOKEN>` (or a signed-in admin session) and are rate limited to 30 requests a minute per IP, counted before the token is checked.
Errors are `{ error }` with a status code, plus `issues: [{ path, message }]` for validation failures, and never include server internals.
The site's bot filter refuses a few client user agents (curl, wget, python-requests and others), so send a browser-like `User-Agent` when testing with curl (`curl -A "Mozilla/5.0" ...`).

| Route | What it does |
| --- | --- |
| `POST /api/articles/ingest` | Create an unpublished draft (`source = 'claude'`). JSON: `{ title, slug?, content, category, excerpt?, meta_title?, meta_description?, meta_keywords?, featured_image?, faq?: [{ q, a }], action_id? }`. Answers 201 `{ id, slug, adminUrl, previewUrl }`. `action_id` must name an open `new` action. |
| `PATCH /api/articles/ingest/<id>` | Change any subset of the same fields. `published` is kept as it was. With the `action_id` of a refresh or consolidate whose live post is `<id>`, the post is not changed and the result becomes the action's draft. |
| `POST /api/articles/ingest/<id>/publish` | `{ action_id? }`. Runs the publish guard. Pass: `{ published: true, id, slug, url, published_at, unpublish_url, telegram }`, the action (if any) is marked completed. Hold: 409 `{ published: false, hold: [reasons], adminUrl, telegram }` and the post stays a draft with `review_hold` set. |
| `POST /api/articles/ingest/<id>/unpublish` | Take it down. `{ published: false, id, slug }`. |
| `GET /api/articles/seo-feedback?days=28` | `{ window, pages: [{ path, impressions, clicks, ctr, position, trend_delta, decaying, post? }], pages_total, refresh_candidates, new_article_candidates, suggested_actions, open_actions: [{ id, kind, status, target, rationale }], truncated, facts: [{ key, value }], counties }`. At most 200 pages; `decaying` means fewer clicks in the last 14 days than the 14 before; `post` is the blog post when the path is `/blog/<slug>`. |

Example, publishing a draft:

```bash
curl -A "Mozilla/5.0" -X POST "https://www.lavacagc.com/api/articles/ingest/<id>/publish" \
  -H "Authorization: Bearer $PROJECT_INGEST_TOKEN"
```

## What the owner sees

In the admin, Content > Blog lists the draft marked "From Claude Code"; the admin link the CLI prints opens it in the editor.
The SEO tab shows each queued action with a "Draft with Claude Code" button that gives the exact commands for that action, and once Claude has drafted it, "Send to blog" (new articles) or "Apply to live post" (refreshes).

## Publish guard

Every publish runs `checkPublishable` in `src/lib/articles/publishGuard.ts`: Claude's publish route, the admin editor's Save on a draft going live, the admin list's Publish button, and the scheduled-publish cron.
A token `patch` of a post that is already live is checked too, so a live article cannot pick up a claim by an edit; a refused patch writes nothing and answers 409 (`changed: false`), and the CLI exits 2.

It checks, in order, and holds the article on any reason:

1. The fact-lock (`validateDraft`): at least three internal links, any phone number equals `phone_main`, any HIC number equals `hic_number`.
2. Price claims: dollar amounts, per-square-foot or per-linear-foot prices, "starting at", "from $", "costs", "cost of", "price(s)", "estimate(s) of", "quote(s) of" followed by a number, and percentages next to off, save, discount or cheaper. A home-services starting price, exactly as the catalog shows it, in a paragraph that names that service, is allowed. A bare year ("in 2026") is not a price.
3. Legal claims: permit, code compliant, to code, building code, warranty, guarantee(d), insured, bonded, liability, lawsuit, legal(ly), ADA, OSHA, lead-safe, EPA, asbestos, mold remediation. A sentence that is, verbatim, the value of a locked `claim_*` fact in `content_facts` is allowed; the seeded `claim_license` and `claim_insurance` are unlocked placeholders until Alex approves their wording.
4. Shape: the opening paragraph is 25 to 70 words with no link, there is at least one `##` heading, and a title starting with How, What, Why, When, Should, Can, Does or Is has a FAQ of 2 to 6 items.

The title, every paragraph, the FAQ, and an excerpt or meta description of their own are all checked.
Each reason names the text and where it is, for example `Price claim: "from $9,000" in paragraph 4`.

A held article stays a draft with `review_hold = { reasons, checked_at }`.
It is cleared in exactly two ways: a later publish whose guard passes on the post's current content, or Alex's "Publish anyway" in the admin editor, which publishes it and records his user id and the reasons in `review_override`.
The ingest token can never clear a hold while the guard still fails, and no route takes `review_hold` as an input.

## Telegram and the one-tap unpublish link

When Claude publishes (or the cron publishes a scheduled post), Alex's Telegram chat gets:

```
New article published: <title> <url>
Unpublish: <signed link>
```

When the guard holds it: `Article held for review: <title> <adminUrl>` and the first three reasons.
The admin's own publishes from the editor or list send nothing.

The link opens `/articles/unpublish/<token>`, a page with the title, the slug and one Unpublish button; opening it changes nothing, the button does.
The token is `base64url(postId.publishedAtUnix).HMAC-SHA256(INTERNAL_WEBHOOK_SECRET)`, valid 7 days, and only while the post is still live with that publish date: once used, or after the article is published again, the link answers 410.
After the button Alex gets `Article unpublished: <title> <url>`.

The publish response carries `unpublish_url` and `telegram` (`sent`, `not_configured` or `failed`), and the CLI prints both; Telegram never decides whether the publish happens.

## Locked facts and counties

`feedback` also returns `facts` (the locked `content_facts` rows an article may quote verbatim: phone, license, service area, year, approved `claim_*` sentences) and `counties` (the home-services counties); `feedback --summary` prints both.
The Claude Code skill `.claude/skills/articles/SKILL.md` drives the whole loop: read feedback, pick a target, draft, grill (`references/grill.md`), create or patch, publish.
