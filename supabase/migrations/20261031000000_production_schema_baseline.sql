-- Production schema baseline: everything production has that no migration created.
--
-- Found 2026-10-31 while building the preview/staging database
-- (docs/home-care-audit.md): 26 tables (consent_logs among them, which the Home
-- Care signup writes), 44 columns, 8 functions, their constraints, indexes,
-- triggers, policies, grants, 4 storage buckets and 22 storage policies existed
-- only in production, created in the dashboard. A database built from
-- supabase/migrations alone could not run the site.
--
-- Generated with scripts/db/schema-drift.mjs from `supabase db dump -s public` of
-- production versus the same dump of a database built from these migrations.
-- Every statement is a no-op where the object already exists: CREATE ... IF NOT
-- EXISTS, ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE with production's own
-- definition, or a DO block guarded on the catalog. On production it changes
-- nothing (proven in BEGIN/ROLLBACK against production before merge).
--
-- Security note: some storage policies reproduced below grant writes to role
-- `public` (anonymous). They are copied as they are so previews behave like
-- production; tightening them is a separate, reviewed migration.
--
-- Rollback: none needed on production (no-op there). On a fresh database, drop
-- the 26 tables listed in docs/home-care-audit.md with CASCADE, drop the 44 added
-- columns, and delete the 4 bucket rows; or rebuild the database from scratch.


DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'app_role')) THEN
    EXECUTE 'CREATE TYPE "public"."app_role" AS ENUM (
    ''admin'',
    ''user''
)';
  END IF;
END $drift$;

CREATE OR REPLACE FUNCTION "public"."create_page_revision"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Insert a new revision
  INSERT INTO public.page_revisions (
    page_id,
    title,
    content,
    seo_data,
    version_number,
    created_by
  )
  SELECT 
    NEW.id,
    NEW.title,
    NEW.content,
    NEW.seo_data,
    COALESCE((
      SELECT MAX(version_number) + 1 
      FROM public.page_revisions 
      WHERE page_id = NEW.id
    ), 1),
    NEW.updated_by;
    
  -- Keep only the last 10 revisions per page
  DELETE FROM public.page_revisions
  WHERE page_id = NEW.id
  AND version_number <= (
    SELECT MAX(version_number) - 10
    FROM public.page_revisions
    WHERE page_id = NEW.id
  );
  
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."create_page_revision"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."delete_old_leads"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.leads
  WHERE created_at < NOW() - INTERVAL '2 years';
END;
$$;

ALTER FUNCTION "public"."delete_old_leads"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."generate_confirmation_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.confirmation_number := 'OPT-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 10));
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."generate_confirmation_number"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."generate_project_slug"("project_title" "text", "project_location" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 1;
BEGIN
  -- Create base slug from title and location
  base_slug := lower(trim(project_title || '-' || project_location));
  base_slug := regexp_replace(base_slug, '[^a-z0-9\s-]', '', 'g');
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(base_slug, '-');
  
  final_slug := base_slug;
  
  -- Check for uniqueness and append counter if needed
  WHILE EXISTS (SELECT 1 FROM public.projects WHERE url_slug = final_slug) LOOP
    final_slug := base_slug || '-' || counter;
    counter := counter + 1;
  END LOOP;
  
  RETURN final_slug;
END;
$$;

ALTER FUNCTION "public"."generate_project_slug"("project_title" "text", "project_location" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_gmb_config_safe"() RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  config_data json;
BEGIN
  -- Only return non-sensitive fields, never return access_token or refresh_token
  SELECT json_build_object(
    'id', id,
    'account_id', account_id,
    'location_id', location_id,
    'business_name', business_name,
    'last_sync', last_sync,
    'token_expires_at', token_expires_at,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO config_data
  FROM public.gmb_config
  LIMIT 1;
  
  RETURN config_data;
END;
$$;

ALTER FUNCTION "public"."get_gmb_config_safe"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION "public"."sync_google_reviews"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  log_id UUID;
BEGIN
  -- Create log entry
  INSERT INTO public.review_sync_log (status, triggered_by)
  VALUES ('running', 'cron')
  RETURNING id INTO log_id;

  -- Call the edge function
  PERFORM net.http_post(
    url := 'https://xrvbrnrbnyfdwkfdoepq.supabase.co/functions/v1/google-my-business/sync-reviews',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhydmJybnJibnlmZHdrZmRvZXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NzIyNTAsImV4cCI6MjA3NDM0ODI1MH0.TL9cUCyaApPjWl8YEW455JgCUSa6S2qsoRpZ8iATl10'
    ),
    body := '{}'::jsonb
  );

  -- Update log as completed
  UPDATE public.review_sync_log
  SET status = 'success', completed_at = now()
  WHERE id = log_id;

EXCEPTION WHEN OTHERS THEN
  -- Log the error
  UPDATE public.review_sync_log
  SET status = 'error', 
      completed_at = now(),
      error_message = SQLERRM
  WHERE id = log_id;
END;
$$;

ALTER FUNCTION "public"."sync_google_reviews"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."ai_content_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prompt" "text" NOT NULL,
    "generated_content" "text" NOT NULL,
    "content_type" "text" NOT NULL,
    "prompt_category" "text",
    "tone" "text",
    "length_type" "text",
    "context_data" "jsonb",
    "blog_post_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."ai_content_history" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."ai_content_snippets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "category" "text",
    "tags" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."ai_content_snippets" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."analytics_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ga4_measurement_id" "text",
    "gtm_container_id" "text",
    "tracking_enabled" boolean DEFAULT true,
    "consent_mode_enabled" boolean DEFAULT false,
    "ip_anonymization" boolean DEFAULT true,
    "enhanced_ecommerce" boolean DEFAULT false,
    "custom_dimensions" "jsonb" DEFAULT '{}'::"jsonb",
    "privacy_settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."analytics_config" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."broken_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_type" "text" NOT NULL,
    "content_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "status_code" integer,
    "error_message" "text",
    "last_checked" timestamp with time zone DEFAULT "now"(),
    "resolved" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."broken_links" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."calculator_lead_selections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "estimate_lead_id" "uuid",
    "option_item_id" "uuid",
    "option_category_name" "text" NOT NULL,
    "option_item_name" "text" NOT NULL,
    "material_cost" numeric(10,2) NOT NULL,
    "labor_cost" numeric(10,2) NOT NULL,
    "total_cost" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."calculator_lead_selections" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."calculator_option_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_type_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0,
    "required" boolean DEFAULT false,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."calculator_option_categories" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."calculator_option_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "option_category_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "modifier_type" "text",
    "modifier_value" numeric(10,2),
    "material_cost" numeric(10,2) DEFAULT 0 NOT NULL,
    "labor_cost" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_cost" numeric(10,2) GENERATED ALWAYS AS (("material_cost" + "labor_cost")) STORED,
    "display_label" "text",
    "materials_list" "jsonb" DEFAULT '[]'::"jsonb",
    "labor_hours" numeric(6,2),
    "display_order" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "calculator_option_items_modifier_type_check" CHECK (("modifier_type" = ANY (ARRAY['additive'::"text", 'multiplicative'::"text", 'reductive'::"text", 'fixed'::"text"])))
);

ALTER TABLE "public"."calculator_option_items" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."calculator_project_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "base_price_per_sqft" numeric(10,2) DEFAULT 0 NOT NULL,
    "base_material_cost_per_sqft" numeric(10,2) DEFAULT 0 NOT NULL,
    "base_labor_cost_per_sqft" numeric(10,2) DEFAULT 0 NOT NULL,
    "min_sqft" integer DEFAULT 0 NOT NULL,
    "max_sqft" integer DEFAULT 999999 NOT NULL,
    "requires_pdf_upload" boolean DEFAULT false,
    "has_calculator_options" boolean DEFAULT true,
    "active" boolean DEFAULT true,
    "seasonal_multiplier" numeric(4,3) DEFAULT 1.000,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."calculator_project_types" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."consent_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "inet",
    "user_email" character varying(255),
    "user_phone" character varying(50),
    "terms_version" character varying(10) DEFAULT '2.0'::character varying,
    "privacy_version" character varying(10) DEFAULT '2.0'::character varying,
    "consent_type" character varying(100) NOT NULL,
    "tcpa_consent" boolean DEFAULT false,
    "terms_url" "text",
    "privacy_url" "text",
    "user_agent" "text",
    "consent_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."consent_logs" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."custom_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_name" "text" NOT NULL,
    "event_category" "text" NOT NULL,
    "event_action" "text" NOT NULL,
    "event_label" "text",
    "event_value" integer,
    "parameters" "jsonb" DEFAULT '{}'::"jsonb",
    "active" boolean DEFAULT true,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."custom_events" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."data_rights_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "details" "text",
    "ip_address" "inet",
    "user_agent" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "confirmation_number" "text" DEFAULT ((('DRR-'::"text" || EXTRACT(year FROM "now"())) || '-'::"text") || "lpad"(("floor"(("random"() * (1000000)::double precision)))::"text", 6, '0'::"text")),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "verified_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "admin_notes" "text",
    CONSTRAINT "data_rights_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['access'::"text", 'deletion'::"text", 'correction'::"text", 'portability'::"text", 'restriction'::"text"]))),
    CONSTRAINT "data_rights_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'processing'::"text", 'completed'::"text", 'rejected'::"text"])))
);

