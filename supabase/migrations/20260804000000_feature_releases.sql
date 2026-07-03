-- R1: release-notes email system. A queue of shipped features (headline,
-- subhead, customer benefit, screenshot) that ONLY the admin turns into a
-- member email from /vaca-mgmt/releases. Entries are written as features ship;
-- a send batches every 'queued' row and stamps it 'sent'. Sent rows also feed
-- the public /home-care/whats-new page; queued rows stay private until sent.
CREATE TABLE IF NOT EXISTS public.feature_releases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  headline        TEXT NOT NULL,
  subhead         TEXT NOT NULL,
  benefit         TEXT NOT NULL,
  -- Repo-relative public asset (e.g. /email/releases/dismiss.png); absolute
  -- prod URL is derived at send time.
  screenshot_path TEXT,
  status          TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent')),
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_feature_releases_status ON public.feature_releases (status, sort_order, created_at);

-- Service-role only (same lockdown as the other Home Care tables).
ALTER TABLE public.feature_releases ENABLE ROW LEVEL SECURITY;
