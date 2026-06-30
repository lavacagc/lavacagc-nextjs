-- La Vaca Home Care — Phase 1
--
-- A no-login homeowner program: opt in with email + zip + home type, get a
-- personalized seasonal maintenance checklist, and book La Vaca for any task.
-- Identity mirrors the Buy + Remodel double-opt-in (verify token + signed
-- cookie), but as a SEPARATE table so the two programs stay independent.

-- ─── homeowners ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.homeowners (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    TEXT NOT NULL UNIQUE,
  first_name               TEXT,
  phone                    TEXT,
  zip                      TEXT,
  home_type                TEXT,           -- e.g. single_family, townhouse, condo, multi_family
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'active', 'unsubscribed')),
  verify_token             TEXT,
  verify_token_expires_at  TIMESTAMPTZ,
  unsubscribe_token        TEXT NOT NULL,
  verified_at              TIMESTAMPTZ,
  unsubscribed_at          TIMESTAMPTZ,
  last_seen_at             TIMESTAMPTZ,
  consent_ip               TEXT,
  consent_user_agent       TEXT,
  source                   TEXT DEFAULT 'home-care',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_homeowners_verify_token ON public.homeowners (verify_token);
CREATE INDEX IF NOT EXISTS idx_homeowners_unsub_token ON public.homeowners (unsubscribe_token);

