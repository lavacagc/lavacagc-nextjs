-- Create lead_events table for tracking phone clicks and other lead events
CREATE TABLE IF NOT EXISTS public.lead_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  page_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add index for faster queries
CREATE INDEX idx_lead_events_event_type ON public.lead_events(event_type);
CREATE INDEX idx_lead_events_created_at ON public.lead_events(created_at DESC);

-- Enable RLS
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

-- Allow inserts from anyone (anon role)
CREATE POLICY "Allow public inserts" ON public.lead_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only authenticated users can read
CREATE POLICY "Allow authenticated reads" ON public.lead_events
  FOR SELECT
  TO authenticated
  USING (true);

-- Add comment
COMMENT ON TABLE public.lead_events IS 'Tracks phone clicks and other lead generation events';
