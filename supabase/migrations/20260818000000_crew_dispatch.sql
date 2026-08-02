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

-- How many calendar messages this visit has issued (RFC 5545 SEQUENCE). A
-- client applies a re-send to the event it already holds only when the number
-- is HIGHER than the one it stored - equal, it may treat the message as a
-- duplicate and ignore it. So both a re-dispatch and the METHOD:CANCEL that
-- retracts a cancelled visit have to count up from here, or the crew keeps an
-- event (and its 7:00am "text the customer" alarm) for a job that is off.
ALTER TABLE public.visit_dispatch
  ADD COLUMN IF NOT EXISTS ics_sequence INTEGER NOT NULL DEFAULT 0;

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

-- 'retired' is somebody taken OFF the visit: un-ticked on the dispatch picker
-- and the window re-dispatched to whoever is actually going. The row stays as
-- the record they were once sent it, but it counts for nothing - their confirm
-- token stops working, and the escalation neither waits on them nor accepts
-- their answer. Without it the row survives with a live token, and a tap from
-- somebody who is not on the visit satisfies "somebody confirmed" and silences
-- the 5pm and 6pm chases for a visit nobody going has answered.
--
-- Widening a CHECK is safe to re-run against the live table: every existing row
-- already satisfies the larger set.
ALTER TABLE public.visit_dispatch_recipients
  DROP CONSTRAINT IF EXISTS visit_dispatch_recipients_status_check;
ALTER TABLE public.visit_dispatch_recipients
  ADD CONSTRAINT visit_dispatch_recipients_status_check
  CHECK (status IN ('sent', 'confirmed', 'flagged', 'retired'));

-- WHEN THE OFFICE WAS ACTUALLY TOLD about the flag this row currently carries.
-- Stamped only when the Telegram genuinely returned 'sent', and cleared
-- whenever a fresh alert is about to be attempted, so it records a DELIVERY
-- rather than an attempt.
--
-- The repeat-tap guard keys off this. Without it the guard suppressed the alert
-- on a same-note re-tap whether or not the first one ever landed - so a crew
-- member whose phone lost the first response, tapping again at the house, was
-- told "the office has it" when Telegram had been down and nobody had been told
-- anything. It also lets the confirm page say, on a later re-open, which of
-- those two happened.
ALTER TABLE public.visit_dispatch_recipients
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_dispatch_recipients_token
  ON public.visit_dispatch_recipients (confirm_token);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visit_dispatch_recipients_pair
  ON public.visit_dispatch_recipients (dispatch_id, recipient_id);

-- ─── RLS (service-role only; no public access) ───────────────────────────────
-- Supabase's bootstrap GRANTs anon and authenticated full privileges on every
-- table in `public`, so RLS with no policy is the only thing that closes these.
-- It matters most for visit_dispatch_recipients: it holds every live
-- confirm_token, and the publishable key ships to the browser - without this,
-- anyone could read the tokens, confirm every visit, and silence the escalation
-- that exists to catch exactly that. The routes reach these tables through
-- SUPABASE_SECRET_KEY, which bypasses RLS, so nothing legitimate needs a policy.
ALTER TABLE public.dispatch_recipients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_dispatch            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_dispatch_recipients ENABLE ROW LEVEL SECURITY;
