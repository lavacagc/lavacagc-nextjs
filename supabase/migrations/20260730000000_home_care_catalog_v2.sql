-- La Vaca Home Care — catalog v2
--
-- (1) Widen the HIGH pro-estimate ~50% on straightforward services (keep the low
--     bound) so the range covers larger homes / bigger jobs.
-- (2) Strip BOTH bounds (→ no price shown) on tasks whose cost is too situational
--     to range: selling / pre-listing prep and the system add-ons (pool, septic,
--     garage). The checklist hides the estimate when both bounds are NULL.
-- (3) Add NJ-specific maintenance items — NO price (variable by home, materials,
--     and finish). applies_to uses only real system/UNIVERSAL keys so the tasks
--     actually surface after a home is profiled.

-- ── 1. Widen the high estimate (~50%) on the core straightforward services ────
UPDATE public.maintenance_catalog SET est_cost_high = 525  WHERE key = 'clean_gutters';
UPDATE public.maintenance_catalog SET est_cost_high = 375  WHERE key = 'hvac_ac_tuneup';
UPDATE public.maintenance_catalog SET est_cost_high = 375  WHERE key = 'hvac_furnace_tuneup';
UPDATE public.maintenance_catalog SET est_cost_high = 300  WHERE key = 'flush_water_heater';
UPDATE public.maintenance_catalog SET est_cost_high = 225  WHERE key = 'test_sump_pump';
UPDATE public.maintenance_catalog SET est_cost_high = 225  WHERE key = 'winterize_faucets';
UPDATE public.maintenance_catalog SET est_cost_high = 300  WHERE key = 'clean_dryer_vent';
UPDATE public.maintenance_catalog SET est_cost_high = 1800 WHERE key = 'seal_deck';
UPDATE public.maintenance_catalog SET est_cost_high = 600  WHERE key = 'chimney_inspect';
UPDATE public.maintenance_catalog SET est_cost_high = 375  WHERE key = 'roof_inspect';
UPDATE public.maintenance_catalog SET est_cost_high = 750  WHERE key = 'caulk_windows';
UPDATE public.maintenance_catalog SET est_cost_high = 450  WHERE key = 'attic_check';
UPDATE public.maintenance_catalog SET est_cost_high = 900  WHERE key = 'power_wash';
UPDATE public.maintenance_catalog SET est_cost_high = 1200 WHERE key = 'reseal_driveway';
UPDATE public.maintenance_catalog SET est_cost_high = 675  WHERE key = 'refresh_bath_caulk';
UPDATE public.maintenance_catalog SET est_cost_high = 300  WHERE key = 'lawn_winterize';
UPDATE public.maintenance_catalog SET est_cost_high = 600  WHERE key = 'lawn_spring_prep';
UPDATE public.maintenance_catalog SET est_cost_high = 525  WHERE key = 'rekey_locks';
UPDATE public.maintenance_catalog SET est_cost_high = 900  WHERE key = 'baseline_tuneup';
UPDATE public.maintenance_catalog SET est_cost_high = 675  WHERE key = 'nc_warranty_walkthrough';

-- ── 2. Strip pricing (both bounds NULL → no $ shown) on variable / quote tasks ─
UPDATE public.maintenance_catalog SET est_cost_low = NULL, est_cost_high = NULL
  WHERE key IN (
    'sell_curb_appeal', 'sell_quick_repairs', 'sell_pre_inspection',  -- selling / pre-listing
    'pool_open', 'pool_close', 'septic_pump', 'garage_door_service'   -- system add-ons
  );

-- ── 3. New NJ-specific maintenance items (no price — variable by home) ─────────
INSERT INTO public.maintenance_catalog
  (key, title, blurb, applies_to, stages, seasons, frequency, diy_or_pro, bookable, est_cost_low, est_cost_high, priority, starter)
VALUES
  ('ice_dam_check', 'Check for ice dams & heat cables',
   'After heavy snow, look for ice building at the roof edge — a sign of heat escaping the attic. We can add heat cables or fix the insulation and ventilation behind it.',
   ARRAY['roof'], ARRAY['all'], ARRAY['winter'], 'annual', 'either', TRUE, NULL, NULL, 6, FALSE),
  ('radon_test', 'Test for radon',
   'New Jersey has some of the highest radon levels in the country. Pick up a test kit, or have us test — and handle mitigation if the levels come back high.',
   ARRAY['all'], ARRAY['all'], ARRAY['winter'], 'annual', 'either', TRUE, NULL, NULL, 6, FALSE),
  ('refinish_hardwood', 'Refresh or refinish hardwood floors',
   'Winter is the season to bring tired hardwood back to life — a screen-and-recoat, or a full refinish for floors that need it.',
   ARRAY['all'], ARRAY['all'], ARRAY['winter'], 'annual', 'pro', TRUE, NULL, NULL, 3, FALSE),
  ('drainage_check', 'Check grading & yard drainage',
   'Make sure the ground slopes away from the house and downspouts carry water clear of the foundation. We can regrade or add drainage wherever water pools.',
   ARRAY['all'], ARRAY['all'], ARRAY['spring'], 'annual', 'either', TRUE, NULL, NULL, 5, FALSE),
  ('sump_backup_test', 'Test the sump-pump battery backup',
   'A sump pump is only as good as its backup when the power goes out mid-storm. Test the battery — or add one — before spring storms.',
   ARRAY['sump_pump'], ARRAY['all'], ARRAY['spring'], 'annual', 'either', TRUE, NULL, NULL, 6, FALSE),
  ('trim_paint_touchup', 'Touch up exterior trim & paint',
   'Catch peeling or bare trim before the wood weathers. A summer touch-up protects it — or we can repaint the whole exterior.',
   ARRAY['exterior'], ARRAY['all'], ARRAY['summer'], 'annual', 'either', TRUE, NULL, NULL, 4, FALSE),
  ('generator_service', 'Service the standby generator',
   'If you have a whole-home standby generator, have it exercised and serviced before storm season so it starts the moment you need it.',
   ARRAY['all'], ARRAY['all'], ARRAY['fall'], 'annual', 'pro', TRUE, NULL, NULL, 4, FALSE),
  ('range_hood_service', 'Service the range hood & kitchen vents',
   'Clean or replace the range-hood filter and confirm it vents outside — important for air quality, and a smart check before any kitchen work.',
   ARRAY['all'], ARRAY['all'], ARRAY['fall'], 'annual', 'either', TRUE, NULL, NULL, 3, FALSE)
ON CONFLICT (key) DO NOTHING;
