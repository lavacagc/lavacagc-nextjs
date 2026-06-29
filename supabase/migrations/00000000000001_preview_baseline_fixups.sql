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
