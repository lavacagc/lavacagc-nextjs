-- Drafts must never be readable with the publishable key, however the
-- dashboard-created permissive policies on projects / project_images are
-- written (they are not in this repo and could not be read at build time).
--
-- RESTRICTIVE policies only ever narrow: they AND with the permissive ones,
-- apply to the anon role alone, and leave authenticated admins and the service
-- role untouched. They are added only where row level security is already
-- enabled, because enabling it here on a table that has no permissive policy
-- would lock the whole site out of its own portfolio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'projects' AND c.relrowsecurity) THEN
    DROP POLICY IF EXISTS "anon sees only active projects" ON public.projects;
    CREATE POLICY "anon sees only active projects" ON public.projects
      AS RESTRICTIVE FOR SELECT TO anon USING (active = true);
  ELSE
    RAISE NOTICE 'projects has row level security off; anon draft guard not applied';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'project_images' AND c.relrowsecurity) THEN
    DROP POLICY IF EXISTS "anon sees only images of active projects" ON public.project_images;
    CREATE POLICY "anon sees only images of active projects" ON public.project_images
      AS RESTRICTIVE FOR SELECT TO anon
      USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_images.project_id AND p.active));
  ELSE
    RAISE NOTICE 'project_images has row level security off; anon draft guard not applied';
  END IF;
END $$;
