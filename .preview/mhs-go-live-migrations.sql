-- La Vaca Home Care - "My Home Systems" captured home facts (Slice 1: schema).
--
-- A homeowner can save durable facts they discover while doing checklist tasks
-- (where the water main shut-off is, the HVAC filter size, and so on) so they
-- never re-learn them and La Vaca can act faster on a job or in an emergency.
--
-- These are SENSITIVE home-security details. Two deliberate design choices:
--  1. This is a NEW dedicated table, NOT home_profiles.systems. That column runs
--     a hard whitelist sanitizer (free-text would be silently dropped) and is
--     read by the marketing newsletter cron (sensitive data must never flow
--     there).
--  2. Deny-by-default: RLS is ENABLED with NO policies, so the anon/publishable
--     key can neither read nor write. All app access goes through the
--     service-role key (which bypasses RLS); the real gate is application code
--     on every route (homeowner cookie + active-status check, or a staff role).
--     Do NOT add a permissive anon SELECT policy (contrast the leads table,
--     whose anon read policy makes every row world-readable) - that would expose
--     shut-off maps through the public REST API.
--
-- Photos and the staff access-audit log are separate concerns and ship in their
-- own later slices; this migration adds only the core record table.

CREATE TABLE IF NOT EXISTS public.home_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id    UUID NOT NULL REFERENCES public.homeowners(id) ON DELETE CASCADE,
  fact_key        TEXT NOT NULL,        -- canonical slug from src/lib/homecare/records.ts (NOT the task key)
  note            TEXT,                 -- free-text location ("Basement, under the front stairs")
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- structured appliance fields, validated on write
  source_task_key TEXT,                 -- which task/guide prompted it, for provenance (plain TEXT, no FK)
  updated_by      TEXT NOT NULL DEFAULT 'homeowner' CHECK (updated_by IN ('homeowner','staff')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One canonical record per fact per homeowner; re-saving upserts on this key.
  CONSTRAINT home_records_unique UNIQUE (homeowner_id, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_home_records_owner ON public.home_records (homeowner_id);

-- Deny-by-default. Enable RLS and add NO policies: the service-role key bypasses
-- RLS for legitimate server access, and the anon key gets nothing.
ALTER TABLE public.home_records ENABLE ROW LEVEL SECURITY;
-- La Vaca Home Care - "My Home Systems" staff access-audit log (Slice 6).
--
-- Every time a staff member opens a homeowner's saved home facts in the
-- /vaca-mgmt Home Record view, one row lands here BEFORE any sensitive value is
-- returned ("no log, no look" - the route fails closed if this insert fails).
-- Shut-off locations and panel maps are home-security data, so the promise made
-- in the My Home Systems plan is that staff access is role-gated AND audited:
-- who viewed whose record, which fact categories, when, from where.
--
-- We log fact KEYS (categories), never the values - the log must not become a
-- second copy of the sensitive data.
--
-- This log deliberately SURVIVES an ordinary leave (owner decision 2026-07-16):
-- it is accountability data about STAFF, so a badly-timed unsubscribe must not
-- erase evidence of who looked at a record. The Slice 8 retention purge deletes
-- home_records only and never touches this table.
--
-- ON DELETE CASCADE therefore fires only on a true homeowners-row deletion
-- (e.g. a CCPA erasure request), where the homeowner ceases to exist for us and
-- everything referencing them goes with it. Mirrors the estimate_emails
-- audit-table pattern otherwise.

CREATE TABLE IF NOT EXISTS public.home_record_access_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id UUID NOT NULL REFERENCES public.homeowners(id) ON DELETE CASCADE,
  staff_email  TEXT NOT NULL,                       -- acting admin's session email (allowlisted)
  fact_keys    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- canonical fact keys visible at view time (keys only, never values)
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_record_access_owner
  ON public.home_record_access_log (homeowner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_home_record_access_created
  ON public.home_record_access_log (created_at DESC);

-- Deny-by-default, same as home_records: RLS ENABLED with NO policies. Only the
-- service-role key (which bypasses RLS) can write or read; the app route is the
-- gate. Never add an anon policy here.
ALTER TABLE public.home_record_access_log ENABLE ROW LEVEL SECURITY;
