-- Lead scoring and routing (WEB-019, WEB-01A, WEB-01B).
--
-- Hand-apply in the Supabase SQL editor. Idempotent.
--
-- Additive only. `score` and `tier` are NOT touched: they are written at
-- form-submit time from what little is known then, live data depends on their
-- meaning, and the routing problem is solved by not asking them to route.

-- ---------------------------------------------------------------------------
-- The routing decision, recorded rather than just made. WEB-01A's acceptance
-- criterion is that the decision AND its recipient are logged on the lead.
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS intake_score   integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS intake_bucket  text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS intake_signals text[];
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS routed_to      text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS routed_at      timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS routing_reason text;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_intake_bucket_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_intake_bucket_check
  CHECK (intake_bucket IS NULL OR intake_bucket IN ('hot', 'cold'));

COMMENT ON COLUMN public.leads.intake_bucket IS
  'Two-valued because routing is a two-way decision. The three-valued `tier` column is unrelated and keeps its submit-time meaning.';
COMMENT ON COLUMN public.leads.intake_signals IS
  'The contributing signals in plain words, so a routing decision can be reviewed rather than reconstructed.';

-- Finding the leads that were routed one way or the other, for the admin view.
CREATE INDEX IF NOT EXISTS leads_intake_bucket_idx
  ON public.leads (intake_bucket, routed_at DESC)
  WHERE intake_bucket IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Chase stamps on the session.
--
-- Separate columns rather than one, because "never opened it" and "started and
-- stopped" are different states needing different messages, and a lead can only
-- ever be in one of them. Both exist so an alert fires ONCE - a cron that
-- re-alerts every run is worse than one that never fires, because the owner
-- learns to ignore it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.lead_intake_sessions
  ADD COLUMN IF NOT EXISTS low_intent_alert_at timestamptz;
ALTER TABLE public.lead_intake_sessions
  ADD COLUMN IF NOT EXISTS abandoned_alert_at  timestamptz;

-- The two candidate queries, indexed. Partial, because the rows that still need
-- chasing are a small and shrinking fraction of the table.
CREATE INDEX IF NOT EXISTS lead_intake_sessions_needs_low_intent_idx
  ON public.lead_intake_sessions (created_at)
  WHERE opened_at IS NULL AND low_intent_alert_at IS NULL;

CREATE INDEX IF NOT EXISTS lead_intake_sessions_needs_abandoned_idx
  ON public.lead_intake_sessions (opened_at)
  WHERE opened_at IS NOT NULL
    AND completed_at IS NULL
    AND declined_at IS NULL
    AND abandoned_alert_at IS NULL;
