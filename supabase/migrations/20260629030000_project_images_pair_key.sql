-- Before/After pairing for real project photos.
--
-- A complete pair is exactly one image_category='before' row and one
-- image_category='after' row that share the same non-null pair_key. The admin
-- links them explicitly; the optional pair label is stored in the existing
-- `caption` column. Unpaired images (pair_key IS NULL) keep rendering as plain
-- standalone photos, so this is fully backwards-compatible.
--
-- Additive + idempotent: safe to replay and safe for the Supabase Preview branch.

ALTER TABLE project_images ADD COLUMN IF NOT EXISTS pair_key TEXT;

CREATE INDEX IF NOT EXISTS project_images_pair_key_idx ON project_images (pair_key);
