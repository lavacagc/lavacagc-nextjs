-- AI before/after remodel renderings for listings.
-- One row per (listing, room/section). The "before" is an uploaded photo from
-- the import sheet; the "after" is AI-generated (Gemini) at the same angle by
-- the /api/cron/generate-renderings job. Images live in the existing `listings`
-- storage bucket under renderings/<slug>/.

CREATE TABLE IF NOT EXISTS listing_renderings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN (
    'kitchen','bathroom','living-room','exterior','basement'
  )),
  source_before_url TEXT,          -- original sheet URL; dedupe / change-detection key
  before_url TEXT,                 -- Supabase-hosted re-host of the before photo
  after_url TEXT,                  -- AI-generated, Supabase-hosted (null until cron fills it)
  style TEXT,                      -- optional remodel style from the sheet
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (listing_id, section)
);

CREATE INDEX IF NOT EXISTS listing_renderings_listing_idx ON listing_renderings (listing_id);
CREATE INDEX IF NOT EXISTS listing_renderings_status_idx  ON listing_renderings (status);

ALTER TABLE listing_renderings ENABLE ROW LEVEL SECURITY;

-- Public sees only completed renderings.
CREATE POLICY "Public can read ready renderings"
  ON listing_renderings
  FOR SELECT
  USING (status = 'ready');

CREATE POLICY "Authenticated users can manage renderings"
  ON listing_renderings
  FOR ALL
  USING (auth.role() = 'authenticated');
