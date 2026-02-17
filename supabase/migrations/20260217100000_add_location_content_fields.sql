-- Add slug, neighborhood_features, and expertise_cards columns to service_areas
-- for managing location page content through the admin interface

-- Add slug column (unique identifier for URL-based lookups)
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS slug text UNIQUE;

-- Add neighborhood_features column (JSON array of feature strings)
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS neighborhood_features jsonb DEFAULT '[]'::jsonb;

-- Add expertise_cards column (JSON array of {title, description} objects)
ALTER TABLE service_areas ADD COLUMN IF NOT EXISTS expertise_cards jsonb DEFAULT '[]'::jsonb;

-- Create an index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_service_areas_slug ON service_areas (slug);
