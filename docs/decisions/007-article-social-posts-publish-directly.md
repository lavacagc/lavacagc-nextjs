# Decision 007 - article social posts publish through Postiz without approval

Decided by Alex on 2026-10-29, in the CLI, after the Postiz drafts step shipped in PR #111:
"On the Postiz configuration, you should be able to publish directly. You shouldn't have to wait for my approval or my draft to publish those specifically for these types of posts that you're making."

## What changes

- `scripts/postiz-drafts.mjs` becomes `scripts/postiz-posts.mjs`.
  By default it publishes the article's text posts (Facebook, Threads, X, Google Business) now (`type: "now"`); `--date` schedules them; `--draft` keeps the old behaviour for a run Alex wants to see first.
- The article skill (step 8), `docs/articles-ingest.md` and the weekly routine's prompt say "post through Postiz", not "queue drafts for Alex".
- The dedup stays: a channel that already carries a post with the article URL or a near-identical text is skipped, so a re-run after a partial failure never doubles a post.

## What does not change

- The standing never-auto-post rule still covers every other kind of post: reels, carousels, portfolio photos, anything with media.
  This decision is for the text posts the article skill writes for its own article.
- The article itself still passes the publish guard, and Alex still gets the Telegram with the one-tap unpublish link.
- Instagram, Pinterest and TikTok are still skipped by the script because they need media.

## Why

The posts are generated from an article that already passed the guard and is already public; holding four drafts for a manual click added a day of delay and a chore without adding a check.
