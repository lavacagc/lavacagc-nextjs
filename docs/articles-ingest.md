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
node scripts/ingest-article.mjs specnook-articles
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
| `--social` | For `publish` (or `create --publish`): the social copy file, `docs/social/<slug>.md`. It is checked like the article, and its Instagram caption goes in the Telegram (see "Social copy" below). |
| `--publish` | On create, publish right after creating. |
| `--days` | For `feedback`: the window, 7 to 90 days, default 28. |
| `--summary` | For `feedback`: a short readable summary instead of the full JSON. |
| `--dry-run` | Show what would be sent, send nothing. |
| `--specnook`, `--refresh` | For `specnook-articles`: the SpecNook origin (default `https://www.specnook.app`), and skip the 6-hour cache. |

The CLI exits 0 on success, 2 when the fact-lock refused, the publish guard held the article, or the guard refused a change to a live one (it prints the reasons), and 1 on any other failure.

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
5. Write the social copy to `docs/social/<slug>.md` (see "Social copy" below).
   If a SpecNook article genuinely overlaps the topic, add at most two links to it first (see "SpecNook links" below).
6. Publish with it.

   ```bash
   node scripts/ingest-article.mjs publish <post id> --social docs/social/<slug>.md --action 6f1c2d3e-0000-4000-8000-000000000000
   ```

   On success it prints the live URL; the article is on `/blog`, its own page and `sitemap.xml` on the next request.
   On exit code 2 it was refused or held: fix what the reasons name (patch the article) and publish again, or leave it for Alex and say so.
7. Commit the social file alone on a branch from main and open its PR (no Co-Authored-By line), then publish the posts through Postiz (see "Postiz posts" below).

   ```bash
   git fetch origin && git switch -c social/<slug>-<YYYY-MM-DD> origin/main && git add docs/social/<slug>.md
   git commit -m "docs(social): <article title>" && git push -u origin HEAD && gh pr create --fill
   node scripts/postiz-posts.mjs --file docs/social/<slug>.md --postiz "$POSTIZ_URL"
   ```

8. To take it down: `node scripts/ingest-article.mjs unpublish <post id>`.

### Refreshing an existing article from the SEO queue

A `refresh` (or `consolidate`) action rewrites a post that is already live.
Patch that post with the action id: the live post is NOT changed, the new version is stored on the action as its draft.
The draft is the title and the body; when it is applied, the meta title follows the title and the excerpt and meta description are derived from the body, so a refresh that changes the title also changes what `<title>` shows and what the guard checks.
A later patch with the same action id and no `--file` (a category, say) builds on that draft, not on the live post, so it never replaces a finished draft with the live text.

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
| `POST /api/articles/ingest/<id>/publish` | `{ action_id?, social? }` (`social` is the markdown of the social copy file, up to 16 KB; the body may be up to 20 KB). First the fact-lock (`validateDraft`: three internal links, only the locked phone and license) on the content that would go live, action draft included: a failure is 422 `{ published: false, error, issues }` and nothing changes. Then the publish guard, on every call, held post or not. After the guard passes, the social copy (when sent): a failure is 422 `{ published: false, error, social: [reasons] }` and nothing changes. Pass: `{ published: true, id, slug, url, published_at, unpublish_url, telegram, social: 'included' or 'none' }`, any review hold cleared, the action (if any) marked completed. Hold: 409 `{ published: false, hold: [reasons], adminUrl, telegram }` and the post stays a draft with `review_hold` set. |
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
2. Price claims: dollar amounts, per-square-foot or per-linear-foot prices, "starting at", "from $", "costs", "cost of", "price(s)", "estimate(s) of", "quote(s) of" followed by a number (a year-shaped number too: "costs 2000"), and percentages, in digits or words, next to off, save, discount or cheaper. A home service's starting price, exactly as the Services & Prices table holds it and in its unit, stated as a starting price (never inside save, off or discount wording) in a paragraph that names that service, is allowed. A year in prose ("in 2026", "since 2020") is not a price.
3. Legal claims: permit, code compliant, to code, building code, warranty, guarantee(d), insured, bonded, liability, lawsuit, legal(ly), ADA, OSHA, lead-safe, EPA, asbestos, mold remediation. A sentence that is, verbatim, the value of a locked `claim_*` fact in `content_facts` is allowed; `claim_license` and `claim_insurance` hold Alex's approved sentences, locked by migration `20261030000004_lock_claim_facts.sql`.
4. Shape: the opening paragraph is 25 to 70 words with no link, there is at least one `##` heading, and a title starting with How, What, Why, When, Should, Can, Does or Is has a FAQ of 2 to 6 items.

