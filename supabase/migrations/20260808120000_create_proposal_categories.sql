-- Custom proposal cost categories (round 4, 2026-08-08).
--
-- The built-in category library lives in code (src/lib/proposals/
-- builderCategories.ts); this table holds the ones the ADMIN adds on the fly
-- from the proposal builder. Owner's rule: creating categories is strictly an
-- admin function - collaborators (role 'user') are told to ask their admin.
-- Reads are open to any signed-in staff so the picker can list them.
--
-- `optional` mirrors the registry's fail-safe: false (locked for the client)
-- unless the admin deliberately marks the category as client-optional.

CREATE TABLE IF NOT EXISTS public.proposal_categories (
  key text PRIMARY KEY,
  label text NOT NULL,
  optional boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proposal_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'proposal_categories' AND policyname = 'Staff can read categories'
  ) THEN
    CREATE POLICY "Staff can read categories" ON public.proposal_categories
      FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'proposal_categories' AND policyname = 'Only admins can add categories'
  ) THEN
    CREATE POLICY "Only admins can add categories" ON public.proposal_categories
      FOR INSERT TO authenticated
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'proposal_categories' AND policyname = 'Only admins can update categories'
  ) THEN
    CREATE POLICY "Only admins can update categories" ON public.proposal_categories
      FOR UPDATE TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;
