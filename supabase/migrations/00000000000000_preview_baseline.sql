-- Preview baseline: stub tables that exist only in the live database.
--
-- A handful of tables (blog_posts, leads, estimate_leads, service_areas) were
-- created directly in the Supabase dashboard rather than through a migration, so
-- they live in production but were never expressed as SQL here. Later migrations
-- ALTER / index / reference them with `IF NOT EXISTS` guards, which is fine
-- against production -- but a fresh Supabase *preview* branch replays
-- supabase/migrations/ from an empty database, where those tables don't exist
-- yet, so the migrations that touch them abort the whole replay.
--
-- Creating stubs here (sorted first via the all-zero timestamp) lets the replay
-- succeed. Every later `ADD COLUMN IF NOT EXISTS` fills in the rest of each
-- table; we only need to pre-create the table plus the few columns that later
-- migrations *reference* but never *add*:
--   * blog_posts.published        -> partial-index predicate in
--                                    20251222155716_add_scheduled_publish_at
--   * service_areas.{name,active,has_page,sort_order,description}
--                                 -> column list of the seed INSERT in
--                                    20260717000000_seed_missing_service_areas
--     (slug is added UNIQUE by 20260217100000, so ON CONFLICT (slug) resolves).
-- leads/estimate_leads only ever have columns ADD COLUMN'd, so a bare id is enough.
--
-- On production every statement is a no-op: CREATE TABLE IF NOT EXISTS skips the
-- existing table (its column list is ignored), and the table already has these
-- columns. gen_random_uuid() is built into Postgres 13+, so no extension needed.

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  published BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS public.estimate_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS public.service_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  active BOOLEAN DEFAULT true,
  has_page BOOLEAN DEFAULT true,
  sort_order INTEGER,
  description TEXT
);

-- follow_up_queue is referenced (its follow_up_type CHECK is widened) by
-- 20260219000000_add_feedback_follow_up_types BEFORE it is formally created
-- (with IF NOT EXISTS) in 20260716000000_create_chatbot_followup_tables. On prod
-- the table predates both, so the order never mattered; a from-scratch preview
-- replay hits the Feb ALTER first and fails. Create the full table here (schema
-- copied verbatim from the 20260716 migration, after leads/estimate_leads for
-- the FKs) so the Feb ALTER applies and the later CREATE IF NOT EXISTS no-ops.
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
