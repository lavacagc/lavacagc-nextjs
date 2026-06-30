-- La Vaca Home Care — newsletter dedup
-- Tracks when each homeowner last received a newsletter so the monthly cron
-- never double-sends within the same calendar month.
ALTER TABLE public.homeowners ADD COLUMN IF NOT EXISTS last_newsletter_at TIMESTAMPTZ;