The title, every paragraph, the FAQ, and an excerpt or meta description of their own are all checked.
Each reason names the text and where it is, for example `Price claim: "from $9,000" in paragraph 4`.
If the Services & Prices table cannot be read, the guard never falls back to the seed the public pages use: it holds the article with the reason `Price catalog unavailable; publish again in a minute` (`CATALOG_UNAVAILABLE_REASON`).
When that is the only reason, the scheduled-publish cron keeps the post's schedule, reports it under `deferred` instead of `held`, and sends no Telegram, so the next hourly run publishes it once the table is back.

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
The token is `base64url(postId.publishedAtUnix.publishNonce).HMAC-SHA256(INTERNAL_WEBHOOK_SECRET)`, valid 7 days, and only while the post is still live with that publication's random `publish_nonce`: once used, or after the article is published again (even within the same second), the link answers 410.
After the button Alex gets `Article unpublished: <title> <url>`.

The publish response carries `unpublish_url` and `telegram` (`sent`, `not_configured` or `failed`), and the CLI prints both; Telegram never decides whether the publish happens.

## Social copy

Decision 006 (Q22): the retired Supabase function used to email Alex a "post published" note with ready-made social copy; now Claude writes that copy with each article, and it reaches Alex in the publish Telegram.

1. After `create` (the slug is known, so is the URL), the skill writes `docs/social/<slug>.md` in the repo: the article URL and date, an Instagram and Facebook caption (up to 2,200 characters with the hashtags: a hook, three plain sentences, a call to the service page), a Google Business post (up to 1,500, no hashtags, no emoji), an X post (up to 280), a Threads post of its own (up to 500, at most one hashtag, never "link in bio") and 3 to 5 hashtags. The format and checklist are in `.claude/skills/articles/references/social.md`.
2. `publish <id> --social docs/social/<slug>.md` sends the file with the publish.
3. The route checks it after the publish guard passes and before anything is written (`src/lib/articles/socialCopy.ts`): the article's own price and legal rules on every post and the hashtags (`claimReasons`, shared with the guard; a compound hashtag is split into words first, a number next to save, off or discount in a hashtag is a price claim, and a hashtag in one case, which cannot be split, is held if it contains a claim word or a number other than a year), the length limits, 3 to 5 hashtags, at most one hashtag and no "link in bio" in the Threads post, no hashtags or emoji in the Google Business post, the article URL in the X, Threads and Google Business posts, the `Article:` line pointing at this post on the La Vaca site, and a call to a La Vaca service page in the caption. The file may be up to 16 KB. A failure is 422 with the reasons; the CLI exits 2 and nothing is published.
4. On a pass the publish Telegram carries the caption after the unpublish link:

   ```
   New article published: <title> <url>
   Unpublish: <signed link>

   Instagram caption:
   <caption>
   ```

   The message stays under Telegram's 4,096 characters: a caption that does not fit is cut with "(Caption cut to fit Telegram; the full copy is in docs/social/<slug>.md.)".
5. The file stays in the repo as the record of what was suggested.
   After the publish, the posts script below publishes the text posts through Postiz, so nobody pastes them.

## Postiz posts

After a successful publish and once the social file's PR is open, `scripts/postiz-posts.mjs` publishes the article's text posts through La Vaca's Postiz.
Article posts go out without Alex's approval (decision 007, 2026-10-29); the general never-auto-post rule still covers everything else, such as reels and carousels.

```bash
node scripts/postiz-posts.mjs --file docs/social/<slug>.md --postiz "$POSTIZ_URL" [--date 2026-11-02T14:00:00Z | --draft] [--dry-run]
```

By default it publishes now (`type: "now"`); `--date` schedules for that time (`type: "schedule"`, must be in the future); `--draft` creates calendar drafts dated tomorrow 14:00 UTC or `--date` and publishes nothing, for a run Alex wants to look at first.
What it sends: one `POST <url>/api/public/v1/posts` with that `type`, `shortLink: false` and one entry per channel.

| Channel | Text from the file | Settings sent |
| --- | --- | --- |
| facebook | The Instagram and Facebook caption, then the hashtags | `post_type: "post"`, `url`: the article (link preview) |
| threads | The Threads post | none beyond `__type` |
| x | The X post | `who_can_reply_post: "everyone"` |
| gmb | The Google Business post | `topicType: "STANDARD"`, `callToActionType: "LEARN_MORE"`, `callToActionUrl`: the article |

