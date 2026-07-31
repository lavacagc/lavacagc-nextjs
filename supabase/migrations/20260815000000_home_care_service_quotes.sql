-- La Vaca Home Care - service quotes, scheduling and completion attribution.
--
-- Adds the storage behind the service-quote loop: quote -> schedule -> remind
-- -> complete -> history. Everything here is additive and idempotent; no
-- existing column changes type or nullability.
--
-- Deliberately NOT changed: estimate_emails.estimate_url stays NOT NULL. The
-- owner chose to keep QuickBooks in the loop for service quotes, so every quote
-- still carries a real QBO estimate and the constraint is never violated.

-- ─── homeowners: a postal address we can put on a calendar invite ────────────
-- Only `zip` was stored. Scheduling needs a street address for the .ics
-- LOCATION, and having city back also restores the town personalization the
-- newsletter design wanted ("your home in West Orange").
ALTER TABLE public.homeowners ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.homeowners ADD COLUMN IF NOT EXISTS city    TEXT;

-- ─── homeowner_maintenance: when we're going, and who actually did it ────────
ALTER TABLE public.homeowner_maintenance ADD COLUMN IF NOT EXISTS scheduled_start  TIMESTAMPTZ;
ALTER TABLE public.homeowner_maintenance ADD COLUMN IF NOT EXISTS scheduled_end    TIMESTAMPTZ;
ALTER TABLE public.homeowner_maintenance ADD COLUMN IF NOT EXISTS service_address  TEXT;

-- Who completed the task. A homeowner ticking "cleaned my own gutters" and La
-- Vaca doing it as paid work previously wrote identical rows, so the portal
-- could not label the work we performed. Existing rows default to 'homeowner',
-- which is correct: nothing has ever been marked complete by La Vaca.
ALTER TABLE public.homeowner_maintenance
  ADD COLUMN IF NOT EXISTS completed_by TEXT NOT NULL DEFAULT 'homeowner';

ALTER TABLE public.homeowner_maintenance
  DROP CONSTRAINT IF EXISTS homeowner_maintenance_completed_by_check;
ALTER TABLE public.homeowner_maintenance
  ADD CONSTRAINT homeowner_maintenance_completed_by_check
  CHECK (completed_by IN ('homeowner', 'lavaca'));

-- The reminder cron asks "which visits are tomorrow", so the scheduled window
-- is the hot path.
CREATE INDEX IF NOT EXISTS idx_homeowner_maint_scheduled
  ON public.homeowner_maintenance (scheduled_start)
  WHERE scheduled_start IS NOT NULL;

-- ─── estimate_emails: tell service quotes apart from project estimates ───────
ALTER TABLE public.estimate_emails
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'project';

ALTER TABLE public.estimate_emails DROP CONSTRAINT IF EXISTS estimate_emails_kind_check;
ALTER TABLE public.estimate_emails
  ADD CONSTRAINT estimate_emails_kind_check CHECK (kind IN ('project', 'service'));

-- Service-quote specific fields. Null on every project row.
ALTER TABLE public.estimate_emails ADD COLUMN IF NOT EXISTS scope_summary TEXT;
ALTER TABLE public.estimate_emails ADD COLUMN IF NOT EXISTS visit_length  TEXT;
ALTER TABLE public.estimate_emails ADD COLUMN IF NOT EXISTS valid_until   DATE;

CREATE INDEX IF NOT EXISTS idx_estimate_emails_kind ON public.estimate_emails (kind);
