-- Phase 2 slice G: the publish guard's locked legal sentences, and the record
-- of an admin's "Publish anyway" (docs/phase-2/acceptance-criteria.md, PG, SEC4).
--
-- 1. content_facts: two new keys, claim_license and claim_insurance. The guard
--    (src/lib/articles/publishGuard.ts) lets a sentence with a legal keyword
--    through ONLY when it is, verbatim, the value of a claim_* key whose lock is
--    true. These rows ship with PLACEHOLDER wording and lock = false, so until
--    Alex replaces the value with the exact sentence he approves and sets
--    lock = true, no legal claim passes. ON CONFLICT DO NOTHING: a value Alex
--    has already set is never overwritten by a replay.
--
--    To approve one (Supabase SQL editor):
--      UPDATE public.content_facts
--         SET value = '<the exact sentence>', lock = true,
--             verified_at = now(), verified_by = 'alex'
--       WHERE key = 'claim_insurance';
--
-- 2. blog_posts.review_override: who cleared a guard hold with "Publish anyway"
--    and what the hold said, `{ by, at, reasons }`. review_hold goes back to null
--    on that publish; this column is the audit trail. Written only by
--    /api/admin/articles/<id>/publish with an admin session. Guarded like the
--    other blog_posts columns because the table has no migration of its own.
--
-- 3. blog_posts.publish_nonce: a random value stamped on every draft-to-live
--    publish and carried in the signed one-tap unpublish link, so a link works
--    only for the publication it was minted for. published_at alone is not
--    enough: an unpublish and republish within one second truncate to the same
--    second (slice G review, fix 2).

DO $$
BEGIN
  IF to_regclass('public.content_facts') IS NOT NULL THEN
    INSERT INTO public.content_facts (key, value, description, verified_by, lock) VALUES
      ('claim_license',
       'PLACEHOLDER - Alex replaces: La Vaca General Contractors is a licensed New Jersey home improvement contractor.',
       'Locked legal sentence the publish guard allows verbatim (license). Placeholder until Alex approves the wording and sets lock = true.',
       'placeholder', false),
      ('claim_insurance',
       'PLACEHOLDER - Alex replaces: La Vaca General Contractors is fully insured.',
       'Locked legal sentence the publish guard allows verbatim (insurance). Placeholder until Alex approves the wording and sets lock = true.',
       'placeholder', false)
    ON CONFLICT (key) DO NOTHING;
  END IF;

  IF to_regclass('public.blog_posts') IS NOT NULL THEN
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS review_override jsonb;
    ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS publish_nonce text;
  END IF;
END $$;
