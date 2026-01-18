import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Compliance Bond | La Vaca General Contractors',
  robots: {
    index: false,
    follow: false,
  },
};

async function getDocumentStatus() {
  const supabase = getServerSupabaseClient();

  const { data } = await supabase
    .from('compliance_documents')
    .select('display_name')
    .eq('document_type', 'bond')
    .eq('is_active', true)
    .not('file_url', 'is', null)
    .single();

  return data;
}

export default async function BondPage() {
  const doc = await getDocumentStatus();

  if (!doc) {
    redirect('/about');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold text-text-primary mb-6 text-center">
            {doc.display_name}
          </h1>
          <div className="bg-white rounded-lg shadow-lg overflow-hidden" style={{ height: 'calc(100vh - 250px)', minHeight: '600px' }}>
            <iframe
              src="/api/documents/bond"
              className="w-full h-full border-0"
              title={doc.display_name}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
