-- Add lead scoring columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier text CHECK (tier IN ('hot', 'warm', 'cold')),
  ADD COLUMN IF NOT EXISTS scoring_reasons text[],
  ADD COLUMN IF NOT EXISTS source text;

-- Add lead scoring columns to estimate_leads table
ALTER TABLE public.estimate_leads
  ADD COLUMN IF NOT EXISTS score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier text CHECK (tier IN ('hot', 'warm', 'cold')),
  ADD COLUMN IF NOT EXISTS scoring_reasons text[],
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Create indexes for filtering by tier and score
CREATE INDEX IF NOT EXISTS idx_leads_tier ON public.leads(tier);
CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_estimate_leads_tier ON public.estimate_leads(tier);
CREATE INDEX IF NOT EXISTS idx_estimate_leads_score ON public.estimate_leads(score DESC);

-- Add comments for documentation
COMMENT ON COLUMN public.leads.score IS 'Lead quality score (0-200+). Higher = better quality lead.';
COMMENT ON COLUMN public.leads.tier IS 'Lead priority tier: hot (80+), warm (50-79), cold (<50)';
COMMENT ON COLUMN public.leads.scoring_reasons IS 'Array of reasons contributing to the score';
COMMENT ON COLUMN public.leads.source IS 'Lead source: chatbot, contact_form, calculator, exit_intent, etc.';

COMMENT ON COLUMN public.estimate_leads.score IS 'Lead quality score (0-200+). Higher = better quality lead.';
COMMENT ON COLUMN public.estimate_leads.tier IS 'Lead priority tier: hot (80+), warm (50-79), cold (<50)';
COMMENT ON COLUMN public.estimate_leads.scoring_reasons IS 'Array of reasons contributing to the score';
COMMENT ON COLUMN public.estimate_leads.source IS 'Lead source: calculator, contact_form, chatbot, etc.';
COMMENT ON COLUMN public.estimate_leads.metadata IS 'Additional lead data (calculator selections, form data, etc.)';
