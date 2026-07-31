-- La Vaca Home Care - tie a queued visit reminder to ITS visit.
--
-- A 'visit_reminder_1d' row in follow_up_queue is both the queued reminder and
-- the send-once ledger /api/cron/visit-reminders claims against. It used to be
-- identified by (lead_email, scheduled_at), but scheduled_at is 7:30pm Eastern
-- the night before - the SAME instant for every visit that day. A customer with
-- gutters at 8am and a dryer vent at 1pm on 5 Aug therefore had one row standing
-- for two visits: booking the second pulled the first's reminder, and the single
-- email that went out named only one of the two jobs.
--
-- visit_start is the visit's own start instant, so (lead_email, visit_start)
-- names exactly one visit through the queue, the ledger and the cancel path.
-- Nullable: the other sequences sharing this table have no visit and leave it
-- NULL, and the partial index keeps them out of it.
--
-- Must be hand-applied alongside 20260815000000 and 20260816000000, same as
-- every migration in this repo. Idempotent.
ALTER TABLE public.follow_up_queue ADD COLUMN IF NOT EXISTS visit_start timestamptz;

CREATE INDEX IF NOT EXISTS idx_follow_up_queue_visit
  ON public.follow_up_queue (follow_up_type, visit_start)
  WHERE visit_start IS NOT NULL;
