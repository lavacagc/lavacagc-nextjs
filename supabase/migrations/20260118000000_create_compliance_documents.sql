-- Create compliance_documents table for storing insurance, bond, and license PDFs
CREATE TABLE IF NOT EXISTS compliance_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL UNIQUE CHECK (document_type IN ('insurance', 'bond', 'license')),
  display_name TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial document types
INSERT INTO compliance_documents (document_type, display_name, description) VALUES
  ('insurance', 'Insurance Certificate', 'Certificate of Liability Insurance'),
  ('bond', 'Compliance Bond', 'NJ Contractor Compliance Bond'),
  ('license', 'HIC License', 'NJ Home Improvement Contractor License')
ON CONFLICT (document_type) DO NOTHING;

-- Enable RLS
ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;

-- Public can read active documents with file URLs
CREATE POLICY "Public can read active compliance documents"
  ON compliance_documents
  FOR SELECT
  USING (is_active = true AND file_url IS NOT NULL);

-- Authenticated users can manage all compliance documents
CREATE POLICY "Authenticated users can manage compliance documents"
  ON compliance_documents
  FOR ALL
  USING (auth.role() = 'authenticated');

-- Create storage bucket for compliance documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('compliance-documents', 'compliance-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to compliance-documents bucket
CREATE POLICY "Authenticated users can upload compliance documents"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'compliance-documents' AND auth.role() = 'authenticated');

-- Allow authenticated users to update compliance documents
CREATE POLICY "Authenticated users can update compliance documents"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'compliance-documents' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete compliance documents
CREATE POLICY "Authenticated users can delete compliance documents"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'compliance-documents' AND auth.role() = 'authenticated');

-- Allow public to read compliance documents
CREATE POLICY "Public can read compliance documents storage"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'compliance-documents');