-- ─── home_profiles ────────────────────────────────────────────────────────────
-- Progressive profiling: which systems the home has + their ages. Drives how the
-- generic seasonal checklist personalizes over time. One row per homeowner.
CREATE TABLE IF NOT EXISTS public.home_profiles (
  homeowner_id   UUID PRIMARY KEY REFERENCES public.homeowners(id) ON DELETE CASCADE,
  year_built     INTEGER,
  sqft           INTEGER,
  systems        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {hvac:true, sump_pump:false, deck:true, ...}
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── maintenance_catalog ──────────────────────────────────────────────────────
-- The task library. Each task maps to systems + seasons; pro/bookable tasks are
-- the conversion surface (each gets a "Book La Vaca" button).
CREATE TABLE IF NOT EXISTS public.maintenance_catalog (
  key            TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  blurb          TEXT NOT NULL,
  applies_to     TEXT[] NOT NULL DEFAULT ARRAY['all'],  -- system keys or 'all'
  seasons        TEXT[] NOT NULL,                        -- spring|summer|fall|winter
  frequency      TEXT NOT NULL DEFAULT 'seasonal',       -- seasonal|annual|quarterly
  diy_or_pro     TEXT NOT NULL DEFAULT 'either' CHECK (diy_or_pro IN ('diy', 'pro', 'either')),
  bookable       BOOLEAN NOT NULL DEFAULT FALSE,
  est_cost_low   INTEGER,
  est_cost_high  INTEGER,
  priority       INTEGER NOT NULL DEFAULT 5,
  resource_slug  TEXT,                                   -- optional link to a blog post
  active         BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── homeowner_maintenance ────────────────────────────────────────────────────
-- Per-homeowner task instances + status. Created when a checklist is generated.
CREATE TABLE IF NOT EXISTS public.homeowner_maintenance (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id   UUID NOT NULL REFERENCES public.homeowners(id) ON DELETE CASCADE,
  task_key       TEXT NOT NULL REFERENCES public.maintenance_catalog(key) ON DELETE CASCADE,
  season         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo', 'done', 'snoozed', 'booked')),
  completed_at   TIMESTAMPTZ,
  lead_id        UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT homeowner_maintenance_unique UNIQUE (homeowner_id, task_key, season)
);
CREATE INDEX IF NOT EXISTS idx_homeowner_maint_owner ON public.homeowner_maintenance (homeowner_id);

-- ─── seed the catalog (~22 NJ home tasks) ─────────────────────────────────────
INSERT INTO public.maintenance_catalog (key, title, blurb, applies_to, seasons, frequency, diy_or_pro, bookable, est_cost_low, est_cost_high, priority) VALUES
  ('clean_gutters', 'Clean gutters & downspouts', 'Clear leaves and debris so winter melt and spring rain drain away from your foundation.', ARRAY['all'], ARRAY['fall','spring'], 'seasonal', 'pro', TRUE, 150, 350, 9),
  ('hvac_ac_tuneup', 'Service the A/C before summer', 'A spring tune-up keeps cooling efficient and catches problems before the first heat wave.', ARRAY['hvac'], ARRAY['spring'], 'annual', 'pro', TRUE, 100, 250, 8),
  ('hvac_furnace_tuneup', 'Service the furnace/heating', 'A fall tune-up keeps heat reliable and safe through a NJ winter.', ARRAY['hvac'], ARRAY['fall'], 'annual', 'pro', TRUE, 100, 250, 9),
  ('replace_hvac_filter', 'Replace the HVAC filter', 'A fresh filter every few months protects the system and your air quality.', ARRAY['hvac','all'], ARRAY['spring','summer','fall','winter'], 'quarterly', 'diy', FALSE, NULL, NULL, 6),
  ('test_smoke_co', 'Test smoke & CO detectors', 'Press test on every alarm and swap batteries. Two minutes that matter most.', ARRAY['all'], ARRAY['spring','fall'], 'seasonal', 'diy', FALSE, NULL, NULL, 10),
  ('flush_water_heater', 'Flush the water heater', 'Draining sediment once a year extends the tank''s life and keeps hot water hot.', ARRAY['water_heater'], ARRAY['fall'], 'annual', 'pro', TRUE, 100, 200, 6),
  ('test_sump_pump', 'Test the sump pump', 'Pour water in the pit and confirm it kicks on before spring storms.', ARRAY['sump_pump'], ARRAY['spring'], 'annual', 'either', TRUE, 0, 150, 8),
  ('winterize_faucets', 'Shut off & drain outdoor faucets', 'Prevent burst pipes by draining hose bibs and irrigation before the first freeze.', ARRAY['all'], ARRAY['fall'], 'annual', 'either', TRUE, 0, 150, 9),
  ('clean_dryer_vent', 'Clean the dryer vent', 'Lint buildup is a top home-fire cause and makes the dryer work harder.', ARRAY['all'], ARRAY['fall'], 'annual', 'pro', TRUE, 100, 200, 7),
  ('seal_deck', 'Clean & seal the deck', 'Wash and reseal to protect the wood through another season of weather.', ARRAY['deck'], ARRAY['summer'], 'annual', 'pro', TRUE, 400, 1200, 5),
  ('chimney_inspect', 'Chimney inspection & sweep', 'Have the flue inspected and swept before you light the first fire.', ARRAY['fireplace'], ARRAY['fall'], 'annual', 'pro', TRUE, 150, 400, 6),
  ('roof_inspect', 'Inspect the roof', 'Look for lifted shingles, flashing gaps, and winter damage twice a year.', ARRAY['roof'], ARRAY['spring','fall'], 'seasonal', 'pro', TRUE, 0, 250, 7),
  ('caulk_windows', 'Re-caulk windows & doors', 'Seal gaps to cut drafts and energy bills before heating season.', ARRAY['windows','exterior'], ARRAY['fall'], 'annual', 'either', TRUE, 150, 500, 6),
  ('attic_check', 'Check attic insulation & ventilation', 'Proper insulation and airflow prevent ice dams and high winter bills.', ARRAY['all'], ARRAY['fall'], 'annual', 'pro', TRUE, 0, 300, 5),
  ('power_wash', 'Power-wash siding & walkways', 'Knock off a winter''s grime and spot any siding that needs attention.', ARRAY['exterior'], ARRAY['spring'], 'annual', 'pro', TRUE, 250, 600, 4),
  ('reseal_driveway', 'Seal-coat the driveway', 'A fresh seal-coat protects asphalt from cracks and water in the off-season.', ARRAY['driveway'], ARRAY['summer'], 'annual', 'pro', TRUE, 300, 800, 4),
  ('test_gfci', 'Test GFCI outlets', 'Press test/reset on kitchen, bath, and exterior outlets to confirm they trip.', ARRAY['all'], ARRAY['spring'], 'annual', 'diy', FALSE, NULL, NULL, 5),
  ('fridge_coils', 'Vacuum refrigerator coils', 'Dusty coils make the fridge run hot and waste energy.', ARRAY['all'], ARRAY['spring'], 'annual', 'diy', FALSE, NULL, NULL, 3),
  ('refresh_bath_caulk', 'Refresh bathroom caulk & grout', 'Re-seal tubs and showers to stop water getting behind tile.', ARRAY['all'], ARRAY['winter'], 'annual', 'either', TRUE, 150, 450, 4),
  ('water_shutoff', 'Find & test the main water shut-off', 'Know where it is and that it works before you ever need it in a hurry.', ARRAY['plumbing'], ARRAY['winter'], 'annual', 'diy', FALSE, NULL, NULL, 5),
  ('lawn_winterize', 'Winterize the sprinkler system', 'Blow out irrigation lines so they don''t freeze and crack.', ARRAY['lawn'], ARRAY['fall'], 'annual', 'pro', TRUE, 75, 200, 4),
  ('lawn_spring_prep', 'Spring lawn prep & aeration', 'Aerate, seed, and feed for a healthier lawn all season.', ARRAY['lawn'], ARRAY['spring'], 'annual', 'pro', TRUE, 150, 400, 3)
ON CONFLICT (key) DO NOTHING;

-- ─── RLS (service-role only; no public access) ────────────────────────────────
ALTER TABLE public.homeowners            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_catalog   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_maintenance ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.homeowners IS 'La Vaca Home Care opt-in homeowners (double opt-in, no login)';
COMMENT ON TABLE public.maintenance_catalog IS 'Seasonal home-maintenance task library powering the Home Care checklist';