ALTER TABLE "public"."data_rights_requests" OWNER TO "postgres";

COMMENT ON TABLE "public"."data_rights_requests" IS 'Stores GDPR/CCPA data rights requests from users';

CREATE TABLE IF NOT EXISTS "public"."email_rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "endpoint" "text" NOT NULL,
    "count" integer DEFAULT 1,
    "last_reset" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."email_rate_limits" OWNER TO "postgres";

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "first_name" "text" NOT NULL;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "last_name" "text" NOT NULL;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "email" "text" NOT NULL;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "phone" "text" NOT NULL;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "street_address" "text" NOT NULL;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "city" "text" NOT NULL;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "state" "text" DEFAULT 'NJ'::"text" NOT NULL;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "zip_code" "text" NOT NULL;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "lead_source" "text";

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "project_timeline" "text";

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "marketing_consent" boolean DEFAULT false;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "best_contact_time" "text";

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "project_type_id" "uuid";

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "project_type_name" "text" NOT NULL;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "project_description" "text";

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "space_length" numeric(8,2);

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "space_width" numeric(8,2);

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "space_height" numeric(8,2);

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "square_footage" numeric(10,2);

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "total_material_cost" numeric(10,2);

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "total_labor_cost" numeric(10,2);

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "combined_total" numeric(10,2);

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "estimate_range_min" numeric(10,2);

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "estimate_range_max" numeric(10,2);

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "seasonal_multiplier_applied" numeric(4,3) DEFAULT 1.000;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "requires_manual_estimate" boolean DEFAULT false;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "manual_estimate_provided" numeric(10,2);

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "manual_estimate_notes" "text";

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "assessment_requested" boolean DEFAULT false;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "consultation_requested" boolean DEFAULT false;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "uploaded_images" "jsonb" DEFAULT '[]'::"jsonb";

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "uploaded_plans" "jsonb" DEFAULT '[]'::"jsonb";

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "lead_status" "text" DEFAULT 'new'::"text";

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "admin_notes" "text";

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT "now"();

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT "now"();

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "contacted_at" timestamp with time zone;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "converted_at" timestamp with time zone;

ALTER TABLE "public"."estimate_leads" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;

COMMENT ON COLUMN "public"."estimate_leads"."archived_at" IS 'Timestamp when the lead was archived. NULL means active, non-NULL means archived.';

CREATE TABLE IF NOT EXISTS "public"."gmb_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "text",
    "location_id" "text",
    "refresh_token" "text",
    "access_token" "text",
    "token_expires_at" timestamp with time zone,
    "business_name" "text",
    "last_sync" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."gmb_config" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."image_optimizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "original_url" "text" NOT NULL,
    "optimized_url" "text",
    "alt_text" "text",
    "file_size_original" integer,
    "file_size_optimized" integer,
    "compression_ratio" numeric(5,2),
    "content_type" "text",
    "content_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."image_optimizations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."material_estimates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "material_name" "text" NOT NULL,
    "estimated_quantity" numeric(10,2) NOT NULL,
    "unit" "text" NOT NULL,
    "notes" "text",
    "auto_generated" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."material_estimates" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."non_negotiables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_type_id" "uuid",
    "description" "text" NOT NULL,
    "applies_to_all" boolean DEFAULT false,
    "display_order" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."non_negotiables" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."opt_out_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "email" character varying(255) NOT NULL,
    "phone" character varying(50),
    "ca_resident" boolean DEFAULT true NOT NULL,
    "request_type" character varying(100) DEFAULT 'do_not_sell_share'::character varying,
    "status" character varying(50) DEFAULT 'pending'::character varying,
    "ip_address" "inet",
    "user_agent" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    "confirmation_number" character varying(50),
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE "public"."opt_out_requests" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."page_revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "jsonb" NOT NULL,
    "seo_data" "jsonb" DEFAULT '{}'::"jsonb",
    "version_number" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);

ALTER TABLE "public"."page_revisions" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "seo_data" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "pages_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);

ALTER TABLE "public"."pages" OWNER TO "postgres";

COMMENT ON COLUMN "public"."project_images"."media_type" IS 'Type of media file: image or video';

CREATE TABLE IF NOT EXISTS "public"."redirects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_url" "text" NOT NULL,
    "destination_url" "text" NOT NULL,
    "redirect_type" integer DEFAULT 301,
    "active" boolean DEFAULT true,
    "hit_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."redirects" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."review_sync_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "status" "text" NOT NULL,
    "reviews_synced" integer DEFAULT 0,
    "error_message" "text",
    "triggered_by" "text" DEFAULT 'cron'::"text"
);

ALTER TABLE "public"."review_sync_log" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."seo_analysis" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_type" "text" NOT NULL,
    "content_id" "uuid" NOT NULL,
    "analysis_data" "jsonb" NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "issues" "text"[],
    "suggestions" "text"[],
    "readability_score" integer DEFAULT 0,
    "keyword_density" numeric(5,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."seo_analysis" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."seo_metadata" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_type" "text" NOT NULL,
    "content_id" "uuid" NOT NULL,
    "meta_title" "text",
    "meta_description" "text",
    "meta_keywords" "text"[],
    "canonical_url" "text",
    "og_title" "text",
    "og_description" "text",
    "og_image" "text",
    "twitter_title" "text",
    "twitter_description" "text",
    "twitter_image" "text",
    "robots_directives" "text"[] DEFAULT ARRAY['index'::"text", 'follow'::"text"],
    "schema_markup" "jsonb",
    "focus_keyword" "text",
    "seo_score" integer DEFAULT 0,
    "auto_generated" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."seo_metadata" OWNER TO "postgres";

ALTER TABLE "public"."service_areas" ADD COLUMN IF NOT EXISTS "zip_code" "text";

ALTER TABLE "public"."service_areas" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT "now"() NOT NULL;

ALTER TABLE "public"."service_areas" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon_name" "text" NOT NULL,
    "features" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."services" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."site_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "section_key" "text" NOT NULL,
    "title" "text",
    "content" "text",
    "data" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."site_content" OWNER TO "postgres";

ALTER TABLE "public"."user_roles" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT "now"() NOT NULL;

ALTER TABLE "public"."user_roles" ADD COLUMN IF NOT EXISTS "created_by" "uuid";

CREATE TABLE IF NOT EXISTS "public"."warranty_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "address" "text",
    "city" "text",
    "zip_code" "text",
    "project_completion_date" "date",
    "original_project_type" "text",
    "issue_description" "text" NOT NULL,
    "urgency_level" "text",
    "preferred_contact_method" "text",
    "image_urls" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invoice_number" "text" DEFAULT ''::"text" NOT NULL
);

