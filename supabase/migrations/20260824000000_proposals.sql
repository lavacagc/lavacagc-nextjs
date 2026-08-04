-- Proposal Page Pod - Slice 1 (spec WEB-020/WEB-021): schema only.
--
-- A proposal is the client-facing shape of a priced estimate: a set of lines,
-- each carrying ONLY the blended price (margin math lives in the estimator and
-- never reaches this database - owner decision D1, 2026-08-03). Locked lines
-- are the bones of the job; optional lines carry a toggle on the client page.
--
-- Deny-by-default, exactly like home_records: RLS is ENABLED with NO policies,
-- so the anon/publishable key can neither read nor write. Proposal prices are
-- one client's private business; the only gate that may serve them is the
-- application code resolving the unguessable per-proposal token server-side.
-- Do NOT add a permissive anon policy here, ever.
--
-- Money is INTEGER CENTS (BIGINT). Never float, never numeric-with-rounding:
-- the client page sums these in the browser (WEB-023) and the server re-sums
-- them at submit time, and the two must agree to the cent.

CREATE TABLE IF NOT EXISTS public.proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 32 random bytes, base64url - same recipe as the intake chat session token.
  -- UNIQUE gives the lookup index; unknown tokens get a generic dead end.
  --
  -- CHECKed against that recipe, not merely documented as it. This token is the
  -- WHOLE access control for the row: RLS denies the anon key outright, so the
  -- only thing between a client's private prices and the public is the length of
  -- this string. Plain TEXT accepts '' and 'abc', nothing in this slice writes
  -- the column yet, and the failure when a future writer gets it wrong is
  -- silent - the proposal simply becomes guessable. 43 characters is what 32
  -- bytes encode to in unpadded base64url, and the class is base64url's own.
  token         TEXT NOT NULL UNIQUE
                CONSTRAINT proposals_token_recipe
                CHECK (token ~ '^[A-Za-z0-9_-]{43}$'),
  client_name   TEXT NOT NULL,
  client_email  TEXT,
  title         TEXT NOT NULL,
  -- draft -> sent -> (optionally) revoked. Owner decision D3: links do not
  -- expire on their own; revocation is the admin's explicit act.
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'revoked')),
  -- The lead this proposal belongs to, when known. SET NULL rather than
  -- CASCADE: deleting a lead must not silently destroy the priced record.
  lead_id       UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  sent_at       TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_lead ON public.proposals (lead_id);

CREATE TABLE IF NOT EXISTS public.proposal_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  -- CSV order, preserved: the page renders the estimate in the order it was
  -- built, not alphabetically.
  position     INT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price_cents  BIGINT NOT NULL CHECK (price_cents >= 0),
  -- The category registry's verdict, after any per-line admin override in the
  -- import preview. false = locked. The fail-safe lives in code: a title the
  -- registry does not recognize imports as locked.
  optional     BOOLEAN NOT NULL DEFAULT false,
  -- Registry category slug ('cabinets', 'tile', ... or 'general'), which
  -- drives the WEB-024 icon on the client page.
  category     TEXT NOT NULL DEFAULT 'general',
  CONSTRAINT proposal_lines_position UNIQUE (proposal_id, position)
);

CREATE INDEX IF NOT EXISTS idx_proposal_lines_proposal ON public.proposal_lines (proposal_id);

