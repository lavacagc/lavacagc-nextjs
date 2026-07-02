-- Before/After pairing for real project photos.
--
-- A complete pair is exactly one image_category='before' row and one
-- image_category='after' row that share the same non-null pair_key. The admin
-- links them explicitly; the optional pair label is stored in the existing
-- `caption` column. Unpaired images (pair_key IS NULL) keep rendering as plain
-- standalone photos, so this is fully backwards-compatible.
--
-- Additive + idempotent: safe to replay and safe for the Supabase Preview branch.

-- project_images is prod-only (created via the dashboard, never as a migration).
-- A from-empty Supabase preview replay has no such table, so the ALTER below
-- aborts the whole run. The preview baseline stubs it for FRESH branches, but a
-- persistent branch that already recorded the baseline version won't re-run it —
-- so stub it here too (idempotent no-op on prod and on any branch that has it).
CREATE TABLE IF NOT EXISTS project_images (id UUID PRIMARY KEY DEFAULT gen_random_uuid());

ALTER TABLE project_images ADD COLUMN IF NOT EXISTS pair_key TEXT;

CREATE INDEX IF NOT EXISTS project_images_pair_key_idx ON project_images (pair_key);
