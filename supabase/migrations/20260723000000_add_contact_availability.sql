-- Adds "best time to contact you" capture fields to leads + referrals.
--
-- Why these three columns rather than a single text field:
--   * contact_time_preference — small enum-coded bucket (anytime/morning/
--     afternoon/evening/weekends/specific). Cheap to filter on in the
--     admin dashboard ("who's callable right now"), cheap to render in
--     Telegram without truncation.
--   * contact_time_details — free text, only populated when preference
--     = 'specific'. Caps at 200 chars client-side; DB doesn't enforce
--     the cap because downstream sanitization already handles it.
--   * contact_timezone — IANA zone captured client-side via
--     Intl.DateTimeFormat().resolvedOptions().timeZone. Default is ET
--     because our service area is NJ; the client value only overrides
--     when it actually differs. Used to flag mismatches in Telegram
--     ("customer on PT") and to respect quiet hours in any future
--     outbound SMS follow-up.
--
-- All columns nullable with safe defaults so a pre-migration row or a
-- form that hasn't shipped the field yet won't fail on insert.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_time_preference TEXT
    CHECK (contact_time_preference IS NULL OR contact_time_preference IN
      ('anytime', 'morning', 'afternoon', 'evening', 'weekends', 'specific')),
  ADD COLUMN IF NOT EXISTS contact_time_details TEXT,
  ADD COLUMN IF NOT EXISTS contact_timezone TEXT DEFAULT 'America/New_York';

ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS contact_time_preference TEXT
    CHECK (contact_time_preference IS NULL OR contact_time_preference IN
      ('anytime', 'morning', 'afternoon', 'evening', 'weekends', 'specific')),
  ADD COLUMN IF NOT EXISTS contact_time_details TEXT,
  ADD COLUMN IF NOT EXISTS contact_timezone TEXT DEFAULT 'America/New_York';

-- Index for the "callable right now" admin filter. We only index rows
-- that have a non-null preference, since the vast majority of rows
-- post-rollout will have it set.
CREATE INDEX IF NOT EXISTS idx_leads_contact_time_preference
  ON public.leads (contact_time_preference)
  WHERE contact_time_preference IS NOT NULL;
