-- Preview baseline: stub tables that exist only in the live database.
--
-- A handful of tables (blog_posts, leads, estimate_leads, service_areas) were
-- created directly in the Supabase dashboard rather than through a migration, so
-- they live in production but were never expressed as SQL here. Later migrations
-- ALTER / index / reference them with `IF NOT EXISTS` guards, which is fine
-- against production -- but a fresh Supabase *preview* branch replays
-- supabase/migrations/ from an empty database, where those tables don't exist
-- yet, so the very first ALTER (20251222155716_add_scheduled_publish_at.sql)
-- aborts the whole replay.
--
-- Creating bare stubs here (sorted first via the all-zero timestamp) lets the
-- replay succeed: every downstream `ADD COLUMN IF NOT EXISTS` fills in the real
-- columns, and every `CREATE INDEX` / foreign-key reference then resolves. On
-- production these statements are a no-op because the tables already exist
-- (CREATE TABLE IF NOT EXISTS). gen_random_uuid() is built into Postgres 13+,
-- so no extension is required.

CREATE TABLE IF NOT EXISTS public.blog_posts (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.estimate_leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS public.service_areas (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
