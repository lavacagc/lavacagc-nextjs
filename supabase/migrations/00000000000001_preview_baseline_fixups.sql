-- Forward fix-ups for the preview baseline.
--
-- Supabase preview branches are PERSISTENT and apply each migration version
-- exactly once. An earlier push already applied 00000000000000_preview_baseline
-- in its initial, bare form (just `id` columns), so later edits to that file
-- never re-run on a branch that has already recorded version 00000000000000.
-- That left blog_posts/service_areas without the columns the real migrations
-- need, and follow_up_queue uncreated.
--
-- This migration (version 00000000000001 — sorts immediately after the baseline
-- and before every real, timestamped migration) re-applies those stubs
-- idempotently, so BOTH an already-initialized preview branch and a fresh one
-- converge on the same state. Every statement is IF [NOT] EXISTS, so it is a
-- no-op on production and on a fresh branch where the (now complete) baseline
-- already created everything. gen_random_uuid() is built into Postgres 13+.

-- Tables that exist only in the live DB (created via the dashboard, not a
-- migration). Defensive CREATE IF NOT EXISTS — already present on every branch
-- that ran the baseline, but keeps this migration self-contained.
CREATE TABLE IF NOT EXISTS public.blog_posts     (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.leads          (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.estimate_leads (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.service_areas  (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.project_images (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- Columns later migrations reference but never ADD themselves.
--   blog_posts.published -> partial-index predicate in 20251222155716.
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS published boolean DEFAULT false;
--   service_areas.{name,active,has_page,sort_order,description} -> seed INSERT in 20260717000000.
ALTER TABLE public.service_areas ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.service_areas ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE public.service_areas ADD COLUMN IF NOT EXISTS has_page boolean DEFAULT true;
ALTER TABLE public.service_areas ADD COLUMN IF NOT EXISTS sort_order integer;
ALTER TABLE public.service_areas ADD COLUMN IF NOT EXISTS description text;

-- follow_up_queue: ALTERed in 20260219 but only CREATEd (IF NOT EXISTS) in
-- 20260716. Create it here (schema copied from 20260716, after leads/
-- estimate_leads for the FKs) so the Feb ALTER applies and the Jul CREATE no-ops.
CREATE TABLE IF NOT EXISTS public.follow_up_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  estimate_lead_id uuid REFERENCES public.estimate_leads(id) ON DELETE SET NULL,
  lead_email text NOT NULL,
  lead_name text NOT NULL,
  follow_up_type text NOT NULL CHECK (follow_up_type IN ('instant_ack', '24h', '48h', '7d')),
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'responded')),
  email_subject text NOT NULL,
  email_body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- app_role / user_roles / has_role: created in the dashboard on production and
-- referenced by 20260808120000_create_proposal_categories (policies call
-- has_role(auth.uid(), 'admin'::app_role)). Without them a from-scratch replay
-- (local `supabase db reset`, a preview branch) stops at that migration. All
-- three are guarded, so production is untouched.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

-- rate_limits: dashboard-created on production and read by src/lib/rateLimit.ts
-- (columns per src/integrations/supabase/types.ts). Without it every limiter
-- fails open on a from-scratch replay, so no 429 path can be verified locally.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  last_reset timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limits_ip_address_idx ON public.rate_limits (ip_address, last_reset DESC);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- google_reviews: dashboard-created on production (filled by the sync-reviews
-- cron) and read by the homepage Hero and Testimonials. Columns per
-- src/integrations/supabase/types.ts. Without it a replay renders the homepage
-- without testimonials and two hero specs fail for an environmental reason.
CREATE TABLE IF NOT EXISTS public.google_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id text NOT NULL UNIQUE,
  reviewer_name text,
  reviewer_photo_url text,
  star_rating integer,
  comment text,
  review_reply text,
  create_time timestamptz,
  update_time timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.google_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read google reviews" ON public.google_reviews;
CREATE POLICY "Public can read google reviews" ON public.google_reviews FOR SELECT USING (true);

-- leads: production-only shape (dashboard-created; see the leadSanitize.ts
-- docblock for the constraints verified against production). The baseline
-- stub has an id only, so a replay refuses every lead insert and the whole
-- form pipeline is untestable off production. Every column is guarded.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS inquiry_type text NOT NULL DEFAULT 'contact';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS zip_code text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS project_type text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS project_timeline text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS budget_range text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS current_project_status text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS preferred_contact_method text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS square_footage integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_inquiry_type_check') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_inquiry_type_check
      CHECK (inquiry_type IN ('estimate', 'contact', 'exit_intent'));
  END IF;
END $$;
-- contact_time_preference and its CHECK arrive with the column in
-- 20260723000000_add_contact_availability; adding the constraint here would
-- reference a column that does not exist yet on a from-scratch replay.
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);
