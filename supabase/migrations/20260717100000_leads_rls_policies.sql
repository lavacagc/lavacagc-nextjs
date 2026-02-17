-- Add RLS policies for leads table to allow chatbot (anon) to insert and dashboard to read
-- The sb_secret_ key bypasses RLS via REST, but createClient() doesn't — so we need explicit policies

-- Allow anon to INSERT leads (chatbot creates leads)
CREATE POLICY "Allow anon insert leads" ON leads
  FOR INSERT TO anon
  WITH CHECK (true);

-- Allow anon to SELECT leads (dashboard reads leads)
CREATE POLICY "Allow anon select leads" ON leads
  FOR SELECT TO anon
  USING (true);
