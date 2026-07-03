-- Wave 1 (D1): per-task "Not relevant to my home" dismissal.
-- A dismissal is stored as one row per task with season = 'all' and
-- status = 'dismissed' — it hides the task across every season tab and
-- excludes it from progress, the catch-up card, and the newsletter.
-- Restoring upserts the same row back to status = 'todo' (ignored everywhere).
ALTER TABLE public.homeowner_maintenance
  DROP CONSTRAINT IF EXISTS homeowner_maintenance_status_check;
ALTER TABLE public.homeowner_maintenance
  ADD CONSTRAINT homeowner_maintenance_status_check
  CHECK (status IN ('todo', 'done', 'snoozed', 'booked', 'dismissed'));
