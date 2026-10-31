-- Close anonymous write and read holes in storage (found 2026-10-31).
--
-- Production's storage.objects carried policies granted to role `public`
-- (which includes anonymous callers holding the browser's anon key) with no
-- check beyond the bucket name. Proven on the staging copy of the same
-- policies with only the anon key:
--   * DELETE of any project-images object (portfolio photos): 200, deleted.
--   * INSERT of arbitrary files into the public project-images bucket: 200.
--   * READ of a private warranty-images object (customer home photos): 200.
--
-- Nothing in the app needs them. Project media is written server-side with
-- the service key or a one-object signed upload URL (src/lib/projects/
-- uploads.ts, storage.ts), and admins keep their own policies ("Admins can
-- upload/delete project images", "Only admins can view/upload/delete warranty
-- images"). The public warranty form still uploads anonymously through
-- "Anyone can upload warranty images", which stays.
--
-- Rollback (restores the holes; only if an unknown client breaks):
--   CREATE POLICY "Authenticated users can delete project images" ON storage.objects
--     FOR DELETE TO public USING (bucket_id = 'project-images');
--   CREATE POLICY "Authenticated users can update project images" ON storage.objects
--     FOR UPDATE TO public USING (bucket_id = 'project-images');
--   CREATE POLICY "Authenticated users can upload project images" ON storage.objects
--     FOR INSERT TO public WITH CHECK (bucket_id = 'project-images');
--   CREATE POLICY "Anyone can view warranty images" ON storage.objects
--     FOR SELECT TO public USING (bucket_id = 'warranty-images');

DROP POLICY IF EXISTS "Authenticated users can delete project images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update project images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload project images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view warranty images" ON storage.objects;
