-- Adds the `newsletter` marketing stream to email_preferences.
--
-- Unlike home_care / buy_remodel / announcements (which default TRUE and are
-- switched off only on opt-out), `newsletter` is an AFFIRMATIVE-consent stream:
-- it defaults FALSE and is flipped TRUE only when someone explicitly signs up
-- for the monthly newsletter (e.g. the exit-intent capture -> /api/newsletter/subscribe).
-- That keeps it a clean "they actually asked for this" signal with no accidental
-- sweep-in from a transactional touch, and the monthly-newsletter cron unions
-- these subscribers in and gates their sends on this stream.
--
-- Being a marketing stream, it is covered automatically by the unsubscribe
-- cascade (STREAM_KEYS), one-click List-Unsubscribe (stream=newsletter), the
-- preference center, and the Resend two-way sync. It has no legacy identity
-- table (like announcements), so syncLegacyStatus ignores it.

ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS newsletter boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.email_preferences.newsletter IS
  'Affirmative-consent marketing stream for the monthly La Vaca Home Journal newsletter. Defaults false; set true only on explicit signup. Opt-out honored at send time by sendTrackedEmail(preferenceStream:newsletter).';

-- Partial index to make the monthly-newsletter recipient query
-- (newsletter = true) cheap as the list grows.
CREATE INDEX IF NOT EXISTS email_preferences_newsletter_true_idx
  ON public.email_preferences (email)
  WHERE newsletter = true;
