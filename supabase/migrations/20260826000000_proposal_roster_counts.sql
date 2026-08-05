-- Proposal Pod - Slice 2 follow-ups: a bounded roster aggregate, and the upper
-- bound the bundle shape CHECK was missing.
--
-- 20260825000000 has landed in a database, so per the standing rule from
-- 20260824000000 it is frozen and these two changes live here instead.
--
-- 1. proposal_roster_counts. The admin roster needs, per proposal, its line
--    count, its submission count, and the total of its most recent submission.
--    Computing those in the API meant selecting EVERY proposal_lines row and
--    EVERY proposal_submissions row for the listed proposals and counting them
--    in JS - two reads with no bound, against a PostgREST that caps rows per
--    response (max-rows, 1000 by default). Past that cap the counts silently
--    came back short or zero, and a wrong count on the roster reads to an admin
--    as data loss. Aggregating here returns exactly one row per proposal asked
--    for, so the response is bounded by the roster's own page size and the
--    counts are right at any estate size.
--
-- 2. proposal_lines_bundle_member_cap. The shape CHECK bounded bundle_members
--    below (>= 2, a bundle needs members) but not above, so a single row could
--    carry an unbounded members array. A bundle is composed FROM imported CSV
--    lines and the parser refuses a file over MAX_LINES (200), so 200 is the
--    most members a legitimate bundle can ever have. Same bound in the zod
--    schema; this is the layer that holds when a writer skips it.
--
-- 3. The two privilege repairs 20260825000000 cannot make itself, being frozen:
--    an explicit service_role grant on proposal_bundle_total, and an empty
--    search_path on it. Both are 20260824000000's documented posture, and both
--    apply to the new function here for the same reasons.
--
-- Once this file has landed in any database it is frozen too; further schema
-- changes go in a new migration.

CREATE FUNCTION public.proposal_roster_counts(proposal_ids UUID[])
RETURNS TABLE (
  proposal_id        UUID,
  line_count         BIGINT,
  submission_count   BIGINT,
  latest_total_cents BIGINT
)
LANGUAGE SQL
STABLE
-- Pinned empty, like every function in 20260824000000: every table this body
-- reads is schema-qualified and everything else it calls is pg_catalog's own,
-- so no schema placed in front of public can change what the roster counts.
SET search_path = ''
AS $$
  SELECT
    p.id,
    (SELECT COUNT(*) FROM public.proposal_lines l WHERE l.proposal_id = p.id),
    (SELECT COUNT(*) FROM public.proposal_submissions s WHERE s.proposal_id = p.id),
    -- The latest submission's total, or NULL when there are none: the roster
    -- distinguishes "no submission yet" from "submitted $0".
    (SELECT s.total_cents
       FROM public.proposal_submissions s
      WHERE s.proposal_id = p.id
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT 1)
  FROM public.proposals p
  WHERE p.id = ANY(proposal_ids)
$$;

-- Admin-only, like every other helper in this pod: Supabase's default grants
-- would otherwise publish this as an anon RPC that reports how many proposals
-- and submissions exist.
--
-- service_role is then granted back EXPLICITLY, per 20260824000000's stated
-- rule for proposal_snapshot_total. Relying on the bootstrap ALTER DEFAULT
-- PRIVILEGES to have covered it is relying on a grant that a self-hosted stack,
-- a restored database, or a migration applied by a role other than postgres may
-- never have made - and there the REVOKE above takes away the last path in.
REVOKE EXECUTE ON FUNCTION public.proposal_roster_counts(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_roster_counts(UUID[]) TO service_role;

-- The same grant proposal_bundle_total was missing. It is the harder case of
-- the two: Postgres checks EXECUTE at INSERT time for a function a CHECK calls,
-- and proposal_lines_bundle_sum calls this one, so without an explicit grant a
-- service_role that never inherited the default privilege cannot write a
-- bundled line at all. And its search_path is pinned for the reason
-- 20260824000000 gives: a constraint must not be able to mean something else
-- because of a schema placed in front of public.
GRANT EXECUTE ON FUNCTION public.proposal_bundle_total(JSONB) TO service_role;
ALTER FUNCTION public.proposal_bundle_total(JSONB) SET search_path = '';

ALTER TABLE public.proposal_lines
  ADD CONSTRAINT proposal_lines_bundle_member_cap CHECK (
    bundle_members IS NULL
    OR jsonb_array_length(bundle_members) <= 200
  );
