-- Adds two columns to blog_posts to support SEO agent proposals.
--
-- Both columns are additive with safe defaults; existing rows behave identically.
-- The public blog page already filters .eq('published', true), so proposals
-- (which we always insert with published=false) remain invisible to readers.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS is_seo_proposal BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS seo_proposal_source_slug TEXT NULL;

-- Partial index — only proposal rows are indexed. Keeps writes on regular
-- rows free of overhead.
CREATE INDEX IF NOT EXISTS idx_blog_posts_seo_proposal
  ON public.blog_posts (seo_proposal_source_slug)
  WHERE is_seo_proposal = true;

COMMENT ON COLUMN public.blog_posts.is_seo_proposal IS
  'True when this row is an SEO agent proposal (not a human draft). Always paired with published=false.';

COMMENT ON COLUMN public.blog_posts.seo_proposal_source_slug IS
  'For SEO proposals: slug of the published post this proposal is meant to replace.';
