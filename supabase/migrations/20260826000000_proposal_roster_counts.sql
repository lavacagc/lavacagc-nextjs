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
-- and submissions exist. The service key the API uses keeps its EXECUTE.
REVOKE EXECUTE ON FUNCTION public.proposal_roster_counts(UUID[]) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.proposal_lines
  ADD CONSTRAINT proposal_lines_bundle_member_cap CHECK (
    bundle_members IS NULL
    OR jsonb_array_length(bundle_members) <= 200
  );
