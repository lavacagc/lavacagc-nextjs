-- Add visitor tracking columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS visitor_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS visit_count integer DEFAULT 1;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_seen timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referrer text;

-- Add visitor tracking columns to estimate_leads table
ALTER TABLE estimate_leads ADD COLUMN IF NOT EXISTS visitor_id text;
ALTER TABLE estimate_leads ADD COLUMN IF NOT EXISTS visit_count integer DEFAULT 1;
ALTER TABLE estimate_leads ADD COLUMN IF NOT EXISTS first_seen timestamptz;
ALTER TABLE estimate_leads ADD COLUMN IF NOT EXISTS referrer text;

-- Index for looking up leads by visitor_id (cross-reference chat + form submissions)
CREATE INDEX IF NOT EXISTS idx_leads_visitor_id ON leads(visitor_id) WHERE visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimate_leads_visitor_id ON estimate_leads(visitor_id) WHERE visitor_id IS NOT NULL;
