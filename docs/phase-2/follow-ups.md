# Phase 2 follow-ups

Things that cannot be done from a branch: settings in Vercel and Supabase, decisions only Alex can make, and work a later slice owns.
Each line says who does it and when.

## Slice F (OpenAI removal, article routes)

- Delete `OPENAI_API_KEY` from Vercel (Production and Preview) after slice F deploys; nothing in the app reads it any more.
- Delete the `OPENAI_API_KEY` secret from the Supabase project (`supabase secrets unset OPENAI_API_KEY`) after the functions below are deleted.
- Delete the three retired edge functions from the deployed Supabase project, since removing their folders does not undeploy them: `supabase functions delete generate-blog-post`, `supabase functions delete enhance-blog-content`, `supabase functions delete generate-blog-image`.
- Delete the `publish-scheduled-articles` edge function and any pg_cron job or dashboard schedule that calls it: `supabase functions delete publish-scheduled-articles`.
  The Vercel cron `/api/cron/publish` (daily, 11:00 UTC) does the same job and also stamps `published_at` and revalidates; the function did neither and raced the cron.
  The function also emailed a "Blog Post Published" note with social copy; that email is gone with it (slice G's Telegram publish message is the notification now).
  If Alex schedules posts for times other than the daily 11:00 UTC run, the cron schedule in `vercel.json` needs to run more often.
- `generate-blog-seo` was called by the old editor but is not in the repo; check the Supabase dashboard and delete it too if it was ever deployed.
- Set `PROJECT_INGEST_TOKEN` in Vercel if it is not already set (32 characters or more); without it every `/api/articles/*` route answers 404.
- Remove the `seo-maintain` cron from the Vercel project if it still shows after the deploy (it is gone from `vercel.json`).
- Read the production RLS policies on `blog_posts` before relying on preview behaviour: the editor and list still write from the browser with the admin session, and the preview page reads drafts the same way (audit section 9).
- Alex: the privacy policy (`src/content/privacy-policy-content.md`, section 5.1, "AI Providers") still says OpenAI helps produce website content and imagery. After this release no OpenAI call remains, and articles are written with Claude Code (Anthropic). The wording is a legal disclosure, so it was left for Alex to approve.

## Slice G (publish guard, Telegram, skill)

- Alex: write the exact `claim_license` and `claim_insurance` sentences. Migration `20261030000002_content_facts_claims.sql` seeds both as unlocked placeholders, which the guard ignores, so until then no sentence with a legal keyword can be published by Claude. To approve one, in the Supabase SQL editor: `UPDATE public.content_facts SET value = '<the exact sentence>', lock = true, verified_at = now(), verified_by = 'alex' WHERE key = 'claim_insurance';` (same for `claim_license`).
- Apply migration `20261030000002_content_facts_claims.sql` to production with the release (it adds `blog_posts.review_override`, which the article routes read).
- Make sure `INTERNAL_WEBHOOK_SECRET` (32 characters or more) is set in Vercel Production; it signs the one-tap unpublish links. Without it the publish Telegram says there is no link and every old link answers 410. It already guards `/api/notify/*`, so it should be set.
- Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in Vercel if not already (they carry the lead alerts today); the publish, held and unpublished messages use the same chat.
- When slice E (catalog in the database) merges, point `loadCatalogPrices()` in `src/lib/articles/catalogPrices.ts` at `getCatalog()`, so the price the guard allows is the price the admin set.
- The service area fact (`Northern New Jersey (Bergen, Essex, Morris, Union counties)`) names Union county, which the home-services `COUNTIES` list (Essex, Morris, Bergen) does not. The skill uses both as written; Alex may want them to agree.
