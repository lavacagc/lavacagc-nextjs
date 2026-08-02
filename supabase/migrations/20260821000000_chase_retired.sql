-- A retired chase, recorded as itself (WEB-01B).
--
-- Hand-apply in the Supabase SQL editor. Idempotent.
--
-- A candidate past the 72-hour ceiling is claimed and deliberately never sent,
-- and the claim is what retires it. Written only into `*_alert_at`, the row
-- then permanently asserts that a lead nobody was told about WAS alerted about
-- - so a later audit of who was contacted reads it as a lie. These columns are
-- written in the same PATCH as the claim, so the retirement stays atomic and
-- the durable trace says what actually happened.
--
-- Per stage rather than one column, for the same reason the alert stamps are:
-- a session retired at `low_intent` can later be opened and go quiet, and be
-- retired again by `abandoned`. One column would lose the first.

ALTER TABLE public.lead_intake_sessions
  ADD COLUMN IF NOT EXISTS low_intent_retired_at timestamptz;
ALTER TABLE public.lead_intake_sessions
  ADD COLUMN IF NOT EXISTS abandoned_retired_at  timestamptz;

COMMENT ON COLUMN public.lead_intake_sessions.low_intent_retired_at IS
  'Set with low_intent_alert_at when the session aged past the chase ceiling: the stamp closed the chase, and nothing was sent.';
COMMENT ON COLUMN public.lead_intake_sessions.abandoned_retired_at IS
  'Set with abandoned_alert_at when the session aged past the chase ceiling: the stamp closed the chase, and nothing was sent.';
