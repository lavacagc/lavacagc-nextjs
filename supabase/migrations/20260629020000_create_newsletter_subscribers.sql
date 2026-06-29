-- Newsletter subscribers for the "Buy + Remodel" email gate.
-- A visitor enters name/email/phone/zip(s), verifies their email (double opt-in),
-- which both signs them up for the newsletter AND unlocks the gated listing detail
-- pages. Unsubscribing flips status to 'unsubscribed', which the middleware gate
-- treats as revoked access (re-signup + re-verify required).
--
-- Modeled on 20260629000000_create_listings.sql (table + RLS + service-key writes).
-- All reads/writes from the app go through SUPABASE_SECRET_KEY (like public.leads),
-- so there is intentionally NO public RLS policy.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity (store email lowercased + trimmed; unique upsert key)
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  zip_codes TEXT[] NOT NULL DEFAULT '{}',

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','active','unsubscribed'
  )),

  -- Double opt-in tokens
  verify_token TEXT,                     -- random 32-byte hex; cleared once verified
  verify_token_expires_at TIMESTAMPTZ,   -- ~48h from issue
  unsubscribe_token TEXT NOT NULL,       -- stable per-subscriber; never expires

  verified_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,

  -- Provenance / consent record
  source TEXT,                           -- e.g. 'buy-and-remodel'
  consent_ip TEXT,
  consent_user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_status_idx
  ON newsletter_subscribers (status);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_verify_token_idx
  ON newsletter_subscribers (verify_token);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_unsub_token_idx
  ON newsletter_subscribers (unsubscribe_token);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- No public RLS policy: the gate API + middleware use the service key.
-- Authenticated admins can read/manage the list in /vaca-mgmt.
CREATE POLICY "Authenticated users can manage subscribers"
  ON newsletter_subscribers
  FOR ALL
  USING (auth.role() = 'authenticated');
