# Review: Postiz drafts and SpecNook links (feat/article-postiz-drafts @ 870f4aa)

Reviewer: independent reviewer subagent (Opus 5.5), 2026-10-29.
Builder: postiz-drafts-builder (a different agent).
Scope: commits 5afc7ed and 870f4aa; no code was changed by this review.

## Overall verdict: REJECT

The drafts-only guarantee holds, the channel content and the SpecNook rule are right, and every gate is green.
It is rejected on one reproduced defect: the dedup misses existing drafts whenever `--date` is more than 60 days from today, so a second run creates a second set of drafts.
Two smaller fixes in the skill and the 429 message ride along.
All three are small; the rest of the branch can stay as it is.

## 1. Local Postiz: dry run, drafts only, dedup, cleanup - PARTIAL (dedup defect)

Rig: local Postiz at http://localhost:4007 (image `ghcr.io/gitroomhq/postiz-app:latest`), key read from the Postiz DB into the child process only, never into a file.
Test file: a throwaway social file for `https://www.lavacagc.com/blog/zz-review-postiz-drafts-test-20261029`, every post prefixed "REVIEW TEST zz".

Baseline before any run: `Post` 1757, `TagsPosts` 0, `Notifications` 357, `Errors` 19, `Media` 4, newest `Post.createdAt` 2026-10-13 18:13:14; Temporal workflow count 261.

- `--dry-run` printed one `POST /api/public/v1/posts` with `type: "draft"` and exactly four entries: facebook, threads, x, gmb, with the real integration ids from `GET /integrations`.
  It noted "tiktok, pinterest, instagram: skipped, they need media".
  `Post` stayed at 1757: nothing was sent.
- A real run with `--date 2027-03-01T14:00:00Z` created four rows.
  Each row is `state = DRAFT`, `deletedAt` null, on its own channel, with the settings shown in the dry run.
  Temporal stayed at 261 workflows and none named `post_cmvu0le...`.
  The Postiz source agrees: `createPost` calls `startWorkflow(..., state)` for every type, and `startWorkflow` returns before starting `postWorkflowV105` when the state is `DRAFT`.
- **Defect.** A second run with the same `--date 2027-03-01` did not skip: it created four more drafts (`Post` 1765).
  Cause: `GET /posts` is queried from now minus 60 days to now plus 60 days, so drafts dated 2027-03-01 are outside the window.
  I confirmed `GET /posts` does list those drafts when asked for a window that covers March 2027, so it is the window, not the API.
- With the default date (tomorrow 14:00 UTC) the dedup works: the first run created four drafts, the second printed "already in Postiz ... skipped" for all four channels and "Nothing to create.", exit 0.
  Facebook matched on text (100% similar), because its article URL is in `settings.url`, not in the text; the other three matched on the article URL.
- Cleanup: deleted the 12 test rows (`content like '%REVIEW TEST zz%'`, state DRAFT, created today; no `TagsPosts`, `Comments` or `Errors` rows pointed at them).
  Counts after: `Post` 1757, `TagsPosts` 0, `Notifications` 357, `Errors` 19, `Media` 4, newest `createdAt` unchanged, Temporal 261.
  No Postiz draft from this review is left behind.
- Cannot send `"now"` or `"schedule"`: `type` comes only from the exported constant `POST_TYPE = 'draft'`; `buildRequest` throws if the body's type is anything else; there is no option, env var or file field that feeds it.
  Tried: `--type now` and `--type=schedule` exit 1 with "Unknown option --type"; `POSTIZ_TYPE=now` is ignored (the dry run still prints `"type": "draft"`); assigning `POST_TYPE` from an importer throws `TypeError: Cannot assign to read only property`.
  The only way is editing the script.

Observation (not a defect of the script): Postiz's public API gives every entry its own `group` (a fresh uuid per post in `createOrUpdatePost`, and `body.group` only looks up a previous post), so Alex sees four separate drafts in the calendar, not one grouped post the way the Postiz UI creates them.
Worth one sentence in `docs/articles-ingest.md`.

## 2. Channel content and the social-copy checker - PASS (one minor gap)

From the dry run and the `Post.settings` column:

- Threads: its own post, sent as is, with `{ "__type": "threads" }`; the checker holds it over 500 characters, over one hashtag, and on "link in bio".
- Google Business: `topicType STANDARD`, `callToActionType LEARN_MORE`, `callToActionUrl` the article URL; the checker holds any hashtag and any emoji (a unit number such as "#2" is correctly not a hashtag).
- X: the X post, limit 280, `who_can_reply_post: everyone`.
- Facebook: the caption, a blank line, then the hashtags, with `post_type: post` and `url` the article for the link preview.
- The checker tests assert: two hashtags in the Threads post is held ("has 2 hashtags; at most 1"), a hashtag in the Google Business post is held, an empty file reports "the Threads post is missing", and the default correct file passes with no reasons.
  The Threads post also goes through the price and legal rules, its hashtag included.

Minor gap: nothing checks that the X, Threads and Google Business posts actually contain the article URL, though social.md says "URL included" for X and Threads and a closing call with the URL for Google Business.
The skill tells the writer to include it, so this is a should, not a blocker.

## 3. Error paths - PASS (429 wording is off)

