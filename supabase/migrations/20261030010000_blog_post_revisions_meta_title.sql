-- A refresh draft's meta title now follows its title (src/lib/articles/actions.ts,
-- rebuiltFromDraft), so the snapshot taken before a draft is applied has to keep
-- the old meta title too, or the 14-day rollback would restore the old title under
-- the new meta title. Nullable: older revisions have none, and the rollback leaves
-- the meta title alone when the revision does not carry one.
ALTER TABLE public.blog_post_revisions ADD COLUMN IF NOT EXISTS meta_title TEXT;
