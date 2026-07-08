-- SEO Autonomy — Phase 3: monthly auto-maintenance roster.
--
-- maintained_articles is the small, human-curated list of "cornerstone" posts the
-- monthly /api/cron/seo-maintain job keeps alive:
--   - CREATE-IF-MISSING: if the slug has no blog_posts row yet, the cron drafts one
--     (published=false) so the newsletter always has a real article to feature.
--   - REFRESH-IF-STALE: monthly rows whose content is older than ~25 days get a
--     fresh AI draft queued as a content_actions 'refresh' (status 'drafted') for a
--     human to apply — never auto-applied to the live post.
-- Seasonal rows are skipped by the cron (they rotate via the Home Care
-- maintenance_catalog instead) but are listed here so the roster is complete.

CREATE TABLE IF NOT EXISTS public.maintained_articles (
  topic_key          TEXT PRIMARY KEY,
  slug               TEXT NOT NULL,
  title_hint         TEXT,
  target_query       TEXT,
  refresh_cadence    TEXT NOT NULL DEFAULT 'monthly'
                        CHECK (refresh_cadence IN ('monthly', 'seasonal')),
  enhancement_level  TEXT NOT NULL DEFAULT 'moderate',
  last_maintained_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the cornerstone roster. Slugs are the real blog_posts slugs the newsletter
-- links to; the cron creates the post if the slug doesn't exist yet.
INSERT INTO public.maintained_articles (topic_key, slug, title_hint, target_query, refresh_cadence, enhancement_level) VALUES
  ('kitchen-cost',    'kitchen-remodel-cost-northern-nj-2026',
    'Kitchen remodel cost in Northern NJ',            'kitchen remodel cost nj',        'monthly',  'moderate'),
  ('basement-legal',  'basement-legal-living-space-nj-code-requirements',
    'Legal basement living space — NJ code requirements', 'basement legal living space nj', 'monthly',  'moderate'),
  ('additions-cost',  '2025-home-addition-costs-in-millburn-nj-what-50-homeowners-actually-paid',
    'Home addition costs in Millburn, NJ',            'home addition cost nj',          'monthly',  'moderate'),
  ('seasonal-checklist', 'seasonal-home-maintenance-checklist-northern-nj',
    'Seasonal home maintenance checklist for Northern NJ', 'home maintenance checklist nj', 'seasonal', 'light')
ON CONFLICT (topic_key) DO NOTHING;

-- Give the drafter a locked "current year" fact so refreshed cost articles bump
-- the year verbatim instead of the model guessing. content_facts shape:
-- (key, value, description, verified_at, verified_by, lock).
INSERT INTO public.content_facts (key, value, description, verified_by) VALUES
  ('current_year', '2026', 'Current calendar year for cost/date references in articles', 'seed')
ON CONFLICT (key) DO NOTHING;

-- RLS: service-role only (matches 20260801000000_create_email_preferences.sql).
-- No public policies = locked down; the server uses SUPABASE_SECRET_KEY.
ALTER TABLE public.maintained_articles ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.maintained_articles IS 'Cornerstone posts kept alive monthly by /api/cron/seo-maintain (create-if-missing + refresh-if-stale)';