ALTER TABLE "public"."warranty_claims" OWNER TO "postgres";

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_content_history_pkey' AND conrelid = '"public"."ai_content_history"'::regclass) OR to_regclass('public."ai_content_history_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."ai_content_history"
    ADD CONSTRAINT "ai_content_history_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_content_snippets_pkey' AND conrelid = '"public"."ai_content_snippets"'::regclass) OR to_regclass('public."ai_content_snippets_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."ai_content_snippets"
    ADD CONSTRAINT "ai_content_snippets_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analytics_config_pkey' AND conrelid = '"public"."analytics_config"'::regclass) OR to_regclass('public."analytics_config_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."analytics_config"
    ADD CONSTRAINT "analytics_config_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_slug_key' AND conrelid = '"public"."blog_posts"'::regclass) OR to_regclass('public."blog_posts_slug_key"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."blog_posts"
    ADD CONSTRAINT "blog_posts_slug_key" UNIQUE ("slug")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broken_links_pkey' AND conrelid = '"public"."broken_links"'::regclass) OR to_regclass('public."broken_links_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."broken_links"
    ADD CONSTRAINT "broken_links_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calculator_lead_selections_pkey' AND conrelid = '"public"."calculator_lead_selections"'::regclass) OR to_regclass('public."calculator_lead_selections_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."calculator_lead_selections"
    ADD CONSTRAINT "calculator_lead_selections_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calculator_option_categories_pkey' AND conrelid = '"public"."calculator_option_categories"'::regclass) OR to_regclass('public."calculator_option_categories_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."calculator_option_categories"
    ADD CONSTRAINT "calculator_option_categories_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calculator_option_items_pkey' AND conrelid = '"public"."calculator_option_items"'::regclass) OR to_regclass('public."calculator_option_items_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."calculator_option_items"
    ADD CONSTRAINT "calculator_option_items_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calculator_project_types_name_key' AND conrelid = '"public"."calculator_project_types"'::regclass) OR to_regclass('public."calculator_project_types_name_key"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."calculator_project_types"
    ADD CONSTRAINT "calculator_project_types_name_key" UNIQUE ("name")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calculator_project_types_pkey' AND conrelid = '"public"."calculator_project_types"'::regclass) OR to_regclass('public."calculator_project_types_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."calculator_project_types"
    ADD CONSTRAINT "calculator_project_types_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consent_logs_pkey' AND conrelid = '"public"."consent_logs"'::regclass) OR to_regclass('public."consent_logs_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."consent_logs"
    ADD CONSTRAINT "consent_logs_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_events_pkey' AND conrelid = '"public"."custom_events"'::regclass) OR to_regclass('public."custom_events_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."custom_events"
    ADD CONSTRAINT "custom_events_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_rights_requests_pkey' AND conrelid = '"public"."data_rights_requests"'::regclass) OR to_regclass('public."data_rights_requests_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."data_rights_requests"
    ADD CONSTRAINT "data_rights_requests_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_rate_limits_email_endpoint_key' AND conrelid = '"public"."email_rate_limits"'::regclass) OR to_regclass('public."email_rate_limits_email_endpoint_key"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."email_rate_limits"
    ADD CONSTRAINT "email_rate_limits_email_endpoint_key" UNIQUE ("email", "endpoint")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_rate_limits_pkey' AND conrelid = '"public"."email_rate_limits"'::regclass) OR to_regclass('public."email_rate_limits_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."email_rate_limits"
    ADD CONSTRAINT "email_rate_limits_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gmb_config_pkey' AND conrelid = '"public"."gmb_config"'::regclass) OR to_regclass('public."gmb_config_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."gmb_config"
    ADD CONSTRAINT "gmb_config_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'image_optimizations_pkey' AND conrelid = '"public"."image_optimizations"'::regclass) OR to_regclass('public."image_optimizations_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."image_optimizations"
    ADD CONSTRAINT "image_optimizations_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_estimates_pkey' AND conrelid = '"public"."material_estimates"'::regclass) OR to_regclass('public."material_estimates_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."material_estimates"
    ADD CONSTRAINT "material_estimates_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'non_negotiables_pkey' AND conrelid = '"public"."non_negotiables"'::regclass) OR to_regclass('public."non_negotiables_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."non_negotiables"
    ADD CONSTRAINT "non_negotiables_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opt_out_requests_confirmation_number_key' AND conrelid = '"public"."opt_out_requests"'::regclass) OR to_regclass('public."opt_out_requests_confirmation_number_key"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."opt_out_requests"
    ADD CONSTRAINT "opt_out_requests_confirmation_number_key" UNIQUE ("confirmation_number")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opt_out_requests_pkey' AND conrelid = '"public"."opt_out_requests"'::regclass) OR to_regclass('public."opt_out_requests_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."opt_out_requests"
    ADD CONSTRAINT "opt_out_requests_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_revisions_pkey' AND conrelid = '"public"."page_revisions"'::regclass) OR to_regclass('public."page_revisions_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."page_revisions"
    ADD CONSTRAINT "page_revisions_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_pkey' AND conrelid = '"public"."pages"'::regclass) OR to_regclass('public."pages_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_slug_key' AND conrelid = '"public"."pages"'::regclass) OR to_regclass('public."pages_slug_key"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_slug_key" UNIQUE ("slug")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_url_slug_key' AND conrelid = '"public"."projects"'::regclass) OR to_regclass('public."projects_url_slug_key"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_url_slug_key" UNIQUE ("url_slug")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rate_limits_ip_address_key' AND conrelid = '"public"."rate_limits"'::regclass) OR to_regclass('public."rate_limits_ip_address_key"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_ip_address_key" UNIQUE ("ip_address")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'redirects_pkey' AND conrelid = '"public"."redirects"'::regclass) OR to_regclass('public."redirects_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."redirects"
    ADD CONSTRAINT "redirects_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'redirects_source_url_key' AND conrelid = '"public"."redirects"'::regclass) OR to_regclass('public."redirects_source_url_key"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."redirects"
    ADD CONSTRAINT "redirects_source_url_key" UNIQUE ("source_url")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'review_sync_log_pkey' AND conrelid = '"public"."review_sync_log"'::regclass) OR to_regclass('public."review_sync_log_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."review_sync_log"
    ADD CONSTRAINT "review_sync_log_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_analysis_content_unique' AND conrelid = '"public"."seo_analysis"'::regclass) OR to_regclass('public."seo_analysis_content_unique"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."seo_analysis"
    ADD CONSTRAINT "seo_analysis_content_unique" UNIQUE ("content_type", "content_id")';
  END IF;
END $drift$;

COMMENT ON CONSTRAINT "seo_analysis_content_unique" ON "public"."seo_analysis" IS 'Ensures each content item has only one SEO analysis record';

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_analysis_pkey' AND conrelid = '"public"."seo_analysis"'::regclass) OR to_regclass('public."seo_analysis_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."seo_analysis"
    ADD CONSTRAINT "seo_analysis_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_metadata_content_unique' AND conrelid = '"public"."seo_metadata"'::regclass) OR to_regclass('public."seo_metadata_content_unique"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."seo_metadata"
    ADD CONSTRAINT "seo_metadata_content_unique" UNIQUE ("content_type", "content_id")';
  END IF;
END $drift$;

COMMENT ON CONSTRAINT "seo_metadata_content_unique" ON "public"."seo_metadata" IS 'Ensures each content item has only one SEO metadata record';

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_metadata_pkey' AND conrelid = '"public"."seo_metadata"'::regclass) OR to_regclass('public."seo_metadata_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."seo_metadata"
    ADD CONSTRAINT "seo_metadata_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_pkey' AND conrelid = '"public"."services"'::regclass) OR to_regclass('public."services_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_content_pkey' AND conrelid = '"public"."site_content"'::regclass) OR to_regclass('public."site_content_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."site_content"
    ADD CONSTRAINT "site_content_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_content_section_key_key' AND conrelid = '"public"."site_content"'::regclass) OR to_regclass('public."site_content_section_key_key"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."site_content"
    ADD CONSTRAINT "site_content_section_key_key" UNIQUE ("section_key")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warranty_claims_pkey' AND conrelid = '"public"."warranty_claims"'::regclass) OR to_regclass('public."warranty_claims_pkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."warranty_claims"
    ADD CONSTRAINT "warranty_claims_pkey" PRIMARY KEY ("id")';
  END IF;
END $drift$;

CREATE INDEX IF NOT EXISTS "idx_broken_links_content" ON "public"."broken_links" USING "btree" ("content_type", "content_id");

CREATE INDEX IF NOT EXISTS "idx_calculator_lead_selections_lead" ON "public"."calculator_lead_selections" USING "btree" ("estimate_lead_id");

CREATE INDEX IF NOT EXISTS "idx_calculator_option_categories_project" ON "public"."calculator_option_categories" USING "btree" ("project_type_id");

CREATE INDEX IF NOT EXISTS "idx_calculator_option_items_category" ON "public"."calculator_option_items" USING "btree" ("option_category_id");

CREATE INDEX IF NOT EXISTS "idx_consent_email" ON "public"."consent_logs" USING "btree" ("user_email");

CREATE INDEX IF NOT EXISTS "idx_consent_timestamp" ON "public"."consent_logs" USING "btree" ("timestamp");

CREATE INDEX IF NOT EXISTS "idx_data_rights_requests_created_at" ON "public"."data_rights_requests" USING "btree" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_data_rights_requests_email" ON "public"."data_rights_requests" USING "btree" ("email");

CREATE INDEX IF NOT EXISTS "idx_data_rights_requests_status" ON "public"."data_rights_requests" USING "btree" ("status");

CREATE INDEX IF NOT EXISTS "idx_email_rate_limits_email_endpoint" ON "public"."email_rate_limits" USING "btree" ("email", "endpoint");

CREATE INDEX IF NOT EXISTS "idx_estimate_leads_archived_at" ON "public"."estimate_leads" USING "btree" ("archived_at") WHERE ("archived_at" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "idx_estimate_leads_created" ON "public"."estimate_leads" USING "btree" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_estimate_leads_created_at" ON "public"."estimate_leads" USING "btree" ("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_estimate_leads_email" ON "public"."estimate_leads" USING "btree" ("email");

CREATE INDEX IF NOT EXISTS "idx_estimate_leads_project_type" ON "public"."estimate_leads" USING "btree" ("project_type_id");

CREATE INDEX IF NOT EXISTS "idx_estimate_leads_status" ON "public"."estimate_leads" USING "btree" ("lead_status");

CREATE INDEX IF NOT EXISTS "idx_image_optimizations_content" ON "public"."image_optimizations" USING "btree" ("content_type", "content_id");

CREATE INDEX IF NOT EXISTS "idx_lead_events_type" ON "public"."lead_events" USING "btree" ("event_type");

CREATE INDEX IF NOT EXISTS "idx_leads_archived_at" ON "public"."leads" USING "btree" ("archived_at");

CREATE INDEX IF NOT EXISTS "idx_leads_created_at" ON "public"."leads" USING "btree" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_material_estimates_lead_id" ON "public"."material_estimates" USING "btree" ("lead_id");

CREATE INDEX IF NOT EXISTS "idx_non_negotiables_project_type" ON "public"."non_negotiables" USING "btree" ("project_type_id");

CREATE INDEX IF NOT EXISTS "idx_optout_email" ON "public"."opt_out_requests" USING "btree" ("email");

CREATE INDEX IF NOT EXISTS "idx_optout_status" ON "public"."opt_out_requests" USING "btree" ("status");

CREATE INDEX IF NOT EXISTS "idx_page_revisions_page_id" ON "public"."page_revisions" USING "btree" ("page_id");

CREATE INDEX IF NOT EXISTS "idx_page_revisions_version" ON "public"."page_revisions" USING "btree" ("page_id", "version_number" DESC);

CREATE INDEX IF NOT EXISTS "idx_pages_slug" ON "public"."pages" USING "btree" ("slug");

CREATE INDEX IF NOT EXISTS "idx_pages_status" ON "public"."pages" USING "btree" ("status");

CREATE INDEX IF NOT EXISTS "idx_project_images_category" ON "public"."project_images" USING "btree" ("image_category");

CREATE INDEX IF NOT EXISTS "idx_project_images_project_id" ON "public"."project_images" USING "btree" ("project_id");

CREATE INDEX IF NOT EXISTS "idx_project_images_sort" ON "public"."project_images" USING "btree" ("project_id", "sort_order");

CREATE INDEX IF NOT EXISTS "idx_projects_featured" ON "public"."projects" USING "btree" ("featured", "active", "sort_order");

CREATE INDEX IF NOT EXISTS "idx_projects_location" ON "public"."projects" USING "btree" ("location");

CREATE INDEX IF NOT EXISTS "idx_projects_service_types" ON "public"."projects" USING "gin" ("service_types");

CREATE INDEX IF NOT EXISTS "idx_projects_url_slug" ON "public"."projects" USING "btree" ("url_slug");

CREATE INDEX IF NOT EXISTS "idx_rate_limits_ip" ON "public"."rate_limits" USING "btree" ("ip_address");

CREATE INDEX IF NOT EXISTS "idx_rate_limits_last_reset" ON "public"."rate_limits" USING "btree" ("last_reset");

CREATE INDEX IF NOT EXISTS "idx_redirects_source_url" ON "public"."redirects" USING "btree" ("source_url");

CREATE INDEX IF NOT EXISTS "idx_seo_analysis_content" ON "public"."seo_analysis" USING "btree" ("content_type", "content_id");

CREATE INDEX IF NOT EXISTS "idx_seo_metadata_content" ON "public"."seo_metadata" USING "btree" ("content_type", "content_id");

CREATE OR REPLACE TRIGGER "create_page_revision_trigger" AFTER UPDATE ON "public"."pages" FOR EACH ROW EXECUTE FUNCTION "public"."create_page_revision"();

CREATE OR REPLACE TRIGGER "set_confirmation_number" BEFORE INSERT ON "public"."opt_out_requests" FOR EACH ROW EXECUTE FUNCTION "public"."generate_confirmation_number"();

CREATE OR REPLACE TRIGGER "update_ai_content_history_updated_at" BEFORE UPDATE ON "public"."ai_content_history" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_ai_content_snippets_updated_at" BEFORE UPDATE ON "public"."ai_content_snippets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_analytics_config_updated_at" BEFORE UPDATE ON "public"."analytics_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_blog_posts_updated_at" BEFORE UPDATE ON "public"."blog_posts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_calculator_option_categories_updated_at" BEFORE UPDATE ON "public"."calculator_option_categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_calculator_option_items_updated_at" BEFORE UPDATE ON "public"."calculator_option_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_calculator_project_types_updated_at" BEFORE UPDATE ON "public"."calculator_project_types" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_custom_events_updated_at" BEFORE UPDATE ON "public"."custom_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_estimate_leads_updated_at" BEFORE UPDATE ON "public"."estimate_leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_gmb_config_updated_at" BEFORE UPDATE ON "public"."gmb_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_google_reviews_updated_at" BEFORE UPDATE ON "public"."google_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_image_optimizations_updated_at" BEFORE UPDATE ON "public"."image_optimizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_pages_updated_at" BEFORE UPDATE ON "public"."pages" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_project_images_updated_at" BEFORE UPDATE ON "public"."project_images" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_projects_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_redirects_updated_at" BEFORE UPDATE ON "public"."redirects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_seo_analysis_updated_at" BEFORE UPDATE ON "public"."seo_analysis" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_seo_metadata_updated_at" BEFORE UPDATE ON "public"."seo_metadata" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_service_areas_updated_at" BEFORE UPDATE ON "public"."service_areas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_services_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_site_content_updated_at" BEFORE UPDATE ON "public"."site_content" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_warranty_claims_updated_at" BEFORE UPDATE ON "public"."warranty_claims" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calculator_lead_selections_estimate_lead_id_fkey' AND conrelid = '"public"."calculator_lead_selections"'::regclass) OR to_regclass('public."calculator_lead_selections_estimate_lead_id_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."calculator_lead_selections"
    ADD CONSTRAINT "calculator_lead_selections_estimate_lead_id_fkey" FOREIGN KEY ("estimate_lead_id") REFERENCES "public"."estimate_leads"("id") ON DELETE CASCADE';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calculator_lead_selections_option_item_id_fkey' AND conrelid = '"public"."calculator_lead_selections"'::regclass) OR to_regclass('public."calculator_lead_selections_option_item_id_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."calculator_lead_selections"
    ADD CONSTRAINT "calculator_lead_selections_option_item_id_fkey" FOREIGN KEY ("option_item_id") REFERENCES "public"."calculator_option_items"("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calculator_option_categories_project_type_id_fkey' AND conrelid = '"public"."calculator_option_categories"'::regclass) OR to_regclass('public."calculator_option_categories_project_type_id_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."calculator_option_categories"
    ADD CONSTRAINT "calculator_option_categories_project_type_id_fkey" FOREIGN KEY ("project_type_id") REFERENCES "public"."calculator_project_types"("id") ON DELETE CASCADE';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calculator_option_items_option_category_id_fkey' AND conrelid = '"public"."calculator_option_items"'::regclass) OR to_regclass('public."calculator_option_items_option_category_id_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."calculator_option_items"
    ADD CONSTRAINT "calculator_option_items_option_category_id_fkey" FOREIGN KEY ("option_category_id") REFERENCES "public"."calculator_option_categories"("id") ON DELETE CASCADE';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_leads_project_type_id_fkey' AND conrelid = '"public"."estimate_leads"'::regclass) OR to_regclass('public."estimate_leads_project_type_id_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."estimate_leads"
    ADD CONSTRAINT "estimate_leads_project_type_id_fkey" FOREIGN KEY ("project_type_id") REFERENCES "public"."calculator_project_types"("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_projects_featured_image' AND conrelid = '"public"."projects"'::regclass) OR to_regclass('public."fk_projects_featured_image"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "fk_projects_featured_image" FOREIGN KEY ("featured_image_id") REFERENCES "public"."project_images"("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_estimates_lead_id_fkey' AND conrelid = '"public"."material_estimates"'::regclass) OR to_regclass('public."material_estimates_lead_id_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."material_estimates"
    ADD CONSTRAINT "material_estimates_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."estimate_leads"("id") ON DELETE CASCADE';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'non_negotiables_project_type_id_fkey' AND conrelid = '"public"."non_negotiables"'::regclass) OR to_regclass('public."non_negotiables_project_type_id_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."non_negotiables"
    ADD CONSTRAINT "non_negotiables_project_type_id_fkey" FOREIGN KEY ("project_type_id") REFERENCES "public"."calculator_project_types"("id") ON DELETE CASCADE';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_revisions_created_by_fkey' AND conrelid = '"public"."page_revisions"'::regclass) OR to_regclass('public."page_revisions_created_by_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."page_revisions"
    ADD CONSTRAINT "page_revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'page_revisions_page_id_fkey' AND conrelid = '"public"."page_revisions"'::regclass) OR to_regclass('public."page_revisions_page_id_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."page_revisions"
    ADD CONSTRAINT "page_revisions_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_created_by_fkey' AND conrelid = '"public"."pages"'::regclass) OR to_regclass('public."pages_created_by_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pages_updated_by_fkey' AND conrelid = '"public"."pages"'::regclass) OR to_regclass('public."pages_updated_by_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_created_by_fkey' AND conrelid = '"public"."projects"'::regclass) OR to_regclass('public."projects_created_by_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_updated_by_fkey' AND conrelid = '"public"."projects"'::regclass) OR to_regclass('public."projects_updated_by_fkey"') IS NOT NULL) THEN
    EXECUTE 'ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id")';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'custom_events' AND policyname = 'Active custom events are publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Active custom events are publicly readable" ON "public"."custom_events" FOR SELECT USING (("active" = true))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calculator_option_categories' AND policyname = 'Active option categories are publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Active option categories are publicly readable" ON "public"."calculator_option_categories" FOR SELECT USING (("active" = true))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calculator_option_items' AND policyname = 'Active option items are publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Active option items are publicly readable" ON "public"."calculator_option_items" FOR SELECT USING (("active" = true))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calculator_project_types' AND policyname = 'Active project types are publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Active project types are publicly readable" ON "public"."calculator_project_types" FOR SELECT USING (("active" = true))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gmb_config' AND policyname = 'Admins can delete GMB config')) THEN
    EXECUTE 'CREATE POLICY "Admins can delete GMB config" ON "public"."gmb_config" FOR DELETE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gmb_config' AND policyname = 'Admins can insert GMB config')) THEN
    EXECUTE 'CREATE POLICY "Admins can insert GMB config" ON "public"."gmb_config" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'gmb_config' AND policyname = 'Admins can update GMB config')) THEN
    EXECUTE 'CREATE POLICY "Admins can update GMB config" ON "public"."gmb_config" FOR UPDATE TO "authenticated" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analytics_config' AND policyname = 'Analytics config is publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Analytics config is publicly readable" ON "public"."analytics_config" FOR SELECT USING (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calculator_lead_selections' AND policyname = 'Anyone can insert lead selections')) THEN
    EXECUTE 'CREATE POLICY "Anyone can insert lead selections" ON "public"."calculator_lead_selections" FOR INSERT WITH CHECK (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'estimate_leads' AND policyname = 'Anyone can submit estimate leads')) THEN
    EXECUTE 'CREATE POLICY "Anyone can submit estimate leads" ON "public"."estimate_leads" FOR INSERT WITH CHECK (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Anyone can submit leads')) THEN
    EXECUTE 'CREATE POLICY "Anyone can submit leads" ON "public"."leads" FOR INSERT WITH CHECK (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'warranty_claims' AND policyname = 'Anyone can submit warranty claims')) THEN
    EXECUTE 'CREATE POLICY "Anyone can submit warranty claims" ON "public"."warranty_claims" FOR INSERT WITH CHECK (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'data_rights_requests' AND policyname = 'Authenticated users can update')) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can update" ON "public"."data_rights_requests" FOR UPDATE TO "authenticated" USING (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'data_rights_requests' AND policyname = 'Authenticated users can view')) THEN
    EXECUTE 'CREATE POLICY "Authenticated users can view" ON "public"."data_rights_requests" FOR SELECT TO "authenticated" USING (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'blog_posts' AND policyname = 'Blog posts are publicly readable or admin viewable')) THEN
    EXECUTE 'CREATE POLICY "Blog posts are publicly readable or admin viewable" ON "public"."blog_posts" FOR SELECT USING ((("published" = true) OR "public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'data_rights_requests' AND policyname = 'Enable insert for everyone')) THEN
    EXECUTE 'CREATE POLICY "Enable insert for everyone" ON "public"."data_rights_requests" FOR INSERT WITH CHECK (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'google_reviews' AND policyname = 'Google reviews are publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Google reviews are publicly readable" ON "public"."google_reviews" FOR SELECT USING (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'image_optimizations' AND policyname = 'Image optimizations are publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Image optimizations are publicly readable" ON "public"."image_optimizations" FOR SELECT USING (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rate_limits' AND policyname = 'No public access to rate_limits')) THEN
    EXECUTE 'CREATE POLICY "No public access to rate_limits" ON "public"."rate_limits" USING (false)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'non_negotiables' AND policyname = 'Non-negotiables are publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Non-negotiables are publicly readable" ON "public"."non_negotiables" FOR SELECT USING (("active" = true))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'page_revisions' AND policyname = 'Only admins can create page revisions')) THEN
    EXECUTE 'CREATE POLICY "Only admins can create page revisions" ON "public"."page_revisions" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pages' AND policyname = 'Only admins can create pages')) THEN
    EXECUTE 'CREATE POLICY "Only admins can create pages" ON "public"."pages" FOR INSERT WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'estimate_leads' AND policyname = 'Only admins can delete estimate leads')) THEN
    EXECUTE 'CREATE POLICY "Only admins can delete estimate leads" ON "public"."estimate_leads" FOR DELETE USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calculator_lead_selections' AND policyname = 'Only admins can delete lead selections')) THEN
    EXECUTE 'CREATE POLICY "Only admins can delete lead selections" ON "public"."calculator_lead_selections" FOR DELETE USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Only admins can delete leads')) THEN
    EXECUTE 'CREATE POLICY "Only admins can delete leads" ON "public"."leads" FOR DELETE USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pages' AND policyname = 'Only admins can delete pages')) THEN
    EXECUTE 'CREATE POLICY "Only admins can delete pages" ON "public"."pages" FOR DELETE USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_content_history' AND policyname = 'Only admins can manage AI content history')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage AI content history" ON "public"."ai_content_history" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_content_snippets' AND policyname = 'Only admins can manage AI content snippets')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage AI content snippets" ON "public"."ai_content_snippets" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'google_reviews' AND policyname = 'Only admins can manage Google reviews')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage Google reviews" ON "public"."google_reviews" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'seo_analysis' AND policyname = 'Only admins can manage SEO analysis')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage SEO analysis" ON "public"."seo_analysis" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'seo_metadata' AND policyname = 'Only admins can manage SEO metadata')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage SEO metadata" ON "public"."seo_metadata" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analytics_config' AND policyname = 'Only admins can manage analytics config')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage analytics config" ON "public"."analytics_config" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'blog_posts' AND policyname = 'Only admins can manage blog posts')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage blog posts" ON "public"."blog_posts" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'broken_links' AND policyname = 'Only admins can manage broken links')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage broken links" ON "public"."broken_links" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'custom_events' AND policyname = 'Only admins can manage custom events')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage custom events" ON "public"."custom_events" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'image_optimizations' AND policyname = 'Only admins can manage image optimizations')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage image optimizations" ON "public"."image_optimizations" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'material_estimates' AND policyname = 'Only admins can manage material estimates')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage material estimates" ON "public"."material_estimates" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'non_negotiables' AND policyname = 'Only admins can manage non-negotiables')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage non-negotiables" ON "public"."non_negotiables" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calculator_option_categories' AND policyname = 'Only admins can manage option categories')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage option categories" ON "public"."calculator_option_categories" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calculator_option_items' AND policyname = 'Only admins can manage option items')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage option items" ON "public"."calculator_option_items" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_images' AND policyname = 'Only admins can manage project images')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage project images" ON "public"."project_images" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calculator_project_types' AND policyname = 'Only admins can manage project types')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage project types" ON "public"."calculator_project_types" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'Only admins can manage projects')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage projects" ON "public"."projects" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'redirects' AND policyname = 'Only admins can manage redirects')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage redirects" ON "public"."redirects" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'service_areas' AND policyname = 'Only admins can manage service areas')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage service areas" ON "public"."service_areas" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'services' AND policyname = 'Only admins can manage services')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage services" ON "public"."services" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_content' AND policyname = 'Only admins can manage site content')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage site content" ON "public"."site_content" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Only admins can manage user roles')) THEN
    EXECUTE 'CREATE POLICY "Only admins can manage user roles" ON "public"."user_roles" USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'estimate_leads' AND policyname = 'Only admins can update estimate leads')) THEN
    EXECUTE 'CREATE POLICY "Only admins can update estimate leads" ON "public"."estimate_leads" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Only admins can update leads')) THEN
    EXECUTE 'CREATE POLICY "Only admins can update leads" ON "public"."leads" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pages' AND policyname = 'Only admins can update pages')) THEN
    EXECUTE 'CREATE POLICY "Only admins can update pages" ON "public"."pages" FOR UPDATE USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")) WITH CHECK ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'seo_analysis' AND policyname = 'Only admins can view SEO analysis')) THEN
    EXECUTE 'CREATE POLICY "Only admins can view SEO analysis" ON "public"."seo_analysis" FOR SELECT USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'estimate_leads' AND policyname = 'Only admins can view estimate leads')) THEN
    EXECUTE 'CREATE POLICY "Only admins can view estimate leads" ON "public"."estimate_leads" FOR SELECT USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calculator_lead_selections' AND policyname = 'Only admins can view lead selections')) THEN
    EXECUTE 'CREATE POLICY "Only admins can view lead selections" ON "public"."calculator_lead_selections" FOR SELECT USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' AND policyname = 'Only admins can view leads')) THEN
    EXECUTE 'CREATE POLICY "Only admins can view leads" ON "public"."leads" FOR SELECT USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'material_estimates' AND policyname = 'Only admins can view material estimates')) THEN
    EXECUTE 'CREATE POLICY "Only admins can view material estimates" ON "public"."material_estimates" FOR SELECT USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'page_revisions' AND policyname = 'Only admins can view page revisions')) THEN
    EXECUTE 'CREATE POLICY "Only admins can view page revisions" ON "public"."page_revisions" FOR SELECT USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'review_sync_log' AND policyname = 'Only admins can view sync logs')) THEN
    EXECUTE 'CREATE POLICY "Only admins can view sync logs" ON "public"."review_sync_log" FOR SELECT USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'warranty_claims' AND policyname = 'Only admins can view warranty claims')) THEN
    EXECUTE 'CREATE POLICY "Only admins can view warranty claims" ON "public"."warranty_claims" FOR SELECT USING ("public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_images' AND policyname = 'Project images are publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Project images are publicly readable" ON "public"."project_images" FOR SELECT USING (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'Projects are publicly readable when active')) THEN
    EXECUTE 'CREATE POLICY "Projects are publicly readable when active" ON "public"."projects" FOR SELECT USING (("active" = true))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pages' AND policyname = 'Public can view published pages, admins can view all')) THEN
    EXECUTE 'CREATE POLICY "Public can view published pages, admins can view all" ON "public"."pages" FOR SELECT USING ((("status" = ''published''::"text") OR "public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'redirects' AND policyname = 'Redirects are publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Redirects are publicly readable" ON "public"."redirects" FOR SELECT USING (("active" = true))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'seo_metadata' AND policyname = 'SEO metadata is publicly readable')) THEN
    EXECUTE 'CREATE POLICY "SEO metadata is publicly readable" ON "public"."seo_metadata" FOR SELECT USING (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'service_areas' AND policyname = 'Service areas are publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Service areas are publicly readable" ON "public"."service_areas" FOR SELECT USING (("active" = true))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consent_logs' AND policyname = 'Service role can manage consent logs')) THEN
    EXECUTE 'CREATE POLICY "Service role can manage consent logs" ON "public"."consent_logs" TO "service_role" USING (true) WITH CHECK (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'opt_out_requests' AND policyname = 'Service role can manage opt-out requests')) THEN
    EXECUTE 'CREATE POLICY "Service role can manage opt-out requests" ON "public"."opt_out_requests" TO "service_role" USING (true) WITH CHECK (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'email_rate_limits' AND policyname = 'Service role only')) THEN
    EXECUTE 'CREATE POLICY "Service role only" ON "public"."email_rate_limits" USING (("auth"."role"() = ''service_role''::"text"))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'services' AND policyname = 'Services are publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Services are publicly readable" ON "public"."services" FOR SELECT USING (("active" = true))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'site_content' AND policyname = 'Site content is publicly readable')) THEN
    EXECUTE 'CREATE POLICY "Site content is publicly readable" ON "public"."site_content" FOR SELECT USING (true)';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Users can view their own roles')) THEN
    EXECUTE 'CREATE POLICY "Users can view their own roles" ON "public"."user_roles" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."has_role"("auth"."uid"(), ''admin''::"public"."app_role")))';
  END IF;
