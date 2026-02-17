-- Create referrals table for the referral program
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Referrer info
  referrer_name TEXT NOT NULL,
  referrer_email TEXT NOT NULL,
  referrer_phone TEXT NOT NULL,
  -- Friend info
  friend_name TEXT NOT NULL,
  friend_email TEXT NOT NULL,
  friend_phone TEXT NOT NULL,
  -- Project details
  project_type TEXT NOT NULL,
  message TEXT,
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'consultation_scheduled', 'converted', 'rewarded', 'expired')),
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for lookups
CREATE INDEX idx_referrals_referrer_email ON public.referrals (referrer_email);
CREATE INDEX idx_referrals_friend_email ON public.referrals (friend_email);
CREATE INDEX idx_referrals_status ON public.referrals (status);
CREATE INDEX idx_referrals_created_at ON public.referrals (created_at DESC);

-- Enable RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (public form submissions)
CREATE POLICY "Allow anonymous inserts" ON public.referrals
  FOR INSERT
  WITH CHECK (true);

-- Only authenticated users (admin) can read
CREATE POLICY "Allow authenticated reads" ON public.referrals
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_referrals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW
  EXECUTE FUNCTION update_referrals_updated_at();
