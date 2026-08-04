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
--
-- Nothing else in the pipeline reads this file as SQL: the gate runs lint and
-- tsc, and the acceptance tests assert over its TEXT, so the DDL gets its only
-- real reading from a database. What follows from that is a standing rule
-- rather than a note about one afternoon. Every revision of this file is
-- applied to a throwaway local Postgres and its constraints exercised there
-- before that revision is called finished: a 43-character token accepted and a
-- short one rejected, a whole-composition snapshot accepted, whole cents written
-- with a scale and a price_cents at the cap exactly both accepted on the
-- snapshot and on a line row, a proposal revoked out of draft accepted with no
-- sent_at, an UPDATE that names no timestamp still moving updated_at past
-- created_at, a line inserted, changed and deleted each moving its proposal's
-- updated_at with no write to that row at all, a proposal carrying a submission
-- refusing to delete until that submission is deleted first, and a fractional
-- price_cents, a price above the cap on either the line row or the snapshot, a
-- missing `optional` key, an empty included_lines, a total_cents that disagrees
-- with its snapshot, a revoked_at stamped while the status still reads 'sent'
-- and a 'sent' proposal carrying no sent_at each rejected by the constraint that
-- names them. The PR's Supabase
-- Preview check then replays every migration on a real database before merge,
-- and production is hand-applied at go-live.
--
-- Nothing here is created behind an existence guard - not the tables, not the
-- indexes, not the domain. A guard asks only whether the NAME exists and cannot
-- see that the SHAPE moved on, so a database holding an earlier revision would
-- keep the weaker contract - no token recipe, no lifecycle rules, no snapshot
-- shape - while the migration tracker called this file applied and nothing ever
-- surfaced the drift. Re-applying it is meant to fail loudly, because the whole
-- argument for putting these rules in the schema is that the schema outlives the
-- code.
--
-- Which makes the standing rule: once this file has landed in a database that
-- KEEPS it - production, or the preview branch - it is frozen. Every further
-- change to the proposal schema goes in a NEW migration with a later timestamp.
-- Editing an applied migration in place is how the two would silently disagree.
-- A local verification stack is not that database: it is rebuilt from these
-- files, so it can only ever hold what they currently say.

CREATE TABLE public.proposals (
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
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The kill switch and its timestamps say the same thing, or the row does not
  -- exist. `status` is the whole of what stops a link serving: RLS denies the
  -- anon key, the token carries no lifetime of its own (token.ts), and D3 makes
  -- revocation an explicit admin act, so the lookup's only question is this
  -- column. Left independent, the three let a writer stamp revoked_at and leave
  -- status 'sent' - a row the admin UI renders as revoked that goes on serving
  -- private prices, silent in exactly the way a short token would be. Nothing in
  -- this slice writes them, which is why the schema is the only guard there is.
  --
  -- Revocation is the biconditional: revoked_at is set when, and only when, the
  -- status says revoked. Sending is one-way and so is its rule - a proposal
  -- revoked out of draft never had a sent_at, and one revoked after sending
  -- keeps the sent_at it earned - so that side asks only that 'sent' carry its
  -- timestamp, and says nothing about the rows that have moved past it.
  CONSTRAINT proposals_revoked_at_matches_status
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CONSTRAINT proposals_sent_at_present_when_sent
    CHECK (status <> 'sent' OR sent_at IS NOT NULL)
);

CREATE INDEX idx_proposals_lead ON public.proposals (lead_id);

-- updated_at is maintained here, not asked of every writer. A DEFAULT fires
-- once, at INSERT, so without this the column stays equal to created_at for the
-- life of the row while reading as authoritative - the admin UI sorts an edited
-- proposal as untouched since the day it was created, and nothing says
-- otherwise. That is the same silent-when-forgotten shape the token recipe, the
-- lifecycle rules and the total-is-the-sum check are all in this file to close,
-- and the same argument applies: nothing in this slice writes the column, so the
-- schema is the only thing that can keep it honest.
--
-- This one covers an UPDATE of the proposals row itself; the re-import is the
-- other half, and proposal_lines carries its own trigger for it below.
--
-- PostgREST does not publish a function returning trigger, so unlike the sum
-- function below neither of the two here is reachable as an RPC, and neither
-- needs a revoke.
CREATE FUNCTION public.proposals_set_updated_at() RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;

CREATE TRIGGER proposals_set_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.proposals_set_updated_at();

