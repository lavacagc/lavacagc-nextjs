-- Chat Conversations table
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,
  messages jsonb[] DEFAULT '{}',
  lead_captured boolean DEFAULT false,
  lead_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  ip_address text,
  page_url text
);

-- Index for visitor lookups
CREATE INDEX idx_chat_conversations_visitor_id ON public.chat_conversations(visitor_id);
CREATE INDEX idx_chat_conversations_created_at ON public.chat_conversations(created_at DESC);

-- Enable RLS
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- Allow anon to insert and update (chatbot needs this)
CREATE POLICY "Allow anon insert chat_conversations"
  ON public.chat_conversations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon select chat_conversations"
  ON public.chat_conversations FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon update chat_conversations"
  ON public.chat_conversations FOR UPDATE TO anon USING (true) WITH CHECK (true);


-- Follow-Up Queue table
CREATE TABLE IF NOT EXISTS public.follow_up_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  estimate_lead_id uuid REFERENCES public.estimate_leads(id) ON DELETE SET NULL,
  lead_email text NOT NULL,
  lead_name text NOT NULL,
  follow_up_type text NOT NULL CHECK (follow_up_type IN ('instant_ack', '24h', '48h', '7d')),
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'responded')),
  email_subject text NOT NULL,
  email_body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes for follow-up processing
CREATE INDEX idx_follow_up_queue_status ON public.follow_up_queue(status);
CREATE INDEX idx_follow_up_queue_scheduled_at ON public.follow_up_queue(scheduled_at);
CREATE INDEX idx_follow_up_queue_lead_email ON public.follow_up_queue(lead_email);

-- Enable RLS
ALTER TABLE public.follow_up_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon insert follow_up_queue"
  ON public.follow_up_queue FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon select follow_up_queue"
  ON public.follow_up_queue FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon update follow_up_queue"
  ON public.follow_up_queue FOR UPDATE TO anon USING (true) WITH CHECK (true);


-- Chatbot Config table (knowledge base)
CREATE TABLE IF NOT EXISTS public.chatbot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_prompt text,
  knowledge_base text,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chatbot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select chatbot_config"
  ON public.chatbot_config FOR SELECT TO anon USING (true);


-- Updated_at trigger for chat_conversations
CREATE OR REPLACE FUNCTION update_chat_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_conversations_updated_at();
