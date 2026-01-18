'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { FileText, Shield, Award, Download } from 'lucide-react';

interface ComplianceDocument {
  document_type: 'insurance' | 'bond' | 'license';
  display_name: string;
}

const DOCUMENT_ROUTES: Record<string, string> = {
  insurance: '/insurance',
  bond: '/bond',
  license: '/license',
};

const DOCUMENT_ICONS = {
  insurance: Shield,
  bond: Award,
  license: FileText,
};

export function ComplianceDocuments() {
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const { data, error } = await supabase
          .from('compliance_documents')
          .select('document_type, display_name')
          .eq('is_active', true)
          .not('file_url', 'is', null);

        if (error) throw error;
        setDocuments(data || []);
      } catch (error) {
        console.error('Error fetching compliance documents:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, []);

  // Don't render anything if loading or no documents
  if (loading || documents.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <h4 className="text-sm font-semibold text-text-primary text-center mb-4">
        Download Our Credentials
      </h4>
      <div className="flex flex-wrap justify-center gap-3">
        {documents.map((doc) => {
          const Icon = DOCUMENT_ICONS[doc.document_type] || FileText;
          const route = DOCUMENT_ROUTES[doc.document_type];
          return (
            <Button
              key={doc.document_type}
              variant="outline"
              size="sm"
              asChild
            >
              <a
                href={route}
                target="_blank"
                rel="noopener noreferrer"
                className="gap-2"
              >
                <Icon className="h-4 w-4" />
                {doc.display_name}
                <Download className="h-3 w-3 opacity-50" />
              </a>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