Instagram, Pinterest and TikTok are skipped because they need an image or video.
The Threads section is the one the script treats as optional, because the social files written before Threads was added have none: such a file posts to the other three channels and prints `threads: no "Threads" section in the file, skipped`.
The channel ids come from `GET /integrations` on every run; the first enabled channel of each kind is used.
Postiz's `CreatePostDto` accepts `type: "now" | "schedule" | "draft"`; a draft starts no publishing workflow (verified on the local Postiz v1.47.0: `state = DRAFT`, no Temporal `post_<id>` workflow), a `now` post is handed to the publishing worker as soon as the request is accepted.
They land as four separate calendar entries, one per channel, not one grouped post: Postiz's public API gives every entry its own group.

Dedup: before creating, it lists Postiz's posts (`GET /posts`) from 60 days before the earlier of today and the post date to 60 days after the later of them, so a re-run with a far `--date` still finds its own posts, and skips a channel that already has a post (not deleted, not errored) with a link to the article URL in its text or a text at least 90% similar.
That is what makes a re-run after a partial failure safe: it never posts a channel twice.

After a `now` publish the script reads each post back from `GET /posts` (every 5 s, up to 45 s; `POSTIZ_POLL_MS` and `POSTIZ_POLL_TIMEOUT_MS` change that) and prints, per channel, `published <link>`, `FAILED` (Postiz's worker could not post it; the provider's reason is on the calendar entry, the public API does not return it) or `still QUEUE`.
Exit 2 means Postiz accepted the posts but at least one channel failed; the others are live, and a re-run retries only the failed ones.
First real run, 2026-10-29: Facebook, Threads and Google Business published; X failed with HTTP 402 "credits depleted" from api.x.com (the X developer account's API credits, a billing matter, not a code one).
The link must be the article URL itself, in any scheme, `www`, trailing-slash, query or fragment form; a longer URL that merely starts with it (another article's slug) does not count.
A channel whose only post errored is tried again.
If every channel already has the post, it creates nothing.

Environment for the weekly cloud routine:

| Variable | Value |
| --- | --- |
| `POSTIZ_API_KEY` | The organization's public API key (Postiz Settings, Public API). Sent as `Authorization: <key>`, without "Bearer". |
| `POSTIZ_URL` | The Postiz origin, `https://postiz.lavacagc.com` for the hosted instance (`http://localhost:4007` on Alex's Mac). `--postiz` overrides it. Surrounding whitespace, trailing slashes or periods, and a missing scheme (gets `https://`) are tolerated; anything else that is not a URL fails with a plain error naming the value. |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | A Cloudflare Access service token allowed by the policy in front of the hosted instance. Sent as `CF-Access-Client-Id` and `CF-Access-Client-Secret`, only when both are set. |

The routine's network policy must allow the Postiz host.
Exit 0 means done (posts handed to Postiz, or everything already there); exit 1 prints one plain reason:

- 401: the API key is wrong.
- 403 or a redirect: Cloudflare Access stopped the request, so the service token is missing or not allowed (without it, Access answers with a redirect to its login page).
- 429: over Postiz's hourly limit on post creations for the organization, set by the instance's `API_LIMIT` (90 unless set; the local instance runs 30); run it again after the hour, and the dedup keeps it from doubling anything.

`--dry-run` prints the request and sends nothing; with a key it still reads the channels and recent posts, without one it uses placeholder channel ids.
The tests are stub-backed: `tests/postiz-posts.spec.ts`.

## SpecNook links

SpecNook (`https://www.specnook.app`) is Alex's other product, and its blog can help a reader planning a remodel.
An article may carry at most two links to SpecNook articles where the topic genuinely overlaps; the rule and two worked examples are in `.claude/skills/articles/references/specnook-links.md`.

```bash
node scripts/ingest-article.mjs specnook-articles
```

It reads `https://www.specnook.app/sitemap.xml`, fetches each `/blog/<slug>` page and prints its slug, title, URL and first paragraph.
It needs no token, and caches the list in `$TMPDIR` for 6 hours so a run fetches it once (`--refresh` fetches again).
A list with a page that failed to load is not cached, so the next call tries again.
SpecNook links are full URLs, so the fact-lock's internal-link count (relative `/...` links only) never counts them: an article still needs its three La Vaca links.
The routine's network policy must allow `www.specnook.app`.

## Locked facts and counties

`feedback` also returns `facts` (the locked `content_facts` rows an article may quote verbatim: phone, license, service area, year, approved `claim_*` sentences) and `counties` (the home-services counties); `feedback --summary` prints both.
The Claude Code skill `.claude/skills/articles/SKILL.md` drives the whole loop: read feedback, pick a target, draft, grill (`references/grill.md`), create or patch, publish.
