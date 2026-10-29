-- Home Services request flow, sub bid requests, CTA tests and portfolio drafts.
-- Spec: docs/home-services/spec-website-build.md. Decisions: docs/home-services/00-site-audit.md.
--
-- Everything here is additive. New tables get RLS enabled with NO policies, so
-- only the service role (server routes using SUPABASE_SECRET_KEY) can touch
-- them; the browser client never reads or writes them directly. The two
-- exceptions are called out inline.

-- ---------------------------------------------------------------------------
-- projects / project_images: production-only tables (dashboard-created). The
-- preview baseline creates project_images with an id column only and never
-- creates projects, so a local or preview replay has neither in usable form.
-- Create / extend them guarded, matching src/integrations/supabase/types.ts.
-- On production every statement here no-ops except the new status column.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS service_types text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 999;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS budget_range text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS challenge text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_first_name text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS date_completed date;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS duration text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS featured_image_id uuid;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS focus_keyword text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS materials_used text[];
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS solution text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS special_features text[];
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS testimonial_rating integer;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS testimonial_text text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS url_slug text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS projects_url_slug_key ON public.projects (url_slug) WHERE url_slug IS NOT NULL;

ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS project_id uuid;
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS image_category text;
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS alt_text text;
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS caption text;
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS file_size integer;
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS width integer;
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.project_images ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- The two FK names the app's PostgREST embeds rely on
-- (project_images!project_images_project_id_fkey, fk_projects_featured_image).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_images_project_id_fkey') THEN
    ALTER TABLE public.project_images
      ADD CONSTRAINT project_images_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_featured_image') THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT fk_projects_featured_image
      FOREIGN KEY (featured_image_id) REFERENCES public.project_images(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Draft state. `active` stays the public-visibility switch every reader already
-- filters on; `status` is what the admin shows. Existing inactive rows were
-- archived by hand, so they keep that meaning.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('draft', 'published', 'archived'));
UPDATE public.projects SET status = 'archived' WHERE active = false AND status = 'published';
-- Where the draft came from: the admin form or the ingest API (Claude Code).
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'admin';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS published_at timestamptz;
CREATE INDEX IF NOT EXISTS projects_status_idx ON public.projects (status);

-- Storage bucket for portfolio media (production has it; local replays do not).
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-images', 'project-images', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Home services requests: one row per request, keyed to the leads row that the
-- existing sanitizer/scorer/alert pipeline created for it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.home_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  -- held: phone not yet verified (only when SMS is configured). new: ready for Alex.
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('held', 'new', 'contacted', 'bid_sent', 'assigned', 'won', 'lost')),
  -- Catalog slugs from src/lib/home-services/catalog.ts, e.g. {'gutter-cleaning'}.
  services text[] NOT NULL DEFAULT '{}',
  -- { "<slug>": { "<question key>": "<option value>" } }
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  -- Contact and address are duplicated from leads so the admin list needs no join.
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  town text NOT NULL DEFAULT '',
  zip text NOT NULL DEFAULT '',
  in_service_area boolean NOT NULL DEFAULT true,
  timing text NOT NULL DEFAULT 'flexible' CHECK (timing IN ('this_week', 'two_weeks', 'flexible')),
  notes text NOT NULL DEFAULT '',
  consent_sms boolean NOT NULL DEFAULT false,
  -- Attribution.
  source text NOT NULL DEFAULT 'direct',          -- ?src=craigslist etc.
  listing_id text,                                -- Craigslist / directory listing id
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  landing_path text,
  cta_variant_primary text,                       -- cta_variants.variant_key, e.g. 'B'
  cta_variant_secondary text,
  captcha_score numeric(4,3),
  -- Phone verification (one-time text code). Only used when SMS is configured.
  phone_verified boolean NOT NULL DEFAULT false,
  phone_verified_at timestamptz,
  verify_code_hash text,
  verify_expires_at timestamptz,
  verify_attempts integer NOT NULL DEFAULT 0,
  verify_sends integer NOT NULL DEFAULT 0,
  -- Duplicate merging: same normalised address + same service set within 24h.
  dedupe_key text,
  merged_count integer NOT NULL DEFAULT 0,
  -- Outcome.
  customer_price_cents integer,
  lost_reason text,
  won_at timestamptz,
  admin_notes text NOT NULL DEFAULT '',
  specnook_job_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS home_service_requests_status_idx ON public.home_service_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS home_service_requests_dedupe_idx ON public.home_service_requests (dedupe_key, created_at DESC);
