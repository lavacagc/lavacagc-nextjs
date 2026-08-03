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
-- ON DELETE CASCADE is deliberate: retention for this program is "delete when
-- the homeowner leaves" (Slice 8 purge), and that includes rows that reference
-- them. Mirrors the estimate_emails audit-table pattern otherwise.

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
