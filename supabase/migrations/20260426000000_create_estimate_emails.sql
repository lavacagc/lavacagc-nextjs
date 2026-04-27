-- Estimate emails: audit log + outbound queue for the customer-facing
-- estimate-presentation email sent via Resend from the admin dashboard.
--
-- Why a dedicated table rather than reusing leads/follow_up_queue:
--   - A single lead can receive multiple estimate emails (revisions, re-quotes)
--     so we want a separate row per send, not a status column on leads.
--   - We need a permanent audit trail of *who* sent what to *whom* with which
--     URLs — leads gets enough churn already.
--   - Idempotency window logic (30s) needs a "last send" per recipient that
--     a one-shot column on leads can't represent cleanly.

CREATE TABLE IF NOT EXISTS public.estimate_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Optional FK so test sends and one-off sends (lead not yet in DB) work.
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  recipient_email TEXT NOT NULL,
  recipient_name  TEXT NOT NULL,
  cc_emails       TEXT,                  -- comma-separated, optional
  reply_to        TEXT,                  -- override; null = use helper default

  project_type    TEXT NOT NULL,
  estimate_url    TEXT NOT NULL,
  portal_url      TEXT,
  update_cadence  TEXT CHECK (update_cadence IN ('daily','weekly')),
  personal_note   TEXT,

  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by         TEXT,                  -- admin email from session

  resend_message_id TEXT,                -- delivery id; null on failure
  status          TEXT NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent','failed','test')),
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_estimate_emails_lead_id
  ON public.estimate_emails(lead_id);

CREATE INDEX IF NOT EXISTS idx_estimate_emails_sent_at
  ON public.estimate_emails(sent_at DESC);

-- Used by the 30s idempotency check: same recipient + same estimate URL
-- within the window returns the prior message_id instead of double-sending.
CREATE INDEX IF NOT EXISTS idx_estimate_emails_idempotency
  ON public.estimate_emails(recipient_email, estimate_url, sent_at DESC);

ALTER TABLE public.estimate_emails ENABLE ROW LEVEL SECURITY;

-- No public policies. The admin route reads/writes via SUPABASE_SECRET_KEY
-- which bypasses RLS. Anon clients should see nothing.
