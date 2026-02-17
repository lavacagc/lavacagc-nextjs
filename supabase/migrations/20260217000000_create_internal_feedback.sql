-- Internal feedback table for capturing reviews that don't go to Google
-- Used by the "Leave a Review" page satisfaction gate
CREATE TABLE IF NOT EXISTS public.internal_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  name VARCHAR(255),
  email VARCHAR(255),
  feedback TEXT NOT NULL,
  source VARCHAR(100) DEFAULT 'leave-a-review',
  status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'read', 'responded', 'resolved')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for admin queries
CREATE INDEX idx_internal_feedback_status ON public.internal_feedback(status);
CREATE INDEX idx_internal_feedback_created ON public.internal_feedback(created_at DESC);

-- Enable RLS
ALTER TABLE public.internal_feedback ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (from the review page)
CREATE POLICY "Anyone can submit feedback"
  ON public.internal_feedback
  FOR INSERT
  WITH CHECK (true);

-- Only authenticated users can read/manage feedback
CREATE POLICY "Authenticated users can read feedback"
  ON public.internal_feedback
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update feedback"
  ON public.internal_feedback
  FOR UPDATE
  USING (auth.role() = 'authenticated');
