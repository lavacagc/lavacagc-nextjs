-- SEO Autonomy Engine — Phase 1 (Observer)
--
-- Tables for ingesting GSC + GA4 metrics, scoring, and queueing content actions.
-- Phase 1 only writes to seo_metrics; later phases populate content_actions /
-- blog_post_revisions / content_facts.

-- ─── seo_metrics ──────────────────────────────────────────────────────────────
-- One row per (source × url × query × date). Idempotent via UNIQUE constraint
-- so the nightly cron can safely re-pull the same window.
CREATE TABLE IF NOT EXISTS public.seo_metrics (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL CHECK (source IN ('gsc', 'ga4')),
  url             TEXT NOT NULL,
  query           TEXT,                              -- null for GA4 rows
  date            DATE NOT NULL,
  impressions     INTEGER NOT NULL DEFAULT 0,
  clicks          INTEGER NOT NULL DEFAULT 0,
  position        NUMERIC(6,2),
  ctr             NUMERIC(6,4),
  users           INTEGER NOT NULL DEFAULT 0,
  engaged_sessions INTEGER NOT NULL DEFAULT 0,
  conversions     INTEGER NOT NULL DEFAULT 0,
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Treat NULL query as a sentinel so the unique constraint actually fires for
  -- GA4 rows (Postgres treats NULLs as distinct in UNIQUE constraints by default).
  CONSTRAINT seo_metrics_unique_source_url_query_date
    UNIQUE NULLS NOT DISTINCT (source, url, query, date)
);

CREATE INDEX IF NOT EXISTS idx_seo_metrics_url_date
  ON public.seo_metrics (url, date DESC);

CREATE INDEX IF NOT EXISTS idx_seo_metrics_query_date
  ON public.seo_metrics (query, date DESC)
  WHERE query IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seo_metrics_source_date
  ON public.seo_metrics (source, date DESC);

-- ─── content_actions ──────────────────────────────────────────────────────────
-- Queue of suggested actions (refresh / consolidate / new). Phase 2 populates
-- this table. Created now so the schema lands in one migration.
CREATE TABLE IF NOT EXISTS public.content_actions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type           TEXT NOT NULL CHECK (action_type IN ('refresh', 'consolidate', 'new')),
  target_post_id        UUID REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  consolidate_into_id   UUID REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  target_query          TEXT,
  rationale             JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_lift_clicks  INTEGER,
  status                TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected', 'drafted', 'completed', 'rolled_back')),
  draft_markdown        TEXT,
  draft_meta            JSONB,
  published_post_id     UUID REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at           TIMESTAMPTZ,
  reviewed_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_content_actions_status_created
  ON public.content_actions (status, created_at DESC);

-- ─── blog_post_revisions ──────────────────────────────────────────────────────
-- Snapshot of a post's content/title/meta at a point in time. Used by the
-- post-publish rollback guardrail (revert if 14d CTR drops >20%).
CREATE TABLE IF NOT EXISTS public.blog_post_revisions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id             UUID NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  content_html        TEXT,
  meta_description    TEXT,
  excerpt             TEXT,
  revised_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  revised_by          TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_blog_post_revisions_post_revised
  ON public.blog_post_revisions (post_id, revised_at DESC);

-- ─── content_facts ────────────────────────────────────────────────────────────
-- Lock-table for facts the Gemini drafter MUST NOT hallucinate (HIC#, phone,
-- pricing bands). Pre-publish validator regexes drafts against these values.
CREATE TABLE IF NOT EXISTS public.content_facts (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  description     TEXT,
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by     TEXT,
  lock            BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed the obvious ones (user can edit values via Supabase UI later).
INSERT INTO public.content_facts (key, value, description, verified_by) VALUES
  ('hic_number', '13VH13373800', 'NJ Home Improvement Contractor license number', 'seed'),
  ('phone_main', '(201) 212-4917', 'Main business phone', 'seed'),
  ('email_info', 'info@lavacagc.com', 'Public info email', 'seed'),
  ('email_leads', 'alex@vacamoo.com', 'Lead notification recipient (override via LEAD_NOTIFICATION_EMAIL env)', 'seed'),
  ('service_area', 'Northern New Jersey (Bergen, Essex, Morris, Union counties)', 'Service territory', 'seed')
ON CONFLICT (key) DO NOTHING;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.seo_metrics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_actions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_facts     ENABLE ROW LEVEL SECURITY;

-- Only the service role (server) reads/writes these. No public access.
-- (No policies = locked down. Service role bypasses RLS.)

COMMENT ON TABLE public.seo_metrics IS 'Daily GSC + GA4 metrics, ingested by /api/cron/seo-ingest';
COMMENT ON TABLE public.content_actions IS 'Queue of suggested SEO actions (refresh / consolidate / new) reviewed in /vaca-mgmt/seo';
COMMENT ON TABLE public.blog_post_revisions IS 'Snapshot history for rollback guardrail';
COMMENT ON TABLE public.content_facts IS 'Locked facts the Gemini drafter must use verbatim, never hallucinate';
