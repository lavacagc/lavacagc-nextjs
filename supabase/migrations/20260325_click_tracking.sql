CREATE TABLE IF NOT EXISTS click_tracking (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address text NOT NULL,
  user_agent text,
  gclid text,
  page_url text,
  referrer text,
  click_timestamp timestamptz DEFAULT now(),
  is_suspicious boolean DEFAULT false,
  fraud_reason text,
  session_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_click_tracking_ip ON click_tracking(ip_address);
CREATE INDEX idx_click_tracking_gclid ON click_tracking(gclid);
CREATE INDEX idx_click_tracking_timestamp ON click_tracking(click_timestamp);

-- RLS: allow anon inserts for tracking, admin reads
ALTER TABLE click_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon inserts" ON click_tracking FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow admin reads" ON click_tracking FOR SELECT USING (true);
