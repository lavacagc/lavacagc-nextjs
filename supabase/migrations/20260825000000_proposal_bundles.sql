-- Proposal Pod - Slice 2: bundles (owner mid-review request, 2026-08-04).
--
-- A bundle is one proposal_lines row the admin composed from several imported
-- CSV lines: one name they chose, ONE price (the members' sum), and the member
-- titles as the client-visible "includes" list. The client never sees a
-- per-member price - that is the feature's whole point ("less leverage to pick
-- at costs").
--
-- bundle_members stores the composition: an array of {"title", "price_cents"}
-- objects. It is ADMIN-SIDE ONLY - the client page renders member TITLES from
-- it and never the member prices, and the API contract tests assert that no
-- client-facing payload carries a price_cents inside bundle members. NULL means
-- the row is an ordinary line, not a bundle.
--
-- The same integer-cents doctrine as everything else in this schema, enforced
-- here too: every member price is whole non-negative cents, and the members
-- MUST sum exactly to the row's own price_cents - the one arithmetic the
-- schema can check, checked (mirroring proposal_submissions_total_is_
-- snapshot_sum in 20260824000000).
--
-- Once this file has landed in any database it is frozen; further schema
-- changes go in a new migration (the standing rule from 20260824000000).

CREATE FUNCTION public.proposal_bundle_total(members JSONB)
RETURNS BIGINT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT COALESCE(SUM(((m ->> 'price_cents')::NUMERIC)::BIGINT), 0)
  FROM jsonb_array_elements(members) m
$$;

-- Not PostgREST-callable by the public: same least-privilege stance as
-- proposal_snapshot_total (Supabase's default grants would otherwise expose
-- every public scalar function as an anon RPC).
REVOKE EXECUTE ON FUNCTION public.proposal_bundle_total(JSONB) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.proposal_lines
  ADD COLUMN bundle_members JSONB
    CONSTRAINT proposal_lines_bundle_shape CHECK (
      bundle_members IS NULL
      OR (
        jsonb_typeof(bundle_members) = 'array'
        AND jsonb_array_length(bundle_members) >= 2
        AND jsonb_array_length(jsonb_path_query_array(
              bundle_members, 'strict $[*] ? (@.type() == "object")', '{}', true
            )) = jsonb_array_length(bundle_members)
        AND jsonb_array_length(jsonb_path_query_array(
              bundle_members,
              '$[*] ? (@.title.type() == "string" && @.price_cents.type() == "number" && @.price_cents >= 0 && @.price_cents <= 1000000000 && @.price_cents.floor() == @.price_cents)',
              '{}', true
            )) = jsonb_array_length(bundle_members)
      )
    );

-- The arithmetic tie: a bundle's price IS its members' sum, to the cent.
ALTER TABLE public.proposal_lines
  ADD CONSTRAINT proposal_lines_bundle_sum CHECK (
    bundle_members IS NULL
    OR public.proposal_bundle_total(bundle_members) = price_cents
  );
