-- La Vaca Home Care - allow the night-before visit reminder into follow_up_queue.
--
-- `follow_up_queue.follow_up_type` carries a CHECK constraint listing every
-- sequence that shares the table. Service scheduling adds a third sequence,
-- 'visit_reminder_1d', whose row is BOTH the queued reminder and the send-once
-- ledger /api/cron/visit-reminders claims against. Without this widening the
-- INSERT fails the constraint and booking a visit returns 500.
--
-- Must be hand-applied alongside 20260815000000, same as every migration in
-- this repo. Idempotent: drops and re-adds the constraint with the full list.
ALTER TABLE public.follow_up_queue DROP CONSTRAINT IF EXISTS follow_up_queue_follow_up_type_check;

ALTER TABLE public.follow_up_queue ADD CONSTRAINT follow_up_queue_follow_up_type_check
  CHECK (follow_up_type IN (
    'instant_ack', '24h', '48h', '7d',
    'feedback_day0', 'feedback_day3', 'feedback_day7',
    'visit_reminder_1d'
  ));
