-- blog_posts: the dashboard-created columns, so a from-scratch replay (local rig,
-- preview branches) has the table the blog pages and the article routes read.
--
-- Production created blog_posts in the Supabase dashboard; the replay only has
-- the stub in 00000000000000_preview_baseline.sql (id, published) plus the
-- columns later migrations add. The full column list is the one in
-- src/integrations/supabase/types.ts (docs/phase-2/00-audit.md section 1).
--
-- Every statement is ADD COLUMN IF NOT EXISTS, guarded on the table existing,
-- so on production (where every column already exists) this is a no-op. No
-- NOT NULL without a default and no constraint is added: a constraint here
-- could fail on production rows this migration has never seen.

DO $$
BEGIN
  IF to_regclass('public.blog_posts') IS NOT NULL THEN
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS title text;
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS slug text;
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS content text;
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS category text;
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS author text DEFAULT 'Alex T.';
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS excerpt text;
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS featured_image text;
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS meta_title text;
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS meta_description text;
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS meta_keywords text;
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;