CREATE INDEX IF NOT EXISTS home_service_requests_lead_idx ON public.home_service_requests (lead_id);
CREATE INDEX IF NOT EXISTS home_service_requests_cta_idx ON public.home_service_requests (cta_variant_primary);
ALTER TABLE public.home_service_requests ENABLE ROW LEVEL SECURITY;

-- Photos the homeowner attached. Uploaded before the request exists (screen 2
-- of the flow), bound to a draft token, then claimed by the request on submit.
-- A cron purges unclaimed rows and objects older than 48 hours.
CREATE TABLE IF NOT EXISTS public.lead_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.home_service_requests(id) ON DELETE CASCADE,
  draft_token text,
  storage_path text NOT NULL,                     -- within bucket service-request-photos
  content_type text NOT NULL,
  bytes integer NOT NULL,
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_photos_request_idx ON public.lead_photos (request_id);
CREATE INDEX IF NOT EXISTS lead_photos_draft_idx ON public.lead_photos (draft_token) WHERE request_id IS NULL;
ALTER TABLE public.lead_photos ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('service-request-photos', 'service-request-photos', false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Subs and bid requests.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  -- Trade keys from src/lib/home-services/catalog.ts (one service = one trade).
  trades text[] NOT NULL DEFAULT '{}',
  counties text[] NOT NULL DEFAULT '{}',           -- 'Essex', 'Morris', 'Bergen'
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  -- pending until approved in SpecNook (or by Alex locally while SpecNook has no API).
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
  specnook_sub_id text,
  insurance_expires_at date,
  hic_expires_at date,
  callback_count integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subs_status_idx ON public.subs (status);
ALTER TABLE public.subs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.job_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.home_service_requests(id) ON DELETE CASCADE,
  trade text NOT NULL,
  scope_summary text NOT NULL DEFAULT '',
  town text NOT NULL DEFAULT '',
  sub_pay_cents integer NOT NULL CHECK (sub_pay_cents > 0),
  customer_price_cents integer NOT NULL CHECK (customer_price_cents > 0),
  target_start date,
  target_end date,
  photo_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'expired', 'cancelled')),
  assigned_sub_id uuid REFERENCES public.subs(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  -- 'pending' until SpecNook accepts the push; 'sent' after; 'skipped' when unconfigured.
  specnook_push_status text NOT NULL DEFAULT 'pending' CHECK (specnook_push_status IN ('pending', 'sent', 'failed', 'skipped')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
CREATE INDEX IF NOT EXISTS job_offers_request_idx ON public.job_offers (request_id);
CREATE INDEX IF NOT EXISTS job_offers_status_idx ON public.job_offers (status, expires_at);
ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;

-- One row per sub an offer went to. The token is the sub's only credential on
-- /offer/<token>. A detail request pauses that sub's clock (paused_at set, then
-- expires_at extended by the pause when Alex answers).
CREATE TABLE IF NOT EXISTS public.offer_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.job_offers(id) ON DELETE CASCADE,
  sub_id uuid NOT NULL REFERENCES public.subs(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  email_status text NOT NULL DEFAULT 'pending',
  sms_status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  opened_at timestamptz,
  paused_at timestamptz,
  expires_at timestamptz NOT NULL,
  closed_reason text,                              -- 'taken', 'expired', 'cancelled'
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, sub_id)
);
CREATE INDEX IF NOT EXISTS offer_recipients_offer_idx ON public.offer_recipients (offer_id);
ALTER TABLE public.offer_recipients ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.offer_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.job_offers(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.offer_recipients(id) ON DELETE CASCADE,
  sub_id uuid NOT NULL REFERENCES public.subs(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('accept', 'counter', 'details', 'decline')),
  counter_cents integer CHECK (counter_cents IS NULL OR counter_cents > 0),
  note text NOT NULL DEFAULT '',
  decline_reason text CHECK (decline_reason IS NULL OR decline_reason IN ('pay_too_low', 'too_far', 'schedule', 'scope_unclear', 'other')),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{storage_path, content_type, bytes}]
  -- Counter: pending -> accepted (awaiting sub confirm) -> confirmed, or rejected / replied (new price).
  -- Details: pending -> replied. Accept/decline: recorded.
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'confirmed', 'rejected', 'replied', 'recorded')),
  admin_reply text,
  admin_reply_at timestamptz,
  admin_price_cents integer,
  admin_reply_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offer_responses_offer_idx ON public.offer_responses (offer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS offer_responses_inbox_idx ON public.offer_responses (status) WHERE status = 'pending';
ALTER TABLE public.offer_responses ENABLE ROW LEVEL SECURITY;

-- The follow-up call Alex makes after every decline, and what he learned.
CREATE TABLE IF NOT EXISTS public.decline_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.offer_responses(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.home_service_requests(id) ON DELETE CASCADE,
  sub_id uuid NOT NULL REFERENCES public.subs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  counter_cents integer,
  will_take boolean,
  reason_text text NOT NULL DEFAULT '',
  called_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decline_calls_open_idx ON public.decline_calls (status, created_at DESC);
ALTER TABLE public.decline_calls ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Homepage CTA tests.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cta_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  button text NOT NULL CHECK (button IN ('primary', 'secondary')),
  variant_key text NOT NULL CHECK (variant_key IN ('A', 'B', 'C', 'D', 'E', 'F', 'G')),
  wording text NOT NULL,
  subtext text,
  color text,                                      -- tailwind class set or hex; null = default
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (button, variant_key)
);
ALTER TABLE public.cta_variants ENABLE ROW LEVEL SECURITY;
-- Exception 1: the homepage reads active variants with the publishable key.
-- Wording of a public button is not sensitive.
DROP POLICY IF EXISTS "Public can read active CTA variants" ON public.cta_variants;
CREATE POLICY "Public can read active CTA variants"
  ON public.cta_variants FOR SELECT USING (active = true);

-- Views and clicks. Requests, valid leads and won jobs are read off
-- home_service_requests.cta_variant_* instead of being duplicated here.
CREATE TABLE IF NOT EXISTS public.cta_events (
  id bigserial PRIMARY KEY,
  button text NOT NULL CHECK (button IN ('primary', 'secondary')),
  variant_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('view', 'click')),
  visitor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cta_events_report_idx ON public.cta_events (button, variant_key, event_type);
CREATE UNIQUE INDEX IF NOT EXISTS cta_events_once_per_visitor ON public.cta_events (button, variant_key, event_type, visitor_id);
ALTER TABLE public.cta_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS cta_min_visitors integer NOT NULL DEFAULT 100;

-- Starter variants from the spec. Two live primary variants to begin with
-- (the build spec says start with two or three); the rest wait, inactive.
INSERT INTO public.cta_variants (button, variant_key, wording, subtext, active) VALUES
  ('primary',   'A', 'Explore My Service Options', 'Starting prices, firm quote from photos', true),
  ('primary',   'B', 'Get a Starting Price',       'Seven services, prices up front',          true),
  ('primary',   'C', 'See Services and Prices',    NULL,                                       false),
  ('primary',   'D', 'Request a Quote',            NULL,                                       false),
  ('primary',   'E', 'Start My Project',           NULL,                                       false),
  ('secondary', 'A', 'See Our Projects',           NULL,                                       true)
ON CONFLICT (button, variant_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- updated_at maintenance for the new tables.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['home_service_requests', 'subs', 'cta_variants', 'projects']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;