-- What a submission stores of the lines it agreed to: an array whose every
-- element is a SNAPSHOT, {"id", "title", "price_cents", "optional"}, not a bare
-- id.
--
-- A CSV re-import replaces proposal_lines wholesale, so the ids in older
-- submissions stop resolving the first time an admin corrects the estimate, and
-- there is no FK to hold them (arrays cannot express one). Owner decision D4
-- keeps every submission as THE record of what was agreed, so the record has to
-- stay readable without the rows it was built from.
--
-- "What was agreed" is the WHOLE composition, not the client's toggles alone.
-- The locked lines are the bones of the job and most of the money, so leaving
-- them out left the agreement half-recorded: everything but an implied
-- subtraction from total_cents. They travel in the same array, each element
-- marked `optional`, so the record still says which of them the client could
-- move and which were never theirs to.
--
-- The shape is CHECKed, not just documented: a comment does not stop the API
-- from persisting bare ids, and the schema is the only layer that outlives the
-- re-import. Every element must be an object carrying all four keys, at the
-- right types; extra keys are welcome. The paired counts are the "every" - a
-- subquery is not allowed in a CHECK, so the elements that satisfy the filter
-- are counted against the elements that are there.
--
-- JSONB is the one place agreed money is stored outside BIGINT, so the whole
-- number is required here explicitly: `floor() == itself` is what BIGINT does
-- for every other cents column. Without it 1999.5 is a legal snapshot, and the
-- browser's sum and the server's re-sum stop agreeing to the cent.
--
-- A DOMAIN rather than the same CHECK written out per column: both snapshot
-- columns below carry exactly this contract, and a copy each is a copy each to
-- keep in sync. NULL passes it (SQL's rule for CHECK), so nullability stays the
-- column's own business.
--
-- Created unconditionally, on purpose. A guard asking only whether the NAME
-- exists cannot see that the SHAPE moved on: a database that ran an earlier
-- revision of this file would keep the weaker contract while the migration
-- tracker reported it applied, and nothing would ever surface the drift. A
-- second application failing loudly here is the outcome worth having, because
-- the argument for putting this contract in the schema at all is that the
-- schema outlives the code.
--
-- Which makes the standing rule: once this file has landed in ANY database,
-- it is frozen. Every further change to the proposal schema goes in a NEW
-- migration with a later timestamp. Editing an applied migration in place is
-- how the two would silently disagree.
CREATE DOMAIN public.proposal_line_snapshot AS JSONB
  CONSTRAINT proposal_line_snapshot_shape CHECK (
    jsonb_typeof(VALUE) = 'array'
    AND jsonb_array_length(jsonb_path_query_array(
          VALUE, 'strict $[*] ? (@.type() == "object")', '{}', true
        )) = jsonb_array_length(VALUE)
    AND jsonb_array_length(jsonb_path_query_array(
          VALUE,
          '$[*] ? (@.id.type() == "string" && @.title.type() == "string" && @.optional.type() == "boolean" && @.price_cents.type() == "number" && @.price_cents >= 0 && @.price_cents.floor() == @.price_cents)',
          '{}', true
        )) = jsonb_array_length(VALUE)
  );

CREATE TABLE IF NOT EXISTS public.proposal_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  -- The exact configuration the client committed, snapshotted whole: every
  -- locked line plus the optional lines they kept, each element marked
  -- `optional`. A submission still cannot express ALTERING a locked line
  -- (WEB-022, enforced at the API on top of this shape) - it records them
  -- because they are most of what was agreed to.
  --
  -- At least one element, on the column rather than the shared domain: because
  -- the composition is snapshotted whole, every real submission carries the
  -- locked lines, so an empty array is a submission that records no agreement
  -- at all. NOT NULL alone does not say that, and total_cents >= 0 admits the
  -- 0 that would come with it.
  included_lines    public.proposal_line_snapshot NOT NULL
                    CONSTRAINT proposal_submissions_included_lines_present
                    CHECK (jsonb_array_length(included_lines) >= 1),
  -- Server-recomputed at submit time from the rows, never trusted from the
  -- client. What the owner alert prints.
  total_cents       BIGINT NOT NULL CHECK (total_cents >= 0),
  -- Free early telemetry (owner-approved concession toward WEB-027): which
  -- optional lines the client flipped at least once while playing. Snapshotted
  -- the same way, checked the same way, and for the same reason - but empty is
  -- a legitimate answer here: a client who touched nothing touched nothing.
  touched_lines     public.proposal_line_snapshot,
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_submissions_proposal
  ON public.proposal_submissions (proposal_id);

-- Deny-by-default on all three. The service-role key bypasses RLS for
-- legitimate server access; the anon key gets nothing.
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_submissions ENABLE ROW LEVEL SECURITY;
