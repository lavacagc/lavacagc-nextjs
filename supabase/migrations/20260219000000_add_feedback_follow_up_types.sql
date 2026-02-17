-- Update follow_up_type check constraint to include feedback types
ALTER TABLE public.follow_up_queue DROP CONSTRAINT IF EXISTS follow_up_queue_follow_up_type_check;

ALTER TABLE public.follow_up_queue ADD CONSTRAINT follow_up_queue_follow_up_type_check 
  CHECK (follow_up_type IN ('instant_ack', '24h', '48h', '7d', 'feedback_day0', 'feedback_day3', 'feedback_day7'));
