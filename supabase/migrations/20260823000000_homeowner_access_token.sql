-- A stable per-homeowner token so an emailed checklist link actually opens the
-- checklist (fixes the "not reachable" report, 2 Aug).
--
-- Hand-apply in the Supabase SQL editor. Idempotent.
--
-- THE BUG: every email that links to /home-care/checklist links to it bare.
-- That page redirects to /home-care when there is no `hc_access` cookie, and
-- that cookie lasts 30 days - so any recipient who has not opened the portal
-- recently lands on the signup page instead of their plan. It affects the visit
-- reminder, the monthly newsletter and the release email alike.
--
-- WHY A NEW COLUMN rather than reusing one that exists:
--   verify_token      is single-use and CLEARED on use, so it cannot survive a
--                     second email, or even a second click of the same one.
--   unsubscribe_token would mean any link that can unsubscribe someone can also
--                     open their portal - and unsubscribe links are exactly the
--                     ones mail-security scanners fetch.
--
-- Home Care is deliberately a no-login product, so a stable token in the link is
-- consistent with how the rest of it already works.

ALTER TABLE public.homeowners ADD COLUMN IF NOT EXISTS access_token text;

-- Backfill every existing homeowner, or their next email is still broken.
UPDATE public.homeowners
   SET access_token = encode(gen_random_bytes(32), 'base64')
 WHERE access_token IS NULL;

-- Strip the base64 characters that do not survive a URL.
UPDATE public.homeowners
   SET access_token = replace(replace(replace(access_token, '+', '-'), '/', '_'), '=', '')
 WHERE access_token LIKE '%+%' OR access_token LIKE '%/%' OR access_token LIKE '%=%';

CREATE UNIQUE INDEX IF NOT EXISTS homeowners_access_token_key
  ON public.homeowners (access_token);

COMMENT ON COLUMN public.homeowners.access_token IS
  'Stable. Exchanged at /api/home-care/access for the hc_access cookie so emailed checklist links open the checklist. Deliberately NOT the unsubscribe token.';
