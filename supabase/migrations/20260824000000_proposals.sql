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
  token         TEXT NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS public.proposal_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  -- The exact configuration the client committed: array of INCLUDED optional
  -- line ids. Locked lines are always in scope and deliberately absent here -
  -- a submission cannot even express altering one (WEB-022, enforced at the
  -- API on top of this shape).
  included_line_ids JSONB NOT NULL,
  -- Server-recomputed at submit time from the rows, never trusted from the
  -- client. What the owner alert prints.
  total_cents       BIGINT NOT NULL CHECK (total_cents >= 0),
  -- Free early telemetry (owner-approved concession toward WEB-027): which
  -- optional lines the client flipped at least once while playing.
  touched_line_ids  JSONB,
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
