-- Decision 006, Q20 (Alex, 2026-10-29): the two legal sentences articles may quote
-- word for word. The publish guard allows legal wording only as a locked
-- content_facts sentence, so these go from unlocked placeholders to locked text.
-- Guarded: a database that never ran 20261030000002 gets the rows inserted.
INSERT INTO public.content_facts (key, value, description, verified_by, lock) VALUES
  ('claim_license',
   'La Vaca General Contractors is a licensed New Jersey home improvement contractor, NJ HIC 13VH13373800.',
   'The one licensing sentence articles may quote verbatim (decision 006 Q20).',
   'alex', true),
  ('claim_insurance',
   'La Vaca carries general liability insurance and a one-year workmanship warranty on its own work.',
   'The one insurance and warranty sentence articles may quote verbatim (decision 006 Q20).',
   'alex', true)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  verified_by = EXCLUDED.verified_by,
  verified_at = now(),
  lock = true;
