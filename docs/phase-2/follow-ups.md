# Phase 2 follow-ups

Things that cannot be done from a branch: settings in Vercel and Supabase, decisions only Alex can make, and work a later slice owns.
Each line says who does it and when.

## Slice F (OpenAI removal, article routes)

- Delete `OPENAI_API_KEY` from Vercel (Production and Preview) after slice F deploys; nothing in the app reads it any more.
- Delete the `OPENAI_API_KEY` secret from the Supabase project (`supabase secrets unset OPENAI_API_KEY`) after the functions below are deleted.
- Delete the three retired edge functions from the deployed Supabase project, since removing their folders does not undeploy them: `supabase functions delete generate-blog-post`, `supabase functions delete enhance-blog-content`, `supabase functions delete generate-blog-image`.
- `generate-blog-seo` was called by the old editor but is not in the repo; check the Supabase dashboard and delete it too if it was ever deployed.
- Set `PROJECT_INGEST_TOKEN` in Vercel if it is not already set (32 characters or more); without it every `/api/articles/*` route answers 404.
- Remove the `seo-maintain` cron from the Vercel project if it still shows after the deploy (it is gone from `vercel.json`).
- Read the production RLS policies on `blog_posts` before relying on preview behaviour: the editor and list still write from the browser with the admin session, and the preview page reads drafts the same way (audit section 9).
- Alex: the privacy policy (`src/content/privacy-policy-content.md`, section 5.1, "AI Providers") still says OpenAI helps produce website content and imagery. After this release no OpenAI call remains, and articles are written with Claude Code (Anthropic). The wording is a legal disclosure, so it was left for Alex to approve.

## Slice G (publish guard, Telegram, skill)

- Seed `claim_license` and `claim_insurance` in `content_facts` with the exact wording Alex approves.
- Replace the stub in `src/lib/articles/publishGuard.ts` and add the Telegram messages where the publish route marks them.
