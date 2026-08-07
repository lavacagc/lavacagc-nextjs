-- Let a homeowner say who is doing each task, and let a DIY task be handed to us.
--
-- Hand-apply in the Supabase SQL editor. Idempotent.
--
-- THE GAP. `diy_or_pro` describes the WORK; nothing described the homeowner's
-- INTENT. On the checklist that produced two problems at once:
--
--   * All 18 tasks the catalog calls `diy` are `bookable = false`, so there was
--     no way at all to ask La Vaca to do one. The badge said DIY and that was
--     the end of the conversation.
--   * The 16 `either` tasks offered the gear shelf and the "add to request"
--     button simultaneously and committed to neither, so "What you'll need" was
--     shown to people who had already decided we should do it.
--
-- Two columns fix both: one saying a DIY task may ALSO be offered as a service,
-- one recording which way this homeowner went.

-- ---------------------------------------------------------------------------
-- 1. Which DIY tasks are worth offering as a service
-- ---------------------------------------------------------------------------
-- A SEPARATE column rather than flipping `bookable` on those 18 rows, because
-- `bookable` is not only a checklist flag: it drives the admin walk-in service
-- dropdown (`bookableCatalog`, src/lib/homecare/serviceIntake.ts) and the "Add
-- to your plan" CTA in the monthly newsletter. Flipping it would silently put
-- "Watch for settling cracks" in front of staff as a dispatchable job and sell
-- it in an email. `pro_optional` says only what it says.
ALTER TABLE public.maintenance_catalog
  ADD COLUMN IF NOT EXISTS pro_optional boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.maintenance_catalog.pro_optional IS
  'A diy task La Vaca will also do on request. Offers the homeowner a Pro choice on the checklist WITHOUT making the task bookable in the admin dropdown or the newsletter CTA.';

-- The owner's selection (2026-08-06), reviewed task by task. The five left out
-- are deliberate, not an oversight: three shut-off / meter locators and the
-- HVAC filter-size note are one-time orientation better sold as a single
-- walkthrough than as four line items, and "watch for settling cracks" is an
-- observation rather than a job anyone can be dispatched to do.
UPDATE public.maintenance_catalog
   SET pro_optional = true
 WHERE key IN (
   'flush_ac_condensate',
   'rinse_ac_condenser',
   'bath_fan_clean',
   'replace_hvac_filter',
   'fridge_coils',
   'summer_gutter_check',
   'wasp_nest_check',
   'washing_machine_hoses',
   'label_breaker_panel',
   'test_gfci',
   'test_smoke_co',
   'audit_alarms',
   'basement_humidity'
 );

-- ---------------------------------------------------------------------------
-- 2. Who this homeowner decided is doing it
-- ---------------------------------------------------------------------------
-- Same grain as `status`: one row per (homeowner, task, season), which is the
-- table's existing unique key. Per-season rather than per-task on purpose - a
-- member who did the gutters themselves in spring may well want us in autumn,
-- and every other per-task fact here already works this way.
--
-- NULL means undecided, and that is the state a card opens in: the gear shelf
-- appears only once someone has actually said they are doing it themselves.
ALTER TABLE public.homeowner_maintenance
  ADD COLUMN IF NOT EXISTS mode text;

COMMENT ON COLUMN public.homeowner_maintenance.mode IS
  'Who is doing this task: diy | pro | NULL for undecided. Drives whether the DIY Kit shelf renders and whether the task is on the consolidated request.';

-- Named so a re-run finds it. A CHECK rather than an enum because every other
-- constrained text column in this schema is a CHECK, and widening one later is
-- a single statement instead of a type migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.homeowner_maintenance'::regclass
       AND conname = 'homeowner_maintenance_mode_check'
  ) THEN
    ALTER TABLE public.homeowner_maintenance
      ADD CONSTRAINT homeowner_maintenance_mode_check
      CHECK (mode IS NULL OR mode IN ('diy', 'pro'));
  END IF;
END $$;

-- The checklist reads every row for one homeowner and season at once, which the
-- existing unique index already serves. No new index: `mode` is only ever read
-- alongside the row it sits on, never searched by.
