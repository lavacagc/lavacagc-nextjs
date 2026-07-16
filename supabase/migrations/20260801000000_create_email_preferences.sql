-- Email preference center (Phase 3).
--
-- A lightweight, per-email subscription model that unifies the two existing
-- audiences (homeowners = Home Care, newsletter_subscribers = Buy+Remodel) plus
-- the announcement/broadcast stream under ONE token-addressable row the
-- recipient can self-manage at /preferences?token=…
--
-- Design (owner chose the lightweight model over a unified contacts refactor):
--   - Keyed by lowercased email so it works for ANY contact, including people who
--     are only on the broadcast list and in neither identity table.
--   - Per-stream booleans. Transactional mail (verification, estimates, booking
--     confirmations, lead follow-ups) is NOT represented here — it always sends.
--   - The preference center writes here AND syncs the legacy status columns
--     (homeowners.status / newsletter_subscribers.status) so nothing else breaks.
--   - preference_events is the "track everything down" audit trail.

CREATE TABLE IF NOT EXISTS public.email_preferences (
  email TEXT PRIMARY KEY,                       -- always stored lowercased+trimmed
  preference_token TEXT NOT NULL UNIQUE,        -- stable capability token for the self-serve link

  -- Marketing streams. TRUE = subscribed. Transactional is implicit + always-on.
  home_care     BOOLEAN NOT NULL DEFAULT TRUE,  -- monthly seasonal Home Care newsletter
  buy_remodel   BOOLEAN NOT NULL DEFAULT TRUE,  -- Buy + Remodel new-listing alerts
  announcements BOOLEAN NOT NULL DEFAULT TRUE,  -- one-off broadcasts / promos

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_preferences_token
  ON public.email_preferences (preference_token);

-- Every change to a stream, by whom, from where. Powers the audit view and lets
-- us prove consent history (self vs admin vs webhook-driven suppression).
CREATE TABLE IF NOT EXISTS public.preference_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  stream      TEXT NOT NULL,                    -- home_care | buy_remodel | announcements
  old_value   BOOLEAN,
  new_value   BOOLEAN NOT NULL,
  actor       TEXT NOT NULL DEFAULT 'self',     -- self | self_unverified | admin | webhook | system
  actor_detail TEXT,                            -- admin email, webhook event, etc.
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preference_events_email
  ON public.preference_events (email, created_at DESC);

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preference_events ENABLE ROW LEVEL SECURITY;

-- No public policies. All access is server-side via SUPABASE_SECRET_KEY (the
-- /api/preferences routes authenticate the user by their preference_token, not
-- by RLS). Anon clients see nothing.
