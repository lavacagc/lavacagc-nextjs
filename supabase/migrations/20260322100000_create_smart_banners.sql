-- Smart banners table for admin-managed personalized CTAs
CREATE TABLE IF NOT EXISTS smart_banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- Conditions (JSON for flexibility)
  visitor_type text CHECK (visitor_type IN ('new', 'returning', 'all')),
  min_visits integer DEFAULT 0,
  max_visits integer,
  min_days_since_first integer DEFAULT 0,
  max_days_since_first integer,
  show_on_paths text[] DEFAULT '{}',
  exclude_paths text[] DEFAULT '{/vaca-mgmt,/admin,/auth}',
  require_viewed_pages text[] DEFAULT '{}',
  require_not_viewed_pages text[] DEFAULT '{}',
  -- Display
  display_type text NOT NULL DEFAULT 'top-bar' CHECK (display_type IN ('top-bar', 'slide-in', 'modal')),
  icon text,
  title text,
  message text NOT NULL,
  cta_text text,
  cta_link text,
  cta_phone text,
  bg_color text DEFAULT 'bg-primary',
  text_color text DEFAULT 'text-primary-foreground',
  dismissable boolean DEFAULT true,
  dismiss_for_hours integer DEFAULT 24,
  -- Scheduling & priority
  enabled boolean DEFAULT true,
  priority integer DEFAULT 50,
  start_date timestamptz,
  end_date timestamptz,
  -- Meta
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: read for everyone (banners are public), write for authenticated
ALTER TABLE smart_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read banners" ON smart_banners
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can manage banners" ON smart_banners
  FOR ALL USING (auth.role() = 'authenticated');

-- Seed with default banners
INSERT INTO smart_banners (name, visitor_type, min_visits, max_visits, display_type, icon, message, cta_text, cta_link, bg_color, text_color, dismiss_for_hours, priority, enabled) VALUES
  ('Welcome New Visitor', 'new', 0, 1, 'top-bar', '👋', 'Welcome! Get a free estimate for your home renovation project.', 'Get Free Estimate', '/free-estimate', 'bg-primary', 'text-primary-foreground', 24, 10, true),
  ('Returning - Considering', 'returning', 2, 3, 'top-bar', '🏠', 'Still planning your renovation? We offer free in-home consultations.', 'Book Consultation', '/contact', 'bg-orange-500', 'text-white', 48, 20, true),
  ('High Intent Returner', 'returning', 4, NULL, 'top-bar', '⚡', 'Ready to start your project? Spring slots are filling fast.', 'Call (201) 212-4917', 'tel:+12012124917', 'bg-green-600', 'text-white', 72, 30, true),
  ('Abandoned Estimate', 'returning', 2, NULL, 'slide-in', '📋', 'You started an estimate last time. Pick up where you left off!', 'Continue Estimate', '/project-calculator', 'bg-blue-600', 'text-white', 24, 5, true),
  ('Win Back', 'returning', 2, NULL, 'top-bar', '🔨', 'Welcome back! Spring is the perfect time to start your renovation.', 'See Our Work', '/portfolio', 'bg-amber-600', 'text-white', 168, 25, true);

-- Set specific conditions for abandoned estimate
UPDATE smart_banners SET 
  require_viewed_pages = '{/project-calculator,/free-estimate}',
  require_not_viewed_pages = '{/contact}',
  exclude_paths = '{/vaca-mgmt,/admin,/auth,/project-calculator,/free-estimate}',
  title = 'Your estimate is waiting'
WHERE name = 'Abandoned Estimate';

-- Set specific conditions for win back
UPDATE smart_banners SET min_days_since_first = 7
WHERE name = 'Win Back';

-- Set specific exclude for considering
UPDATE smart_banners SET exclude_paths = '{/vaca-mgmt,/admin,/auth,/free-estimate,/project-calculator}'
WHERE name = 'Returning - Considering';