CREATE TABLE public.proposal_lines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  -- CSV order, preserved: the page renders the estimate in the order it was
  -- built, not alphabetically.
  position     INT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  -- Bounded above at the 1_000_000_000 cents the CSV parser caps a line at
  -- (MAX_PRICE_CENTS, $10,000,000) and the snapshot domain below repeats, so all
  -- three layers say one thing about what a line may cost. This is the column
  -- the snapshot is built FROM, and it is the one that was left open: a writer
  -- other than the parser - an admin price edit, a data correction, the import
  -- API before its own guard - could store a line the client page then rendered
  -- and summed, and the submit insert failed against the snapshot domain, naming
  -- a rule on another table rather than the row that was actually wrong.
  price_cents  BIGINT NOT NULL
               CONSTRAINT proposal_lines_price_range
               CHECK (price_cents >= 0 AND price_cents <= 1000000000),
  -- The category registry's verdict, after any per-line admin override in the
  -- import preview. false = locked. The fail-safe lives in code: a title the
  -- registry does not recognize imports as locked.
  optional     BOOLEAN NOT NULL DEFAULT false,
  -- Registry category slug ('cabinets', 'tile', ... or 'general'), which
  -- drives the WEB-024 icon on the client page.
  category     TEXT NOT NULL DEFAULT 'general',
  -- This also carries the lookup. Both shapes the client page and the import
  -- issue - the lines of one proposal, in position order - are served by the
  -- index UNIQUE builds, because proposal_id leads it and the ordering comes
  -- free from the second column. A standalone index on proposal_id alone would
  -- be a second btree to maintain on every insert and on the delete-and-recreate
  -- a CSV re-import performs, for a plan the planner already reaches.
  CONSTRAINT proposal_lines_position UNIQUE (proposal_id, position)
);

-- The other half of updated_at, and the half the argument for it was made from.
-- A CSV re-import replaces this table's rows wholesale - a DELETE and an INSERT
-- on the CHILD table - and never writes the proposals row at all, so the trigger
-- above cannot fire: the estimate the admin has just corrected goes on reading
-- as untouched since the day it was created. Leaving that to the import API to
-- remember is exactly the dependency the trigger above exists to remove, and
-- nothing in this slice writes either column, so the schema is again the only
-- thing that can keep the timestamp honest.
--
-- FOR EACH ROW, because the parent is read off the row: NEW's proposal_id, or
-- OLD's when the row is going away, and both when a line moves between
-- proposals. TG_OP is what selects them - PL/pgSQL leaves OLD unassigned on an
-- INSERT and NEW on a DELETE, so neither may be read unconditionally. The cost
-- is bounded by the parser's own cap, MAX_LINES: a re-import is at most 200 rows
-- out and 200 back in. A cascade delete of the proposal itself finds no parent
-- left to touch, which is the right answer there rather than an error.
CREATE FUNCTION public.proposal_lines_touch_proposal() RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    IF TG_OP <> 'INSERT' THEN
      UPDATE public.proposals SET updated_at = now() WHERE id = OLD.proposal_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      UPDATE public.proposals SET updated_at = now() WHERE id = NEW.proposal_id;
    END IF;
    RETURN NULL;
  END;
  $$;

