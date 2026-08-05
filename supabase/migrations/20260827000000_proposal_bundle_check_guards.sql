-- Proposal Pod - Slice 2 follow-up: make the two bundle CHECKs answer for a
-- non-array bundle_members instead of raising out of the array call inside them.
--
-- 20260825000000 and 20260826000000 have both landed in a database, so per the
-- standing rule from 20260824000000 both are frozen and this repair lives here.
--
-- Found by re-applying those two files to a throwaway local Postgres and
-- exercising the constraints, which is the rule this pod verifies its DDL by.
-- Inserting a proposal_lines row whose bundle_members is a JSON OBJECT rather
-- than an array was refused with SQLSTATE 22023 ("cannot get array length of a
-- non-array"), not with a check_violation naming a constraint:
--
--   * proposal_lines_bundle_shape already stands down on a non-array, because
--     jsonb_typeof(bundle_members) = 'array' leads its conjunction.
--   * proposal_lines_bundle_member_cap called jsonb_array_length(bundle_members)
--     with no such escape.
--   * proposal_lines_bundle_sum called public.proposal_bundle_total, whose
--     jsonb_array_elements() raises 22023 on an object for the same reason.
--
-- The row was refused either way, so no bad data ever landed and the
-- application path is untouched (zod validates bundle_members before any
-- write). What was wrong is the QUALITY of the backstop these CHECKs exist to
-- be. 20260826000000 calls the cap "the layer that holds when a writer skips
-- it", and a layer that answers a zod-skipping writer with a message naming no
-- constraint points that writer at nothing. Worse, which of the three answered
-- first was not even deterministic: Postgres evaluates a table's CHECK
-- constraints in an unspecified order.
--
-- So: proposal_lines_bundle_shape OWNS the non-array rejection, and the other
-- two stand down for that input. Both keep their names and their semantics for
-- every array input are unchanged, so a database that has already validated
-- these constraints revalidates the same rows to the same verdict.
--
-- The escape is written as CASE rather than as a leading OR because CASE is the
-- one construct Postgres documents as evaluating in order. Boolean operators
-- are NOT a short-circuit guarantee - the planner may reorder their operands,
-- which is the whole reason an unguarded array call could surface at all. The
-- NULL arm is spelled out first and separately: bundle_members IS NULL is the
-- ordinary, non-bundle line, and it must reach neither the length call nor
-- proposal_bundle_total (which sums no rows for a NULL input and would compare
-- 0 against a real price_cents).
--
-- Once this file has landed in any database it is frozen too; further schema
-- changes go in a new migration.

ALTER TABLE public.proposal_lines DROP CONSTRAINT proposal_lines_bundle_member_cap;

ALTER TABLE public.proposal_lines
  ADD CONSTRAINT proposal_lines_bundle_member_cap CHECK (
    CASE
      WHEN bundle_members IS NULL THEN TRUE
      WHEN jsonb_typeof(bundle_members) <> 'array' THEN TRUE
      ELSE jsonb_array_length(bundle_members) <= 200
    END
  );

ALTER TABLE public.proposal_lines DROP CONSTRAINT proposal_lines_bundle_sum;

ALTER TABLE public.proposal_lines
  ADD CONSTRAINT proposal_lines_bundle_sum CHECK (
    CASE
      WHEN bundle_members IS NULL THEN TRUE
      WHEN jsonb_typeof(bundle_members) <> 'array' THEN TRUE
      ELSE public.proposal_bundle_total(bundle_members) = price_cents
    END
  );
