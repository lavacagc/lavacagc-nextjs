-- Forward fix-up: stub the prod-only role objects for the Supabase Preview replay.
--
-- app_role / user_roles / has_role() exist only in the live DB (dashboard-
-- created, never in a migration). The RLS policies in the next migration,
-- 20260808120000_create_proposal_categories, call
-- has_role(auth.uid(), 'admin'::app_role), so a preview replay aborts with
-- `type "app_role" does not exist`.
--
-- WHY A NEW FILE. Same reasoning as `00000000000001_preview_baseline_fixups`:
-- preview branches are PERSISTENT and apply each version exactly once. PR #103's
-- branch had already recorded both baselines when these stubs were first added
-- to them, so those edits never ran there. This version sorts after every
-- migration such a branch has applied and immediately before the one that
-- needs the stubs, so an already-initialized branch and a fresh one converge.
--
-- Shapes copied from the generated src/integrations/supabase/types.ts. Every
-- object is guarded and nothing uses CREATE OR REPLACE, so this is a no-op on
-- production and production's real definitions are never replaced.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regprocedure('public.has_role(uuid, public.app_role)') IS NULL THEN
    CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
    RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
    AS 'SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)';
  END IF;
END $$;
