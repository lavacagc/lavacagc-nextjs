-- Buy + Remodel subscriber identification + behavior tracking.
--
-- Once a visitor verifies their email they carry a signed `br_access` cookie
-- (their subscriber id). This records, for known subscribers only, the pages
-- they view (site-wide) so the owner can see who their users are and how they
-- use the site. The optional `visitor_id` ties a subscriber to their prior
-- anonymous device identity (the same id GA4 / Clarity / Meta Pixel use).
--
-- Additive + idempotent. Reads are limited to authenticated admins; writes go
-- through the service key only (no INSERT policy), like leads / consent_logs.

CREATE TABLE IF NOT EXISTS subscriber_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES newsletter_subscribers(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  listing_slug TEXT,                 -- set when path is /buy-and-remodel/<slug>
  referrer TEXT,
  visitor_id TEXT,                   -- localStorage device id, for cross-tool linking
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriber_activity_sub_idx ON subscriber_activity (subscriber_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscriber_activity_listing_idx ON subscriber_activity (listing_slug);

ALTER TABLE subscriber_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read subscriber activity" ON subscriber_activity;
CREATE POLICY "Authenticated can read subscriber activity"
  ON subscriber_activity FOR SELECT USING (auth.role() = 'authenticated');

-- Recognize returning subscribers + tie them to their anonymous device id.
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS visitor_id TEXT;
