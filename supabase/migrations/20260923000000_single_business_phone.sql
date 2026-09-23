-- One business phone number everywhere: (201) 212-4917.
--
-- Hand-apply in the Supabase SQL editor. Idempotent.
--
-- The code-side copy was fixed in the same change, but published content in the
-- database still carries seven retired or wrong La Vaca numbers, in body copy
-- AND in meta titles/descriptions (so they also leak into search snippets):
--
--   (201) 241-1580  20 blog posts (the seo-blog-posts batch 2-4 imports)
--   (973) 842-8399   5 blog posts (home-care guides)
--   (201) 614-2068   1 blog post  (nj-snowstorm-february-2026-protect-your-home)
--   (201) 662-7269   1 blog post  (how-to-prepare-your-home-for-renovation)
--   (201) 928-1027   1 blog post  (basement-legal-living-space-nj-code-requirements, incl. a tel: link)
--   (201) 614-2814   5 projects   (meta_description)
--   (201) 614-5930 / (201) 931-2726  retired from code; swept here in case any row copied them
--
-- Third-party numbers (township building departments, NJ Division of Consumer
-- Affairs) are deliberately NOT in these patterns.

-- Display form "(201) 241-1580" and the bare 10-digit form used in tel: links.
CREATE OR REPLACE FUNCTION pg_temp.single_phone(t text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(
             t,
             '\((?:201\) (?:241-1580|614-2068|662-7269|928-1027|614-2814|614-5930|931-2726)|973\) 842-8399)',
             '(201) 212-4917', 'g'),
           '(?:2012411580|2016142068|2016627269|2019281027|2016142814|2016145930|2019312726|9738428399)',
           '2012124917', 'g')
$$;

UPDATE public.blog_posts SET
  title            = pg_temp.single_phone(title),
  excerpt          = pg_temp.single_phone(excerpt),
  content          = pg_temp.single_phone(content),
  meta_title       = pg_temp.single_phone(meta_title),
  meta_description = pg_temp.single_phone(meta_description)
WHERE concat_ws(' ', title, excerpt, content, meta_title, meta_description)
      IS DISTINCT FROM pg_temp.single_phone(concat_ws(' ', title, excerpt, content, meta_title, meta_description));

UPDATE public.projects SET
  seo_title        = pg_temp.single_phone(seo_title),
  meta_description = pg_temp.single_phone(meta_description),
  challenge        = pg_temp.single_phone(challenge),
  solution         = pg_temp.single_phone(solution)
WHERE concat_ws(' ', seo_title, meta_description, challenge, solution)
      IS DISTINCT FROM pg_temp.single_phone(concat_ws(' ', seo_title, meta_description, challenge, solution));