CREATE TRIGGER proposal_lines_touch_proposal
  AFTER INSERT OR UPDATE OR DELETE ON public.proposal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.proposal_lines_touch_proposal();

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
-- JSONB is the one place agreed money is stored outside BIGINT, so what BIGINT
-- would have given for free is asked for here explicitly. The whole number:
-- `floor() == itself`, without which 1999.5 is a legal snapshot and the
-- browser's sum and the server's re-sum stop agreeing to the cent. And the
-- magnitude, bounded at the 1_000_000_000 cents the CSV parser already caps a
-- line at (MAX_PRICE_CENTS - $10,000,000, above any job La Vaca prices through
-- this page) and proposal_lines.price_cents now repeats, so none of the three
-- layers a price passes through can disagree about what a line may cost.
-- Unbounded, a value past BIGINT was a domain-valid element that the total's
-- sum below then rejected with a bare `bigint out of range` naming no
-- constraint - the same unnamed rejection the NUMERIC cast was added to close
-- on the scale side, left open on the magnitude side.
--
-- A DOMAIN rather than the same CHECK written out per column: both snapshot
-- columns below carry exactly this contract, and a copy each is a copy each to
-- keep in sync. NULL passes it (SQL's rule for CHECK), so nullability stays the
-- column's own business.
CREATE DOMAIN public.proposal_line_snapshot AS JSONB
  CONSTRAINT proposal_line_snapshot_shape CHECK (
    jsonb_typeof(VALUE) = 'array'
    AND jsonb_array_length(jsonb_path_query_array(
          VALUE, 'strict $[*] ? (@.type() == "object")', '{}', true
        )) = jsonb_array_length(VALUE)
    AND jsonb_array_length(jsonb_path_query_array(
          VALUE,
          '$[*] ? (@.id.type() == "string" && @.title.type() == "string" && @.optional.type() == "boolean" && @.price_cents.type() == "number" && @.price_cents >= 0 && @.price_cents <= 1000000000 && @.price_cents.floor() == @.price_cents)',
          '{}', true
        )) = jsonb_array_length(VALUE)
  );

-- The total IS the snapshot's arithmetic, and the schema is where that is said.
--
-- included_lines records the whole agreed composition, so total_cents is by
-- construction the sum of its price_cents. "By construction" was a claim about
-- an API this slice does not ship: a writer that summed proposal_lines while
-- assembling the snapshot from a different set - the locked lines in one and not
-- the other - satisfied every check above, and the owner alert then printed a
-- number the client never agreed to, with nothing left to say which of the two
-- was the record. Every other part of that record is CHECKed; the money is the
-- part worth checking most.
--
-- A CHECK may not aggregate, so the sum lives in a function the constraint
-- calls. It reads only its argument, which is what makes it legal there, and
-- IMMUTABLE because the same array always sums to the same cents. search_path
-- is pinned empty and everything the body touches is pg_catalog's own, so the
-- constraint cannot be made to mean something else by a schema in front of it.
--
-- The text reaches BIGINT through NUMERIC because jsonb keeps the scale it was
-- handed: 1999.0 is whole cents and the domain above accepts it, but ->>
-- renders it '1999.0', which BIGINT will not parse. Casting straight across
-- rejected that row with a bare syntax error naming no constraint, in a file
-- whose whole discipline is that a rejection says which rule was broken. The
-- whole-cents rule stays the domain's, and the domain runs first: this step
-- only reads a number it has already vouched for.
CREATE FUNCTION public.proposal_snapshot_total(snapshot JSONB) RETURNS BIGINT
  LANGUAGE sql
  IMMUTABLE
  STRICT
  PARALLEL SAFE
  SET search_path = ''
  AS $$
    SELECT COALESCE(SUM(((line ->> 'price_cents')::NUMERIC)::BIGINT), 0)::BIGINT
    FROM jsonb_array_elements(snapshot) AS line;
  $$;

-- PostgREST publishes every scalar function in `public`, and Supabase's
-- bootstrap ALTER DEFAULT PRIVILEGES grants EXECUTE on new ones to anon and
-- authenticated, so without this the function answers
-- POST /rest/v1/rpc/proposal_snapshot_total for anyone holding the publishable
-- key. It reads only its argument and touches no table, so there is nothing to
-- disclose, but this file's posture is that the anon key gets nothing, and an
-- anon caller can still hand it an arbitrarily large array to sum.
--
-- service_role keeps EXECUTE, explicitly rather than by inheritance: Postgres
-- checks EXECUTE at INSERT time for a function a CHECK calls, so a revoke that
-- reached the role writing proposal_submissions would break every submission.
REVOKE EXECUTE ON FUNCTION public.proposal_snapshot_total(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_snapshot_total(JSONB) TO service_role;

CREATE TABLE public.proposal_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT, where proposal_lines cascades. Lines belong to the proposal and
  -- are replaced wholesale by every re-import; a submission does not belong to
  -- it in that sense. Owner decision D4 makes each one THE record of what a
  -- client agreed to, which is what the snapshot below exists to keep readable
  -- after the rows it was built from are gone - and none of that survives the
  -- parent row being deleted. So deleting a proposal that carries submissions
  -- fails loudly and the admin deletes the submissions first, deliberately, in
  -- two steps. lead_id makes the same call in the shape its own nullability
  -- allows: there the priced record survives the lead, here the record IS the
  -- child row, so SET NULL is not available without giving up NOT NULL.
  proposal_id       UUID NOT NULL REFERENCES public.proposals(id) ON DELETE RESTRICT,
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
  -- client. What the owner alert prints, and tied to the composition above so
  -- the two cannot tell different stories about what was agreed.
  total_cents       BIGINT NOT NULL CHECK (total_cents >= 0)
                    CONSTRAINT proposal_submissions_total_is_snapshot_sum
                    CHECK (total_cents = public.proposal_snapshot_total(included_lines)),
  -- Free early telemetry (owner-approved concession toward WEB-027): which
  -- optional lines the client flipped at least once while playing. Snapshotted
  -- the same way, checked the same way, and for the same reason - but empty is
  -- a legitimate answer here: a client who touched nothing touched nothing.
  touched_lines     public.proposal_line_snapshot,
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_submissions_proposal
  ON public.proposal_submissions (proposal_id);

-- Deny-by-default on all three. The service-role key bypasses RLS for
-- legitimate server access; the anon key gets nothing.
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_submissions ENABLE ROW LEVEL SECURITY;
