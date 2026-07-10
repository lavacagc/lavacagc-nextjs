-- Drops the unused SEO-proposal columns from blog_posts.
--
-- Background: an SEO agent hand-applied `is_seo_proposal` + `seo_proposal_source_slug`
-- to prod in 2026-05 (the ADD migration was never merged - see closed PR #1). The
-- SEO-proposal feature ultimately shipped via the `content_actions` table instead,
-- so these two columns and their partial index are dead: nothing in the codebase
-- reads or writes them.
--
-- IF EXISTS everywhere: on prod the columns/index exist (hand-applied) and get
-- dropped; on a from-scratch migration replay they were never created (the ADD is
-- not in repo history), so IF EXISTS makes this a safe no-op there too.

DROP INDEX IF EXISTS public.idx_blog_posts_seo_proposal;

ALTER TABLE public.blog_posts
  DROP COLUMN IF EXISTS is_seo_proposal,
  DROP COLUMN IF EXISTS seo_proposal_source_slug;
