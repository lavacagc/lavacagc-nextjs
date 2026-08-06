-- Home Care DIY Kit - slice 1 schema.
--
-- A "product" is a piece of gear we recommend for a maintenance task the member
-- can do themselves. It carries an Amazon ASIN and nothing else about Amazon:
-- the Associates tag is appended at RENDER time from AMAZON_ASSOCIATES_TAG, so
-- rotating the tag, or adding a second storefront, is a config change and never
-- a data migration. No row in this schema may contain a finished affiliate URL.
--
-- Deny-by-default, exactly like home_records and proposals: RLS is ENABLED with
-- NO policies, so the publishable/anon key can neither read nor write. Every
-- read is server-side under SUPABASE_SECRET_KEY. There is nothing secret about a
-- product recommendation, but the shelf is composed server-side anyway and a
-- public grant would be a standing invitation for the next writer to reach for
-- the browser client. Do NOT add a permissive anon policy here.
--
-- Every revision of this file is applied to a throwaway local Postgres and its
-- constraints exercised there before that revision is called finished: an ASIN
-- of ten upper-case alphanumerics accepted and a lower-case, short, long or
-- punctuated one rejected, a product refused activation with an empty images
-- array and accepted the moment one is present, a price band and image source
-- outside their vocabularies rejected, a link_status outside its own rejected, a
-- negative fail_count rejected, a task link accepted twice for one product only
-- as a conflict, a click row surviving its product's deletion refused (it
-- cascades instead), and an UPDATE that names no timestamp still moving
-- updated_at past created_at. The PR's Supabase Preview check then replays every
-- migration on a real database before merge, and production is hand-applied.
--
-- Nothing here is created behind an existence guard, for the reason the
-- proposals migration sets out at length: a guard asks whether the NAME exists
-- and cannot see that the SHAPE moved on. Re-applying this file is meant to fail
-- loudly. Once it has landed in a database that KEEPS it, it is frozen, and
-- every further change goes in a new migration with a later timestamp.

CREATE TABLE public.home_care_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Amazon's product identifier, and the ONLY thing we store about the listing.
  -- Ten characters of upper-case alphanumeric is Amazon's recipe; the parse
  -- route upper-cases before it writes, because Amazon's URLs are case-tolerant
  -- and the identifier is not. CHECKed rather than merely documented: this
  -- column composes an outbound link on a customer-facing page, and a malformed
  -- one fails as a 404 at Amazon rather than as an error anywhere we would see.
  asin          TEXT NOT NULL UNIQUE
                CONSTRAINT home_care_products_asin_recipe
                CHECK (asin ~ '^[A-Z0-9]{10}$'),
  -- Ours, not Amazon's 200-character SEO title. The parse route pre-fills it
  -- from the listing and the owner trims it to something that fits a card.
  display_name  TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  brand         TEXT,
  -- The one line of editorial under the name: why THIS one. Optional, because a
  -- product can be stocked in a hurry and written up later.
  pitch         TEXT,
  -- Storage paths inside the home-care-products bucket, in display order.
  -- images->>0 is the card image. A jsonb array rather than a child table: the
  -- set is small, bounded by the parse route at five, always read whole, and
  -- never queried across products.
  images        JSONB NOT NULL DEFAULT '[]'::jsonb
                CONSTRAINT home_care_products_images_is_array
                CHECK (jsonb_typeof(images) = 'array'),
  -- Where the images came from, so a later PA-API backfill can find the ones
  -- worth replacing without re-fetching everything.
  image_source  TEXT CONSTRAINT home_care_products_image_source
                CHECK (image_source IS NULL OR image_source IN ('pa_api', 'listing', 'manual')),
  -- A BAND, never a price. Amazon permits live prices only through the Product
  -- Advertising API and requires them kept fresh; a hardcoded price is stale the
  -- week after it is typed and is the member's first reason to distrust the
  -- shelf. Owner decision D3.
  price_band    TEXT NOT NULL
                CONSTRAINT home_care_products_price_band
                CHECK (price_band IN ('under_25', '25_50', '50_100', '100_plus')),
  category      TEXT CONSTRAINT home_care_products_category
                CHECK (category IS NULL OR category IN ('tool', 'consumable', 'safety', 'monitor')),
  -- Draft by default, and deliberately so. The whole curation rule is that
  -- nothing reaches a member until somebody puts it there (owner decision D5),
  -- and a default of true says the opposite: it makes "live" what a writer gets
  -- for not thinking about it. It also makes the minimal INSERT - asin, name,
  -- band - fail against the image rule below rather than land as a draft, which
  -- is a confusing first encounter with this table for whatever writes it next.
  active        BOOLEAN NOT NULL DEFAULT false,
  -- Link rot, tracked here and acted on by the weekly cron in slice 2. Three
  -- states rather than a boolean because Amazon rate-limits datacenter IPs: a
  -- checker that cannot tell "delisted" from "we were blocked" marks good
  -- products dead on a bad afternoon and silently empties the shelves.
  link_status   TEXT NOT NULL DEFAULT 'ok'
                CONSTRAINT home_care_products_link_status
                CHECK (link_status IN ('ok', 'suspect', 'gone')),
  fail_count    INT NOT NULL DEFAULT 0 CHECK (fail_count >= 0),
  checked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A live product has a picture. This is the one rule that could not be left to
  -- the UI: the shelf is a row of image cards, and a card with an empty frame is
  -- the single thing that makes the whole feature read as broken rather than as
  -- unfinished. Drafting is still possible - save with no image, stay inactive,
  -- come back with a photo - which is exactly what the fetch-was-blocked path
  -- needs (AC7). Written as an implication so it constrains only activation.
  CONSTRAINT home_care_products_active_needs_image
    CHECK (NOT active OR jsonb_array_length(images) > 0)
);

