-- La Vaca Home Care — homeowner stage + deeper personalization
--
-- Adds a richer "stage" (just_bought | established | new_construction | selling)
-- alongside the legacy homeowner_type, and lets catalog tasks target specific
-- stages (e.g. pre-listing tasks only for sellers). Also seeds system-specific
-- and stage-specific tasks so the expanded questionnaire has things to show.

-- Stage on the home profile (null = not chosen yet). homeowner_type is kept in
-- sync by the API for backward compatibility.
ALTER TABLE public.home_profiles ADD COLUMN IF NOT EXISTS stage TEXT;

-- Tasks can target stages. Default ARRAY['all'] = everyone; a task tagged with a
-- specific stage only shows for that stage (see filterTasksForProfile).
ALTER TABLE public.maintenance_catalog ADD COLUMN IF NOT EXISTS stages TEXT[] NOT NULL DEFAULT ARRAY['all'];

-- New-construction essentials (shown to new_construction stage as starters).
INSERT INTO public.maintenance_catalog (key, title, blurb, applies_to, stages, seasons, frequency, diy_or_pro, bookable, est_cost_low, est_cost_high, priority, starter) VALUES
  ('nc_settling_cracks', 'Watch for settling cracks', 'New homes settle in the first couple of years. Note any drywall or foundation cracks and photograph them so you can raise them under builder warranty before it expires.', ARRAY['all'], ARRAY['new_construction'], ARRAY['spring','summer','fall','winter'], 'annual', 'diy', FALSE, NULL, NULL, 8, TRUE),
  ('nc_warranty_walkthrough', 'Book an end-of-warranty walkthrough', 'Before your builder''s 1-year warranty lapses, have a pro walk the home and flag anything the builder should fix while it''s still covered.', ARRAY['all'], ARRAY['new_construction'], ARRAY['spring','summer','fall','winter'], 'annual', 'pro', TRUE, 200, 450, 9, TRUE)
ON CONFLICT (key) DO NOTHING;

-- Pre-listing tasks (only shown to the "selling" stage).
INSERT INTO public.maintenance_catalog (key, title, blurb, applies_to, stages, seasons, frequency, diy_or_pro, bookable, est_cost_low, est_cost_high, priority, starter) VALUES
  ('sell_curb_appeal', 'Refresh curb appeal', 'First impressions sell homes. Power-wash the exterior, touch up trim paint, mulch the beds, and make the front door pop.', ARRAY['exterior','all'], ARRAY['selling'], ARRAY['spring','summer','fall'], 'annual', 'either', TRUE, 300, 1500, 10, FALSE),
  ('sell_quick_repairs', 'Knock out quick-win repairs', 'Buyers notice the little things — leaky faucets, sticky doors, cracked caulk, burnt-out bulbs. We can handle a punch-list in one visit.', ARRAY['all'], ARRAY['selling'], ARRAY['spring','summer','fall','winter'], 'annual', 'pro', TRUE, 200, 800, 9, FALSE),
  ('sell_pre_inspection', 'Consider a pre-listing inspection', 'A pre-listing inspection surfaces what a buyer''s inspector will find, so there are no surprises that stall your sale. We can prioritize the fixes that matter.', ARRAY['all'], ARRAY['selling'], ARRAY['spring','summer','fall','winter'], 'annual', 'pro', TRUE, 300, 500, 8, FALSE)
ON CONFLICT (key) DO NOTHING;

-- System-specific seasonal tasks for the newly-asked systems (pool, septic, garage).
INSERT INTO public.maintenance_catalog (key, title, blurb, applies_to, stages, seasons, frequency, diy_or_pro, bookable, est_cost_low, est_cost_high, priority, starter) VALUES
  ('pool_open', 'Open the pool for the season', 'Uncover, balance the water, and get the pump and filter running before the first warm stretch so you''re swim-ready.', ARRAY['pool'], ARRAY['all'], ARRAY['spring'], 'annual', 'either', TRUE, 250, 600, 6, FALSE),
  ('pool_close', 'Winterize & close the pool', 'Balance, blow out the lines, and cover before the freeze so you don''t crack equipment or plumbing over winter.', ARRAY['pool'], ARRAY['all'], ARRAY['fall'], 'annual', 'either', TRUE, 250, 600, 6, FALSE),
  ('septic_pump', 'Have the septic tank pumped', 'Most septic tanks need pumping every 3–5 years. Staying ahead of it prevents backups and protects the drain field.', ARRAY['septic'], ARRAY['all'], ARRAY['spring','fall'], 'annual', 'pro', TRUE, 300, 600, 5, FALSE),
  ('garage_door_service', 'Service the garage door', 'Lubricate the rollers and hinges, test the auto-reverse safety, and check the springs. A little upkeep prevents a stuck door in the cold.', ARRAY['garage'], ARRAY['all'], ARRAY['fall'], 'annual', 'either', TRUE, 100, 250, 4, FALSE)
ON CONFLICT (key) DO NOTHING;
