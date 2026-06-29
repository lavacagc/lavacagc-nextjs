-- "Buy + Remodel" curated home listings, populated via admin spreadsheet import.
-- Modeled on 20260118000000_create_compliance_documents.sql (table + RLS public-read-on-status + storage bucket).

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity / upsert key
  slug TEXT NOT NULL UNIQUE,            -- deterministic; the on_conflict target for re-imports
  external_id TEXT,                     -- optional owner-stable id (preferred slug base if present)
  mls_number TEXT,                      -- informational only

  -- Address
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  county TEXT,
  state TEXT NOT NULL DEFAULT 'NJ',
  zip TEXT,

  -- Core facts
  list_price INTEGER,                   -- whole dollars
  beds INTEGER,
  baths NUMERIC(3,1),                   -- half-baths are real
  sqft INTEGER,
  lot_size TEXT,                        -- display-only string ("0.34 acres")
  year_built INTEGER,
  property_type TEXT CHECK (property_type IN (
    'single-family','multi-family','townhouse','condo','land','other'
  )),
  short_description TEXT,

  -- Lavaca value model
  est_remodel_budget_low INTEGER,
  est_remodel_budget_high INTEGER,
  est_arv INTEGER,                      -- after-remodel value
  area_comp_avg INTEGER,                 -- avg sale price of comparable remodeled homes nearby (equity check)
  recommended_scope TEXT CHECK (recommended_scope IN (
    'kitchen','bathroom','basement','addition','whole-home','general'
  )),
  highlights TEXT[] DEFAULT '{}',

  -- Media + source
  photo_urls TEXT[] DEFAULT '{}',       -- Supabase-hosted URLs after import re-host
  listing_url TEXT,

  -- Presentation / workflow
  featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','available','pending','sold'
  )),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Read indexes for the public gallery filters/sort.
CREATE INDEX IF NOT EXISTS listings_status_idx ON listings (status);
CREATE INDEX IF NOT EXISTS listings_city_idx   ON listings (city);
CREATE INDEX IF NOT EXISTS listings_sort_idx   ON listings (featured DESC, sort_order ASC, created_at DESC);
-- Partial unique guard so a non-empty MLS can't be duplicated by accident (NULLs don't collide).
CREATE UNIQUE INDEX IF NOT EXISTS listings_mls_uniq ON listings (mls_number) WHERE mls_number IS NOT NULL;

-- RLS: public reads non-draft rows; authenticated users manage everything.
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read non-draft listings"
  ON listings
  FOR SELECT
  USING (status IN ('available','pending','sold'));

CREATE POLICY "Authenticated users can manage listings"
  ON listings
  FOR ALL
  USING (auth.role() = 'authenticated');

-- Single-row partner-agent config (one partner realtor shown on every listing).
CREATE TABLE IF NOT EXISTS partner_realtor (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name TEXT,
  brokerage TEXT,
  phone TEXT,
  email TEXT,
  photo_url TEXT,
  bio TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the single config row so admin edits are an UPDATE, not an INSERT race.
INSERT INTO partner_realtor (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE partner_realtor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read partner realtor"
  ON partner_realtor
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage partner realtor"
  ON partner_realtor
  FOR ALL
  USING (auth.role() = 'authenticated');

-- Storage bucket for re-hosted listing photos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('listings', 'listings', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload listing photos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'listings' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update listing photos"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'listings' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete listing photos"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'listings' AND auth.role() = 'authenticated');

CREATE POLICY "Public can read listing photos storage"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'listings');
