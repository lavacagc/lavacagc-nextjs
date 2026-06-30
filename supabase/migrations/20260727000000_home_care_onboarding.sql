-- La Vaca Home Care — new-homeowner onboarding + starter essentials
--
-- Vet whether someone is new to homeownership so we can tailor the checklist
-- (first-timers get a one-time "New Homeowner Essentials" set), and seed those
-- foundational tasks.

-- Which kind of homeowner: 'first_time' | 'experienced' (null = unknown).
ALTER TABLE public.home_profiles ADD COLUMN IF NOT EXISTS homeowner_type TEXT;

-- Mark one-time "first-home essentials" tasks (shown to first-time homeowners,
-- independent of season).
ALTER TABLE public.maintenance_catalog ADD COLUMN IF NOT EXISTS starter BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO public.maintenance_catalog (key, title, blurb, applies_to, seasons, frequency, diy_or_pro, bookable, est_cost_low, est_cost_high, priority, starter) VALUES
  ('locate_water_shutoff', 'Find your main water shut-off', 'Know exactly where it is and how to turn it off — the single most useful thing to know in a plumbing emergency.', ARRAY['all'], ARRAY['spring','summer','fall','winter'], 'annual', 'diy', FALSE, NULL, NULL, 10, TRUE),
  ('find_gas_shutoff', 'Locate the gas shut-off & meter', 'Find your gas meter and shut-off valve, and keep a wrench nearby so you can act fast if you ever smell gas.', ARRAY['all'], ARRAY['spring','summer','fall','winter'], 'annual', 'diy', FALSE, NULL, NULL, 9, TRUE),
  ('label_breaker_panel', 'Map & label your breaker panel', 'Walk the house and label which breaker controls what. Saves you in an outage or before any electrical work.', ARRAY['all'], ARRAY['spring','summer','fall','winter'], 'annual', 'diy', FALSE, NULL, NULL, 7, TRUE),
  ('audit_alarms', 'Check every smoke & CO alarm', 'Test each alarm and note its age — replace any unit older than 10 years, and add CO alarms near sleeping areas if missing.', ARRAY['all'], ARRAY['spring','summer','fall','winter'], 'annual', 'diy', FALSE, NULL, NULL, 10, TRUE),
  ('know_hvac_filter', 'Note your HVAC filter size', 'Find the filter slot and write down the size so you can keep spares on hand and never skip a change.', ARRAY['hvac','all'], ARRAY['spring','summer','fall','winter'], 'annual', 'diy', FALSE, NULL, NULL, 6, TRUE),
  ('rekey_locks', 'Re-key or replace exterior locks', 'You never know who has a copy from the prior owner. Re-key or swap every exterior lock after you move in.', ARRAY['all'], ARRAY['spring','summer','fall','winter'], 'annual', 'either', TRUE, 100, 350, 8, TRUE),
  ('baseline_tuneup', 'Book a whole-home maintenance tune-up', 'Start fresh: we service the HVAC, flush the water heater, check the roof and gutters, and flag anything that needs attention — so you know exactly where your new home stands.', ARRAY['all'], ARRAY['spring','summer','fall','winter'], 'annual', 'pro', TRUE, 250, 600, 9, TRUE)
ON CONFLICT (key) DO NOTHING;
