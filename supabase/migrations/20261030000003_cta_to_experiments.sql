-- Phase 2 slice H (decision 005): the Phase 1 hero CTA buttons become
-- experiments, plus the few columns the experiments funnel needs.
-- docs/phase-2/acceptance-criteria.md, "Experiments (slice H, decision 005)".
--
-- Guarded and re-runnable: every statement is IF NOT EXISTS, ON CONFLICT DO
-- NOTHING or CREATE OR REPLACE, and the data copy is skipped when the Phase 1
-- tables are absent. Running it twice changes nothing the second time, and
-- running it again after the deploy picks up any cta_events the old code wrote
-- in between.
--
-- cta_variants and cta_events are KEPT, read-only from now on: the admin
-- Experiments tab shows them as Phase 1 history. Nothing writes them after
-- this slice.

-- 1. Columns ---------------------------------------------------------------

-- The expected effect, written before an experiment starts (skill rule).
ALTER TABLE public.experiments ADD COLUMN IF NOT EXISTS expected_effect text;

-- The signed visitor id (cta_vid) a request was sent with, so the admin
-- status changes can record quote_accepted and job_paid for the variants that
-- visitor saw. Null for requests sent before this slice or without the cookie.
ALTER TABLE public.home_service_requests ADD COLUMN IF NOT EXISTS visitor_id uuid;
-- When Alex marked the job paid (the job_paid funnel step and its revenue).
ALTER TABLE public.home_service_requests ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Downstream events look a visitor's earlier events up by visitor id.
CREATE INDEX IF NOT EXISTS experiment_events_visitor_idx ON public.experiment_events (visitor_id, event);

-- updated_at maintenance (the admin and agent writes use it for optimistic
-- concurrency on the variants column).
DROP TRIGGER IF EXISTS set_updated_at ON public.experiments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.experiments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. One running experiment per page, with the Phase 1 pair grandfathered ---
-- The two homepage buttons were tested side by side in Phase 1 (their hashes
-- are independent, tests/cta-tests.spec.ts), so both migrate as running on
-- '/'. The database keeps enforcing the rule for every other experiment; the
-- create and start routes enforce it for all of them, the pair included.
DROP INDEX IF EXISTS public.experiments_one_running_per_page;
CREATE UNIQUE INDEX experiments_one_running_per_page
  ON public.experiments (page)
  WHERE status IN ('running', 'pending_promotion') AND key NOT IN ('hero-primary', 'hero-secondary');

-- 3. The Phase 1 buttons as experiments, with their history ------------------
DO $$
BEGIN
  IF to_regclass('public.cta_variants') IS NULL THEN
    RAISE NOTICE 'cta_variants absent: no Phase 1 buttons to migrate';
    RETURN;
  END IF;

  INSERT INTO public.experiments
    (key, page, element, hypothesis, expected_effect, variants, control_key, status,
     primary_metric, min_visitors, min_days, started_at, created_by, decision)
  SELECT
    'hero-' || b.button,
    '/',
    'hero-' || b.button,
    CASE b.button
      WHEN 'primary' THEN 'The wording of the homepage primary button changes how many visitors go on to send a request (Phase 1 CTA test).'
      ELSE 'The wording of the homepage secondary button changes how many visitors go on to send a request (Phase 1 CTA test).'
    END,
    'Migrated from the Phase 1 CTA test; no effect size was written then.',
    (SELECT jsonb_agg(
              jsonb_build_object(
                'key', v.variant_key,
                'label', v.wording,
                'active', v.active,
                'payload', jsonb_strip_nulls(jsonb_build_object(
                  'wording', jsonb_build_object('en', v.wording),
                  'subtext', CASE WHEN v.subtext IS NULL OR btrim(v.subtext) = '' THEN NULL ELSE jsonb_build_object('en', btrim(v.subtext)) END,
                  -- Only hex colours carry over: a payload colour is a hex value.
                  'color', CASE WHEN v.color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$' THEN v.color END
                ))
              ) ORDER BY v.variant_key)
       FROM public.cta_variants v WHERE v.button = b.button),
    (SELECT min(v.variant_key) FROM public.cta_variants v WHERE v.button = b.button),
    'running',
    'request_submitted',
    200,
    14,
    (SELECT min(v.created_at) FROM public.cta_variants v WHERE v.button = b.button),
    'phase1-cta',
    jsonb_build_object('migrated_from', 'cta_variants', 'migrated_at', now())
  FROM (VALUES ('primary'), ('secondary')) AS b(button)
  WHERE EXISTS (SELECT 1 FROM public.cta_variants v WHERE v.button = b.button)
  ON CONFLICT (key) DO NOTHING;

  IF to_regclass('public.cta_events') IS NOT NULL THEN
    -- Views and clicks under a server-minted visitor id (a uuid) carry over
    -- one-for-one; the unique index keeps a re-run from double counting.
    -- Anything else in visitor_id (pre-signing test ids) stays history only.
    INSERT INTO public.experiment_events (experiment_key, variant_key, visitor_id, event, created_at)
    SELECT 'hero-' || e.button, e.variant_key, e.visitor_id::uuid, e.event_type, e.created_at
    FROM public.cta_events e
    WHERE e.visitor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND EXISTS (SELECT 1 FROM public.experiments x WHERE x.key = 'hero-' || e.button)
    ON CONFLICT (experiment_key, variant_key, visitor_id, event) DO NOTHING;
  END IF;
END $$;

-- 4. The funnel in one grouped read --------------------------------------
-- One row per (experiment, variant, event): the count is distinct visitors
-- (the unique index allows one row per visitor), the sum is revenue. Bounded
-- by experiments x 7 variants x 6 events, whatever the event table holds.
CREATE OR REPLACE FUNCTION public.experiment_funnel(p_keys text[])
RETURNS TABLE (experiment_key text, variant_key text, event text, visitors bigint, value_cents bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT e.experiment_key, e.variant_key, e.event, count(*)::bigint, coalesce(sum(e.value_cents), 0)::bigint
  FROM public.experiment_events e
  WHERE e.experiment_key = ANY (p_keys)
  GROUP BY e.experiment_key, e.variant_key, e.event
$$;
REVOKE ALL ON FUNCTION public.experiment_funnel(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.experiment_funnel(text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.experiment_funnel(text[]) TO service_role;
