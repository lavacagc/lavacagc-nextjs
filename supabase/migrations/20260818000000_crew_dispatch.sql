-- La Vaca Home Care - crew dispatch.
--
-- Scheduling a visit already tells the CUSTOMER (the 7:30pm reminder) and the
-- OWNER (two alarms on the .ics). It has never told the people doing the work.
-- This is the missing half: who is going, whether they confirmed the sub, and
-- an escalation when nobody does.
--
-- Deliberately NOT a crew/HR model. `dispatch_recipients` is names and email
-- addresses - no roles, no permissions, no login. It exists so the admin can
-- pick who a visit goes to; anything more can be added when it earns its place.
--
-- Must be hand-applied, same as every migration in this repo. Idempotent.

-- ─── who a dispatch can go to ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dispatch_recipients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lower-cased so "Alex@" and "alex@" can never become two recipients who both
-- receive every dispatch. The app normalizes on write; this makes it true
-- regardless of who writes next.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_recipients_email
  ON public.dispatch_recipients (lower(email));

-- Seeded with the two addresses that are ALREADY the service reply-to
-- (SERVICE_REPLY_TO in src/lib/homecare/serviceEmails.ts). Same people, one
-- source of truth - not a second list to drift out of sync with the first.
INSERT INTO public.dispatch_recipients (name, email)
VALUES ('Alex', 'alex@lavacagc.com'), ('Veronica', 'veronica@lavacagc.com')
ON CONFLICT DO NOTHING;

-- ─── one dispatch per visit ──────────────────────────────────────────────────
-- A visit is (homeowner, scheduled_start) - the same key the reminder ledger
-- and the portal card use. There is no visits table to reference: a visit is
-- the set of homeowner_maintenance rows sharing that window, so this table
-- names the window rather than pointing at a row that is one task of several.
CREATE TABLE IF NOT EXISTS public.visit_dispatch (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id  UUID NOT NULL REFERENCES public.homeowners(id) ON DELETE CASCADE,
  visit_start   TIMESTAMPTZ NOT NULL,
  -- Free text by design (owner decision): the sub is named in the dispatch so
  -- the crew knows who to call. A subcontractors table can come later if it
  -- earns one.
  sub_name      TEXT,
  dispatched_at TIMESTAMPTZ,
  -- The 5pm and 6pm escalation stages, each stamped once. These are the
  -- send-once ledger: a cron retry finds them already set and sends nothing.
  nudged_at     TIMESTAMPTZ,
  escalated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_dispatch_visit
  ON public.visit_dispatch (homeowner_id, visit_start);

-- The escalation cron asks "which visits are tomorrow and unconfirmed", so the
-- window is the hot path - exactly as it is for the reminder cron.
CREATE INDEX IF NOT EXISTS idx_visit_dispatch_start
  ON public.visit_dispatch (visit_start);

-- ─── who it went to, and what they said ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_dispatch_recipients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id   UUID NOT NULL REFERENCES public.visit_dispatch(id) ON DELETE CASCADE,
  recipient_id  UUID NOT NULL REFERENCES public.dispatch_recipients(id) ON DELETE CASCADE,
  -- The email address and name AS SENT. Denormalized on purpose: this is the
  -- record of what actually happened, and it must not silently rewrite itself
  -- when someone edits or deactivates the recipient months later.
  email         TEXT NOT NULL,
  name          TEXT,
  -- Random, per (dispatch, recipient), so a confirm link names exactly one
  -- person on exactly one visit and cannot be reused for another.
  confirm_token TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'sent',
  confirmed_at  TIMESTAMPTZ,
  -- What they typed into "Something is wrong".
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.visit_dispatch_recipients
  DROP CONSTRAINT IF EXISTS visit_dispatch_recipients_status_check;
ALTER TABLE public.visit_dispatch_recipients
  ADD CONSTRAINT visit_dispatch_recipients_status_check
  CHECK (status IN ('sent', 'confirmed', 'flagged'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_dispatch_recipients_token
  ON public.visit_dispatch_recipients (confirm_token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_dispatch_recipients_pair
  ON public.visit_dispatch_recipients (dispatch_id, recipient_id);