END $drift$;

ALTER TABLE "public"."ai_content_history" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."ai_content_snippets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."analytics_config" ENABLE ROW LEVEL SECURITY;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'projects' AND policyname = 'anon sees only active projects')) THEN
    EXECUTE 'CREATE POLICY "anon sees only active projects" ON "public"."projects" AS RESTRICTIVE FOR SELECT TO "anon" USING (("active" = true))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT (EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'project_images' AND policyname = 'anon sees only images of active projects')) THEN
    EXECUTE 'CREATE POLICY "anon sees only images of active projects" ON "public"."project_images" AS RESTRICTIVE FOR SELECT TO "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_images"."project_id") AND "p"."active"))))';
  END IF;
END $drift$;

ALTER TABLE "public"."blog_posts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."broken_links" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."calculator_lead_selections" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."calculator_option_categories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."calculator_option_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."calculator_project_types" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."consent_logs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."custom_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."data_rights_requests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."email_rate_limits" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."estimate_leads" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."gmb_config" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."image_optimizations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."material_estimates" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."non_negotiables" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."opt_out_requests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."page_revisions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."pages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."project_images" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."redirects" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."review_sync_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."seo_analysis" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."seo_metadata" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."service_areas" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."site_content" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."warranty_claims" ENABLE ROW LEVEL SECURITY;

