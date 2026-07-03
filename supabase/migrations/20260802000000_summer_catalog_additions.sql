-- Summer catalog additions: the summer tab had only 4 recurring all-stage
-- tasks (vs 14 spring / 17 fall). Adds 8 NJ-relevant summer tasks. Idempotent
-- via ON CONFLICT so the by-hand prod apply and a later db push both succeed.
-- applies_to values must be one of the 9 system toggle keys or the 7
-- universal keys (see src/lib/homecare/profile.ts) or the task is filtered
-- out for profiled homes.

INSERT INTO public.maintenance_catalog
  (key, title, blurb, applies_to, stages, seasons, frequency, diy_or_pro, bookable, est_cost_low, est_cost_high, priority, starter)
VALUES
  ('rinse_ac_condenser', 'Rinse the A/C condenser coils',
   'Cut power at the disconnect, then gently hose down the outdoor unit''s coils. A clogged coil makes the system work harder — and quit in a heatwave.',
   ARRAY['hvac'], ARRAY['all'], ARRAY['summer'], 'annual', 'diy', FALSE, NULL, NULL, 9, FALSE),
  ('flush_ac_condensate', 'Clear the A/C condensate drain line',
   'Pour a cup of distilled vinegar down the condensate line at the air handler. A clogged line overflows the drain pan — that''s a ceiling stain (or worse) in August.',
   ARRAY['hvac'], ARRAY['all'], ARRAY['summer'], 'annual', 'diy', FALSE, NULL, NULL, 8, FALSE),
  ('summer_gutter_check', 'Check gutters after big downpours',
   'Summer storms drop leaves, seed pods, and shingle grit fast. A ten-minute walk-around beats water backing up under the fascia.',
   ARRAY['gutters'], ARRAY['all'], ARRAY['summer'], 'quarterly', 'diy', FALSE, NULL, NULL, 8, FALSE),
  ('prune_trees_house', 'Trim branches off the roof & siding',
   'Branches touching the house are a highway for squirrels and carpenter ants — and a roof puncture waiting for the next thunderstorm.',
   ARRAY['exterior'], ARRAY['all'], ARRAY['summer'], 'annual', 'either', TRUE, NULL, NULL, 7, FALSE),
  ('washing_machine_hoses', 'Inspect washing-machine & icemaker hoses',
   'Rubber supply hoses fail from the inside out, and a burst one can dump hundreds of gallons. Braided stainless replacements are a cheap swap.',
   ARRAY['plumbing'], ARRAY['all'], ARRAY['summer'], 'annual', 'diy', FALSE, NULL, NULL, 7, FALSE),
  ('wasp_nest_check', 'Check eaves & decks for wasp nests',
   'Walk the eaves, soffits, shutters, and deck rails early in the season — while nests are golf-ball sized, not football sized.',
   ARRAY['exterior'], ARRAY['all'], ARRAY['summer'], 'annual', 'diy', FALSE, NULL, NULL, 6, FALSE),
  ('basement_humidity', 'Keep the basement under 60% humidity',
   'NJ summers push basements into mold territory. A cheap hygrometer plus a dehumidifier protects the framing, the finishes, and everything you store down there.',
   ARRAY['all'], ARRAY['all'], ARRAY['summer'], 'quarterly', 'diy', FALSE, NULL, NULL, 6, FALSE),
  ('bath_fan_clean', 'Clean bathroom exhaust fans',
   'A dust-choked fan can''t clear shower steam — and that''s how ceilings grow mildew. Pop the cover, vacuum the grille and blades, done.',
   ARRAY['all'], ARRAY['all'], ARRAY['summer'], 'annual', 'diy', FALSE, NULL, NULL, 5, FALSE)
ON CONFLICT (key) DO NOTHING;

-- Owner decision: dryer-vent cleaning is worth a semiannual cadence for heavy
-- laundry households (and the summer IG campaign references it) — show it in
-- summer as well as fall.
UPDATE public.maintenance_catalog
SET seasons = ARRAY['summer', 'fall']
WHERE key = 'clean_dryer_vent' AND NOT ('summer' = ANY(seasons));