-- updated_at is maintained here, not asked of every writer. A DEFAULT fires once
-- at INSERT, so without this the column reads as authoritative while staying
-- equal to created_at for the life of the row, and the admin list sorts an
-- edited product as untouched. Same argument as proposals_set_updated_at.
CREATE FUNCTION public.home_care_products_set_updated_at() RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = ''
  AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$;

CREATE TRIGGER home_care_products_set_updated_at
  BEFORE UPDATE ON public.home_care_products
  FOR EACH ROW
  EXECUTE FUNCTION public.home_care_products_set_updated_at();

-- Which shelves a product sits on. Many-to-many on purpose: a shop vac serves
-- the condensate line and the dryer vent, and the owner's rule is that adding it
-- to a second task LINKS it rather than copying it, so fixing a dead ASIN or a
-- typo fixes it everywhere at once (AC8).
--
-- task_key is maintenance_catalog.key. There is deliberately no foreign key: the
-- catalog is edited as data, rows are retired by flipping `active` rather than
-- by deletion, and a FK here would make a catalog cleanup fail against a shelf
-- nobody remembered. A link naming a task that no longer exists renders nothing,
-- because the checklist joins from the tasks it is already showing.
CREATE TABLE public.home_care_product_tasks (
  product_id  UUID NOT NULL REFERENCES public.home_care_products(id) ON DELETE CASCADE,
  task_key    TEXT NOT NULL CHECK (length(trim(task_key)) > 0),
  -- The owner's drag order within one task's shelf.
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, task_key)
);

-- The checklist page asks this table the other way round from its primary key -
-- "which products for these task keys" - once per page load, for every member.
CREATE INDEX idx_home_care_product_tasks_task ON public.home_care_product_tasks (task_key, sort_order);

-- Taps, counted, with nothing on the row that says WHO tapped.
--
-- There is no homeowner_id column, no session column and no IP column, and that
-- is the point rather than an omission: the on-page disclosure the owner
-- approved says "we count taps, not who tapped", and a schema with nowhere to
-- put a person is the only version of that sentence that stays true after the
-- next feature. Person-level counts would pull this feature into the GPC
-- suppression path, the preference center and the deletion path for one
-- capability (newsletter segmentation) nobody has asked for. Owner decision D8.
--
-- Written by the slice 2 route. The table ships now so the disclosure copy and
-- the storage cannot drift apart between slices.
CREATE TABLE public.home_care_product_clicks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES public.home_care_products(id) ON DELETE CASCADE,
  task_key    TEXT,
  surface     TEXT NOT NULL
              CONSTRAINT home_care_product_clicks_surface
              CHECK (surface IN ('checklist', 'guide', 'toolkit')),
  clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The admin's "clicks in the last 30 days" column groups by product over a
-- window, which is this index read backwards.
CREATE INDEX idx_home_care_product_clicks_product ON public.home_care_product_clicks (product_id, clicked_at DESC);

ALTER TABLE public.home_care_products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_care_product_tasks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_care_product_clicks ENABLE ROW LEVEL SECURITY;

-- Product photos, copied out of Amazon's listing into storage we control.
--
-- Public, like blog-images and listings: these render on the member checklist
-- through next/image, whose remotePatterns already allow this project's storage
-- host. Copying rather than hotlinking is what keeps a card intact when Amazon
-- changes an image URL, and it is also the only way the images survive the
-- listing being delisted while the shelf is being repaired.
INSERT INTO storage.buckets (id, name, public) VALUES ('home-care-products', 'home-care-products', true);
