-- Forward fix-up: replay the DIY Kit schema onto a preview branch that lost it.
--
-- WHAT HAPPENED. This branch's migration was first written as
-- `20260828000000_home_care_diy_or_pro.sql`, a version `home_care_products` had
-- already spent on a sibling branch. Supabase keys
-- `supabase_migrations.schema_migrations` on the version alone, and a directory
-- listing puts `..._diy_or_pro.sql` ahead of `..._products.sql`, so the Preview
-- branch applied the diy_or_pro file first, recorded version 20260828000000 for
-- it, and then ran the products file into its own primary key:
--
--   ERROR: duplicate key value violates unique constraint "schema_migrations_pkey"
--   Key (version)=(20260828000000) already exists.  At statement: 11
--
-- Statement 11 is the history INSERT, i.e. the products file's own eleven
-- statements had all succeeded when the twelfth aborted the transaction. So the
-- whole of `home_care_products` rolled back while the version that would have
-- recorded it stayed on the branch, spent on the other file's SQL.
--
-- Renaming the file to `20260830000000` (which was the right fix, and must
-- stand) does not undo that. Preview branches are PERSISTENT and apply each
-- version exactly once, so `20260828000000_home_care_products.sql` now reads as
-- already applied and will never run again on that branch, and the next
-- migration in line failed instead:
--
--   ERROR: relation "public.home_care_products" does not exist (SQLSTATE 42P01)
--   At statement: 0   ALTER TABLE public.home_care_products ...
--
-- WHY A NEW FILE. Same reasoning as `00000000000001_preview_baseline_fixups`:
-- the branch cannot be talked into re-running a version it has recorded, so the
-- objects have to be re-created under a version it has NOT seen. Editing either
-- 20260828000000 or 20260829000000 would do nothing for the branch - both are
-- decided, one as applied and one as next - and both are frozen by the rule
-- 20260828000000 states at length.
--
-- WHY THIS VERSION NUMBER. 20260829000000 is the first migration that needs the
-- table, and it is the one erroring, so the replay has to land before it. It is
-- also strictly after 20260828000000, the last version the damaged branch
-- recorded, so nothing here is inserted behind applied history.
--
-- EVERYWHERE ELSE THIS IS A NO-OP. Production hand-applied 20260828000000 and a
-- fresh preview branch replays it in order, so every object below already
-- exists by the time this file runs; each statement is guarded and each is
-- written to be re-runnable, including against the partial state a rolled-back
-- transaction could in principle leave behind.
--
-- The definitions are a faithful copy of 20260828000000 - including
-- `price_band NOT NULL`, which 20260829000000 then drops, because a replay that
-- quietly pre-empted the next migration would leave the branch agreeing with
-- production by luck rather than by history. Read that file, not this one, for
-- why the schema is shaped the way it is; the comments here are only about the
-- replay. If the two ever disagree, 20260828000000 is the original.

CREATE TABLE IF NOT EXISTS public.home_care_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asin          TEXT NOT NULL UNIQUE
                CONSTRAINT home_care_products_asin_recipe
                CHECK (asin ~ '^[A-Z0-9]{10}$'),
  display_name  TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  brand         TEXT,
  pitch         TEXT,
  images        JSONB NOT NULL DEFAULT '[]'::jsonb
                CONSTRAINT home_care_products_images_is_array
                CHECK (jsonb_typeof(images) = 'array'),
  image_source  TEXT CONSTRAINT home_care_products_image_source
                CHECK (image_source IS NULL OR image_source IN ('pa_api', 'listing', 'manual')),
  price_band    TEXT NOT NULL
                CONSTRAINT home_care_products_price_band
                CHECK (price_band IN ('under_25', '25_50', '50_100', '100_plus')),
  category      TEXT CONSTRAINT home_care_products_category
                CHECK (category IS NULL OR category IN ('tool', 'consumable', 'safety', 'monitor')),
  active        BOOLEAN NOT NULL DEFAULT false,
  link_status   TEXT NOT NULL DEFAULT 'ok'
                CONSTRAINT home_care_products_link_status
                CHECK (link_status IN ('ok', 'suspect', 'gone')),
  fail_count    INT NOT NULL DEFAULT 0 CHECK (fail_count >= 0),
  checked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT home_care_products_active_needs_image
    CHECK (NOT active OR jsonb_array_length(images) > 0)
);

-- OR REPLACE rather than a guard: the body is the one below on every database
-- that has this function, so replacing it is the same as leaving it alone.
CREATE OR REPLACE FUNCTION public.home_care_products_set_updated_at() RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;

-- Guarded rather than DROP-then-CREATE, so a re-run never leaves even a
-- momentary window in which an UPDATE on a live table stops stamping
-- updated_at. Same shape as the constraint guard in 20260830000000.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.home_care_products'::regclass
       AND tgname = 'home_care_products_set_updated_at'
  ) THEN
    CREATE TRIGGER home_care_products_set_updated_at
      BEFORE UPDATE ON public.home_care_products
      FOR EACH ROW
      EXECUTE FUNCTION public.home_care_products_set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.home_care_product_tasks (
  product_id  UUID NOT NULL REFERENCES public.home_care_products(id) ON DELETE CASCADE,
  task_key    TEXT NOT NULL CHECK (length(trim(task_key)) > 0),
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, task_key)
);

CREATE INDEX IF NOT EXISTS idx_home_care_product_tasks_task
  ON public.home_care_product_tasks (task_key, sort_order);

CREATE TABLE IF NOT EXISTS public.home_care_product_clicks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES public.home_care_products(id) ON DELETE CASCADE,
  task_key    TEXT,
  surface     TEXT NOT NULL
              CONSTRAINT home_care_product_clicks_surface
              CHECK (surface IN ('checklist', 'guide', 'toolkit')),
  clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_care_product_clicks_product
  ON public.home_care_product_clicks (product_id, clicked_at DESC);

-- Deny-by-default: RLS on, no policies, every read server-side under the secret
-- key. Enabling it twice is not an error, and leaving it off on the branch that
-- lost the tables would be the one difference here that matters.
ALTER TABLE public.home_care_products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_care_product_tasks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_care_product_clicks ENABLE ROW LEVEL SECURITY;

-- DO NOTHING rather than DO UPDATE, deliberately: a bucket somebody has since
-- made private stays private instead of being silently re-opened by a replay.
-- The row's id is its primary key, so that is the whole guard.
INSERT INTO storage.buckets (id, name, public)
VALUES ('home-care-products', 'home-care-products', true)
ON CONFLICT (id) DO NOTHING;