GRANT ALL ON FUNCTION "public"."create_page_revision"() TO "anon";

GRANT ALL ON FUNCTION "public"."create_page_revision"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."create_page_revision"() TO "service_role";

GRANT ALL ON FUNCTION "public"."delete_old_leads"() TO "anon";

GRANT ALL ON FUNCTION "public"."delete_old_leads"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."delete_old_leads"() TO "service_role";

GRANT ALL ON FUNCTION "public"."generate_confirmation_number"() TO "anon";

GRANT ALL ON FUNCTION "public"."generate_confirmation_number"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."generate_confirmation_number"() TO "service_role";

GRANT ALL ON FUNCTION "public"."generate_project_slug"("project_title" "text", "project_location" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."generate_project_slug"("project_title" "text", "project_location" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."generate_project_slug"("project_title" "text", "project_location" "text") TO "service_role";

GRANT ALL ON FUNCTION "public"."get_gmb_config_safe"() TO "anon";

GRANT ALL ON FUNCTION "public"."get_gmb_config_safe"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."get_gmb_config_safe"() TO "service_role";

GRANT ALL ON FUNCTION "public"."sync_google_reviews"() TO "anon";

GRANT ALL ON FUNCTION "public"."sync_google_reviews"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."sync_google_reviews"() TO "service_role";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";

GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";

GRANT ALL ON TABLE "public"."ai_content_history" TO "anon";

GRANT ALL ON TABLE "public"."ai_content_history" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_content_history" TO "service_role";

GRANT ALL ON TABLE "public"."ai_content_snippets" TO "anon";

GRANT ALL ON TABLE "public"."ai_content_snippets" TO "authenticated";

GRANT ALL ON TABLE "public"."ai_content_snippets" TO "service_role";

GRANT ALL ON TABLE "public"."analytics_config" TO "anon";

GRANT ALL ON TABLE "public"."analytics_config" TO "authenticated";

GRANT ALL ON TABLE "public"."analytics_config" TO "service_role";

GRANT ALL ON TABLE "public"."broken_links" TO "anon";

GRANT ALL ON TABLE "public"."broken_links" TO "authenticated";

GRANT ALL ON TABLE "public"."broken_links" TO "service_role";

GRANT ALL ON TABLE "public"."calculator_lead_selections" TO "anon";

GRANT ALL ON TABLE "public"."calculator_lead_selections" TO "authenticated";

GRANT ALL ON TABLE "public"."calculator_lead_selections" TO "service_role";

GRANT ALL ON TABLE "public"."calculator_option_categories" TO "anon";

GRANT ALL ON TABLE "public"."calculator_option_categories" TO "authenticated";

GRANT ALL ON TABLE "public"."calculator_option_categories" TO "service_role";

GRANT ALL ON TABLE "public"."calculator_option_items" TO "anon";

GRANT ALL ON TABLE "public"."calculator_option_items" TO "authenticated";

GRANT ALL ON TABLE "public"."calculator_option_items" TO "service_role";

GRANT ALL ON TABLE "public"."calculator_project_types" TO "anon";

GRANT ALL ON TABLE "public"."calculator_project_types" TO "authenticated";

GRANT ALL ON TABLE "public"."calculator_project_types" TO "service_role";

GRANT ALL ON TABLE "public"."consent_logs" TO "anon";

GRANT ALL ON TABLE "public"."consent_logs" TO "authenticated";

GRANT ALL ON TABLE "public"."consent_logs" TO "service_role";

GRANT ALL ON TABLE "public"."custom_events" TO "anon";

GRANT ALL ON TABLE "public"."custom_events" TO "authenticated";

GRANT ALL ON TABLE "public"."custom_events" TO "service_role";

GRANT ALL ON TABLE "public"."data_rights_requests" TO "anon";

GRANT ALL ON TABLE "public"."data_rights_requests" TO "authenticated";

GRANT ALL ON TABLE "public"."data_rights_requests" TO "service_role";

GRANT ALL ON TABLE "public"."email_rate_limits" TO "anon";

GRANT ALL ON TABLE "public"."email_rate_limits" TO "authenticated";

GRANT ALL ON TABLE "public"."email_rate_limits" TO "service_role";

GRANT ALL ON TABLE "public"."gmb_config" TO "anon";

GRANT ALL ON TABLE "public"."gmb_config" TO "authenticated";

GRANT ALL ON TABLE "public"."gmb_config" TO "service_role";

GRANT ALL ON TABLE "public"."image_optimizations" TO "anon";

GRANT ALL ON TABLE "public"."image_optimizations" TO "authenticated";

GRANT ALL ON TABLE "public"."image_optimizations" TO "service_role";

GRANT ALL ON TABLE "public"."material_estimates" TO "anon";

GRANT ALL ON TABLE "public"."material_estimates" TO "authenticated";

GRANT ALL ON TABLE "public"."material_estimates" TO "service_role";

GRANT ALL ON TABLE "public"."non_negotiables" TO "anon";

GRANT ALL ON TABLE "public"."non_negotiables" TO "authenticated";

GRANT ALL ON TABLE "public"."non_negotiables" TO "service_role";

GRANT ALL ON TABLE "public"."opt_out_requests" TO "anon";

GRANT ALL ON TABLE "public"."opt_out_requests" TO "authenticated";

GRANT ALL ON TABLE "public"."opt_out_requests" TO "service_role";

GRANT ALL ON TABLE "public"."page_revisions" TO "anon";

GRANT ALL ON TABLE "public"."page_revisions" TO "authenticated";

GRANT ALL ON TABLE "public"."page_revisions" TO "service_role";

GRANT ALL ON TABLE "public"."pages" TO "anon";

GRANT ALL ON TABLE "public"."pages" TO "authenticated";

GRANT ALL ON TABLE "public"."pages" TO "service_role";

GRANT ALL ON TABLE "public"."redirects" TO "anon";

GRANT ALL ON TABLE "public"."redirects" TO "authenticated";

GRANT ALL ON TABLE "public"."redirects" TO "service_role";

GRANT ALL ON TABLE "public"."review_sync_log" TO "anon";

GRANT ALL ON TABLE "public"."review_sync_log" TO "authenticated";

GRANT ALL ON TABLE "public"."review_sync_log" TO "service_role";

GRANT ALL ON TABLE "public"."seo_analysis" TO "anon";

GRANT ALL ON TABLE "public"."seo_analysis" TO "authenticated";

GRANT ALL ON TABLE "public"."seo_analysis" TO "service_role";

GRANT ALL ON TABLE "public"."seo_metadata" TO "anon";

GRANT ALL ON TABLE "public"."seo_metadata" TO "authenticated";

GRANT ALL ON TABLE "public"."seo_metadata" TO "service_role";

GRANT ALL ON TABLE "public"."services" TO "anon";

GRANT ALL ON TABLE "public"."services" TO "authenticated";

GRANT ALL ON TABLE "public"."services" TO "service_role";

GRANT ALL ON TABLE "public"."site_content" TO "anon";

GRANT ALL ON TABLE "public"."site_content" TO "authenticated";

GRANT ALL ON TABLE "public"."site_content" TO "service_role";

GRANT ALL ON TABLE "public"."warranty_claims" TO "anon";

GRANT ALL ON TABLE "public"."warranty_claims" TO "authenticated";

GRANT ALL ON TABLE "public"."warranty_claims" TO "service_role";

-- Storage buckets that exist only in production (configuration, no objects).
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('warranty-images', 'warranty-images', false, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('blog-images', 'blog-images', true, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('calculator-pdfs', 'calculator-pdfs', false, 20971520) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('hero-videos', 'hero-videos', true, NULL) ON CONFLICT (id) DO NOTHING;

-- Storage policies that exist only in production, reproduced as they are (see the security note above).
DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can delete blog images') THEN
    EXECUTE 'CREATE POLICY "Admins can delete blog images" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = ''blog-images''::text) AND has_role(auth.uid(), ''admin''::app_role)))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can delete calculator PDFs') THEN
    EXECUTE 'CREATE POLICY "Admins can delete calculator PDFs" ON storage.objects FOR DELETE TO public USING (((bucket_id = ''calculator-pdfs''::text) AND has_role(auth.uid(), ''admin''::app_role)))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can delete project images') THEN
    EXECUTE 'CREATE POLICY "Admins can delete project images" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = ''project-images''::text) AND has_role(auth.uid(), ''admin''::app_role)))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can upload blog images') THEN
    EXECUTE 'CREATE POLICY "Admins can upload blog images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = ''blog-images''::text) AND has_role(auth.uid(), ''admin''::app_role)))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can upload project images') THEN
    EXECUTE 'CREATE POLICY "Admins can upload project images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = ''project-images''::text) AND has_role(auth.uid(), ''admin''::app_role)))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can view all calculator PDFs') THEN
    EXECUTE 'CREATE POLICY "Admins can view all calculator PDFs" ON storage.objects FOR SELECT TO public USING (((bucket_id = ''calculator-pdfs''::text) AND has_role(auth.uid(), ''admin''::app_role)))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can upload calculator PDFs') THEN
    EXECUTE 'CREATE POLICY "Anyone can upload calculator PDFs" ON storage.objects FOR INSERT TO public WITH CHECK ((bucket_id = ''calculator-pdfs''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can upload warranty images') THEN
    EXECUTE 'CREATE POLICY "Anyone can upload warranty images" ON storage.objects FOR INSERT TO public WITH CHECK ((bucket_id = ''warranty-images''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can view blog images') THEN
    EXECUTE 'CREATE POLICY "Anyone can view blog images" ON storage.objects FOR SELECT TO public USING ((bucket_id = ''blog-images''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can view project images') THEN
    EXECUTE 'CREATE POLICY "Anyone can view project images" ON storage.objects FOR SELECT TO public USING ((bucket_id = ''project-images''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Anyone can view warranty images') THEN
    EXECUTE 'CREATE POLICY "Anyone can view warranty images" ON storage.objects FOR SELECT TO public USING ((bucket_id = ''warranty-images''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can delete blog images') THEN
    EXECUTE 'CREATE POLICY "Authenticated users can delete blog images" ON storage.objects FOR DELETE TO authenticated USING ((bucket_id = ''blog-images''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can delete project images') THEN
    EXECUTE 'CREATE POLICY "Authenticated users can delete project images" ON storage.objects FOR DELETE TO public USING ((bucket_id = ''project-images''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can update blog images') THEN
    EXECUTE 'CREATE POLICY "Authenticated users can update blog images" ON storage.objects FOR UPDATE TO authenticated USING ((bucket_id = ''blog-images''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can update project images') THEN
    EXECUTE 'CREATE POLICY "Authenticated users can update project images" ON storage.objects FOR UPDATE TO public USING ((bucket_id = ''project-images''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can upload blog images') THEN
    EXECUTE 'CREATE POLICY "Authenticated users can upload blog images" ON storage.objects FOR INSERT TO authenticated WITH CHECK ((bucket_id = ''blog-images''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can upload project images') THEN
    EXECUTE 'CREATE POLICY "Authenticated users can upload project images" ON storage.objects FOR INSERT TO public WITH CHECK ((bucket_id = ''project-images''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Only admins can delete warranty images') THEN
    EXECUTE 'CREATE POLICY "Only admins can delete warranty images" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = ''warranty-images''::text) AND has_role(auth.uid(), ''admin''::app_role)))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Only admins can upload warranty images') THEN
    EXECUTE 'CREATE POLICY "Only admins can upload warranty images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = ''warranty-images''::text) AND has_role(auth.uid(), ''admin''::app_role)))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Only admins can view warranty images') THEN
    EXECUTE 'CREATE POLICY "Only admins can view warranty images" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = ''warranty-images''::text) AND has_role(auth.uid(), ''admin''::app_role)))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Project images are publicly accessible') THEN
    EXECUTE 'CREATE POLICY "Project images are publicly accessible" ON storage.objects FOR SELECT TO public USING ((bucket_id = ''project-images''::text))';
  END IF;
END $drift$;

DO $drift$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public read access for blog images') THEN
    EXECUTE 'CREATE POLICY "Public read access for blog images" ON storage.objects FOR SELECT TO public USING ((bucket_id = ''blog-images''::text))';
  END IF;
END $drift$;

