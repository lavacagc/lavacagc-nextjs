-- Universal outbound-email audit log.
--
-- Every email the app sends via Resend funnels through
-- src/lib/notify/sendEmail.ts (sendTrackedEmail), which writes one row here per
-- send. This generalizes the single-purpose estimate_emails table (2026-04) so
-- the admin can see EVERY email that went to a user — transactional and
-- marketing alike — plus the exact HTML that was delivered and, once the Resend
-- webhook is wired (Phase 2), delivered/opened/clicked/bounced events.
--
-- Design notes:
--   - No FK constraints on the *_id columns: sends happen for entities that may
--     not exist as rows yet (test sends, one-off addresses) and we never want an
--     audit insert to fail because a referenced row is missing. They're plain
--     UUIDs used for admin drill-down joins.
--   - html/text hold the exact rendered body (owner chose Postgres text storage
--     over object storage — volume is dozens/hundreds a month). Broadcasts store
--     the template once with campaign metadata.
--   - Logging is best-effort in app code: a failed insert here must never break
--     the actual email send.

CREATE TABLE IF NOT EXISTS public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What kind of email this is (drives admin filtering). Free-text rather than a
  -- CHECK enum so new senders don't require a migration; the app owns the list.
  category TEXT NOT NULL DEFAULT 'other',

  -- Recipients. to_email is the primary/first recipient (what the admin list
  -- shows); to_emails keeps the full set for multi-recipient sends.
  to_email  TEXT NOT NULL,
  to_emails TEXT[] NOT NULL DEFAULT '{}',
  to_name   TEXT,
  cc_emails TEXT,                    -- comma-separated, optional
  from_email TEXT NOT NULL,
  reply_to   TEXT,

  subject TEXT NOT NULL,
  html    TEXT,                      -- exact rendered HTML that was sent
  text    TEXT,

  -- Optional links to the domain entities the email concerns (see note above).
  homeowner_id  UUID,
  subscriber_id UUID,
  lead_id       UUID,
  campaign      JSONB,               -- utm / broadcast id / A-B arm, etc.

  sent_by TEXT NOT NULL DEFAULT 'system',   -- admin email if admin-triggered

  resend_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
         -- queued|sent|failed|skipped  (+ webhook, Phase 2:
         --  delivered|opened|clicked|bounced|complained|delivery_delayed)
  error_message TEXT,

  -- Webhook-driven delivery events (populated in Phase 2).
  delivered_at     TIMESTAMPTZ,
  first_opened_at  TIMESTAMPTZ,
  open_count       INTEGER NOT NULL DEFAULT 0,
  first_clicked_at TIMESTAMPTZ,
  click_count      INTEGER NOT NULL DEFAULT 0,
  bounced_at       TIMESTAMPTZ,
  complained_at    TIMESTAMPTZ,
  last_event_at    TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at    TIMESTAMPTZ
);

-- Admin list is "newest first", optionally filtered by category / recipient /
-- status; the webhook looks rows up by resend_message_id.
CREATE INDEX IF NOT EXISTS idx_email_log_created_at   ON public.email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_category     ON public.email_log (category);
CREATE INDEX IF NOT EXISTS idx_email_log_to_email     ON public.email_log (to_email);
CREATE INDEX IF NOT EXISTS idx_email_log_status       ON public.email_log (status);
CREATE INDEX IF NOT EXISTS idx_email_log_message_id   ON public.email_log (resend_message_id);
CREATE INDEX IF NOT EXISTS idx_email_log_homeowner_id ON public.email_log (homeowner_id);
CREATE INDEX IF NOT EXISTS idx_email_log_lead_id      ON public.email_log (lead_id);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

-- No public policies. The admin route + send wrapper read/write via
-- SUPABASE_SECRET_KEY which bypasses RLS. Anon clients see nothing.
