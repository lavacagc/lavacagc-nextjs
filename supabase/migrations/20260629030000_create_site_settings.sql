-- Site-wide feature flags (single-row config, id=1), modeled on partner_realtor
-- in 20260629000000_create_listings.sql. First use: an admin-controlled publish
-- switch for the "Buy + Remodel" feature so the owner can populate + preview it
-- before it goes live to the public.

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  buy_and_remodel_published BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the single row so admin edits are an UPDATE, not an INSERT race.
INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- World-readable (the published flag is not sensitive); authenticated admins write.
CREATE POLICY "Public can read site settings"
  ON site_settings
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage site settings"
  ON site_settings
  FOR ALL
  USING (auth.role() = 'authenticated');