- Wrong key against the local Postiz: "GET /integrations: 401, Postiz refused the API key. Check POSTIZ_API_KEY (...)", exit 1.
- No key: "Set POSTIZ_API_KEY.", exit 1; with `--dry-run` it uses placeholder ids and says the dedup was not checked.
- Unreachable origin: "cannot reach Postiz at http://localhost:4999/api/public/v1 (fetch failed)", exit 1.
- Cloudflare: `curl` to `https://postiz.lavacagc.com/api/public/v1/integrations` without a service token answers 302 to `old-field-2a50.cloudflareaccess.com/cdn-cgi/access/login/...`, so the builder is right that it is 302, not 403.
  The script, run against the hosted URL, prints "302, stopped by Cloudflare Access in front of Postiz. Set CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET ...", exit 1, both without CF headers and with a bogus pair.
  `redirect: 'manual'` is what makes this work; a 200 HTML login page is also mapped to the Cloudflare message.
  The spec only unit-tests `explainStatus(302)`; no CLI test drives a real redirect.
- 429: the stub test drives a 429 on `POST /posts` and gets exit 1 with the plain message.
  The message says "Postiz allows 90 post creations an hour".
  In the Postiz source the throttle is `API_LIMIT` (default 90) per hour per organization, counted only on `POST /public/v1/posts`, and the local container runs with `API_LIMIT=30`.
  So the number is wrong on Alex's own instance; it should name the setting rather than a fixed 90.

## 4. SpecNook - PASS

- `node scripts/ingest-article.mjs specnook-articles --refresh` against the live site, no token: exit 0, "SpecNook blog: 20 articles", each with slug, Title, URL and First paragraph (20 of 20 have a paragraph, none "could not read").
  The live sitemap has exactly 20 `/blog/` locs.
  Both worked-example slugs (`homeowner-construction-selections-guide`, `how-to-reduce-construction-project-delays`) are in the list.
- references/specnook-links.md states the rule as asked: at most two and zero is the usual answer; only on genuine homeowner overlap; never in the opening paragraph or the FAQ; never a substitute for the three internal links; none added on a decay-only refresh; social never links to SpecNook.
  It has the two worked examples (kitchen finishes: one link fits and the second candidate stays out; gutters: none fits).
  grill.md gained the matching check.
- The internal-link count: `INTERNAL_LINK_RE` in `src/lib/seo/draftGuardrails.ts` only matches `](/...)`, so a full `https://www.specnook.app/...` URL can never count.
  The test feeds two relative links plus two SpecNook links and asserts `internalLinks` is 2 and the draft fails.
  Separately, the publish guard's `HAS_LINK` rejects any link, full URLs included, in the opening paragraph, so that part of the rule is enforced in code; "at most two" is enforced only by the skill and the grill.
- Minor: a page that fails to fetch is cached with a null title for 6 hours; `--refresh` clears it, so it is a nit.

## 5. The skill - PASS with one fix

- SKILL.md is 118 lines (under 120).
- Step 8 "Postiz drafts" sits after step 7 "Publish" and is gated on "exit 0 and the social file's PR is open"; failures (401, 403, 429) are reported and the article stays published.
  The description now names Postiz drafts, so it triggers.
- Fix: nothing in SKILL.md, social.md or docs/articles-ingest.md tells the reader to commit `docs/social/<slug>.md` or open that PR, yet step 8 waits for it.
  A reader following the skill alone stops at a precondition no step produces.
  Either add the step (branch, commit the file, open the PR, with the routine's rules for that) or drop the precondition.

## 6. Gates - PASS

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run chaos:static`: exit 0, "total 0, baselined 0, NEW 0 ... no new violations."
- `npm run test:e2e -- tests/postiz-drafts.spec.ts tests/articles-specnook-links.spec.ts tests/articles-social-copy.spec.ts tests/articles-publish-guard.spec.ts` (stub-backed; this worktree has no `.env.local`, so nothing had to be moved aside): exit 0, 194 passed, 32 skipped.
  The skips are the live-backend specs, including the two route-level social publish tests, so the route's 422 on a file without Threads is proven at the `checkSocialCopy` level, which the route calls directly, not end to end.

## 7. The publish route refusing a social file without a Threads section - AGREE

It is right for the routine.
Alex's standing rule is that every feed post also goes to Threads, with its own variant, and the skill always writes the section.
The refusal only applies when `--social` is passed; a publish without a social file still works.
Nothing else produces social files: `docs/social/` does not exist on this branch or on `origin/main`, and the only writers named anywhere are the articles skill and the test fixtures, which were updated.
A file written before this change would now be refused, but none exists, and the 422 names the missing section, so the fix is obvious.

## Fix list

Required:

1. Dedup window: query `GET /posts` around both today and `--date` (from the earlier minus 60 days to the later plus 60 days), so a re-run with a far `--date` skips its own drafts; add a stub test with `--date` more than 60 days out that asserts the query window covers it.
2. Skill step 8: add the missing step that commits `docs/social/<slug>.md` and opens its PR (or remove the precondition), and mirror it in docs/articles-ingest.md "Writing a new article".
3. 429 message and docs: say Postiz limits post creations per hour per organization by its `API_LIMIT` setting (default 90; the local instance runs 30), not a fixed 90.

Recommended:

4. A CLI-level stub test that answers 302 with a Cloudflare `Location`, asserting exit 1 and the Cloudflare message.
5. Check that the X, Threads and Google Business posts contain the article URL, in `checkSocialCopy` (and so in the drafts script's `fileProblems`).
6. One sentence in docs/articles-ingest.md that the drafts land as four separate calendar entries (Postiz's public API gives each its own group).
7. Do not cache SpecNook pages that failed to fetch.
