-- Lead intake chat (WEB-010..018).
--
-- Hand-apply in the Supabase SQL editor. Idempotent, so re-running is safe and
-- is in fact the expected workflow: this file accumulates DDL across review
-- rounds, and a column added late has broken a whole feature before.

-- ---------------------------------------------------------------------------
-- Structured answers the intake flow captures that no existing form does.
-- Everything else it collects (message, city, project_timeline, address,
-- contact_time_preference) already has a column and is filled, not duplicated.
--
-- budget_range is deliberately NOT reused for price_reaction: it holds real
-- ranges written by the calculator and the forms, and the owner alert renders
-- it, so 'about_expected' in that column would make those emails read as
-- nonsense.
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS scope_tier         text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS scope_detail       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS finish_level       text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS price_anchor_shown integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS price_reaction     text;

COMMENT ON COLUMN public.leads.price_anchor_shown IS
  'The starting price in dollars the lead was actually shown, so a later dispute can be checked rather than guessed at. NULL when the project type has no honest anchor.';

-- ---------------------------------------------------------------------------
-- One session per lead, reachable only by its token.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_intake_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  token        text NOT NULL,
  first_name   text,
  project_type text,
  status       text NOT NULL DEFAULT 'pending',
  current_step text NOT NULL DEFAULT 'consent',
  answers      jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at    timestamptz,
  completed_at timestamptz,
  declined_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_intake_sessions
  DROP CONSTRAINT IF EXISTS lead_intake_sessions_status_check;
ALTER TABLE public.lead_intake_sessions
  ADD CONSTRAINT lead_intake_sessions_status_check
  CHECK (status IN ('pending', 'active', 'completed', 'declined'));

CREATE UNIQUE INDEX IF NOT EXISTS lead_intake_sessions_token_key
  ON public.lead_intake_sessions (token);
CREATE INDEX IF NOT EXISTS lead_intake_sessions_lead_idx
  ON public.lead_intake_sessions (lead_id);

-- WEB-01B, the low-intent path, reads exactly this: a session created a while
-- ago that was never opened.
CREATE INDEX IF NOT EXISTS lead_intake_sessions_unopened_idx
  ON public.lead_intake_sessions (created_at)
  WHERE opened_at IS NULL;

-- ---------------------------------------------------------------------------
-- Off-script questions (WEB-017). Stored so a routing failure is recoverable:
-- the row exists even when the Telegram or email dispatch fails.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_intake_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.lead_intake_sessions(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'off_script',
  step       text,
  body       text,
  routed_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_intake_events_session_idx
  ON public.lead_intake_events (session_id, created_at);
-- An off-script question nobody was told about is the failure worth finding.
CREATE INDEX IF NOT EXISTS lead_intake_events_unrouted_idx
  ON public.lead_intake_events (created_at)
  WHERE routed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Photos (WEB-014).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_intake_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES public.lead_intake_sessions(id) ON DELETE CASCADE,
  lead_id      uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_intake_photos_session_idx
  ON public.lead_intake_photos (session_id);

-- ---------------------------------------------------------------------------
-- Service-role only, no public access. The publishable key ships inside the
-- browser bundle, so without this every intake token in the table would be
-- readable by anyone who opened devtools.
-- ---------------------------------------------------------------------------
ALTER TABLE public.lead_intake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intake_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intake_photos   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Storage bucket for intake photos. Public-read like warranty-images, because
-- the owner alert email has to be able to show them.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('intake-photos', 'intake-photos', true)
ON CONFLICT (id) DO NOTHING;
