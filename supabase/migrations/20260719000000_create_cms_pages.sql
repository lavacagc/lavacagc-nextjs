-- CMS Pages table for landing pages and marketing pages
CREATE TABLE cms_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  meta_description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  page_type TEXT DEFAULT 'landing' CHECK (page_type IN ('landing', 'resource', 'campaign')),
  sections JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read published pages" ON cms_pages FOR SELECT USING (status = 'published');
CREATE POLICY "Authenticated users can manage pages" ON cms_pages FOR ALL USING (auth.role() = 'authenticated');

-- Indexes
CREATE INDEX idx_cms_pages_slug ON cms_pages(slug);
CREATE INDEX idx_cms_pages_status ON cms_pages(status);
