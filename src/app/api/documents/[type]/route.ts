import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase-server';

const VALID_TYPES = ['insurance', 'bond', 'license'] as const;
type DocumentType = typeof VALID_TYPES[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  // Validate document type
  if (!VALID_TYPES.includes(type as DocumentType)) {
    return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
  }

  try {
    const supabase = getServerSupabaseClient();

    // Fetch the document record
    const { data: doc, error: dbError } = await supabase
      .from('compliance_documents')
      .select('file_url, display_name')
      .eq('document_type', type)
      .eq('is_active', true)
      .not('file_url', 'is', null)
      .single();

    if (dbError || !doc?.file_url) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Fetch the PDF from Supabase storage
    const pdfResponse = await fetch(doc.file_url);

    if (!pdfResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch document' }, { status: 502 });
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Return the PDF with appropriate headers
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${doc.display_name}.pdf"`,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
