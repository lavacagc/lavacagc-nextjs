-- Add a transactional "follow_ups" suppression flag to email_preferences.
--
-- Context: the original design (20260801) treated lead follow-ups + review
-- requests as transactional ("always sends"). That left those emails with no
-- unsubscribe mechanism at all — a CAN-SPAM gap — because their primary purpose
-- is still commercial. Owner decision (2026-07): keep them TRANSACTIONAL in the
-- sense that a general marketing unsubscribe (/unsub, one-click on a newsletter)
-- does NOT stop them, but give them their OWN working opt-out that a recipient
-- can use to stop just these.
--
-- Implementation: a dedicated boolean, deliberately NOT one of the marketing
-- STREAM_KEYS, so the global marketing cascade never flips it. Only the
-- follow-up/feedback emails check it, and only their own unsubscribe link /
-- List-Unsubscribe header turns it off.

ALTER TABLE public.email_preferences
  ADD COLUMN IF NOT EXISTS follow_ups BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.email_preferences.follow_ups IS
  'Transactional lead follow-up / review-request opt-in. TRUE = may receive. '
  'Excluded from the marketing STREAM_KEYS cascade: a global marketing '
  'unsubscribe does not change it; only the follow-up emails own opt-out does.';
