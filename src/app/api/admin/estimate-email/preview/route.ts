import { NextRequest, NextResponse } from 'next/server';
import { estimateEmailHtml, estimateEmailText } from '@/lib/emailTemplates';
import { estimateEmailSchema } from '../_schema';

/**
 * POST /api/admin/estimate-email/preview
 *
 * Returns the rendered HTML + plaintext of an estimate email *without*
 * sending it or writing an audit row. Used by the admin form's "Preview"
 * button to show exactly what the customer will see, in an iframe.
 *
 * Admin auth is enforced by middleware on the /api/admin/* prefix.
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = estimateEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const {
    recipientName,
    projectType,
    estimateUrl,
    portalUrl,
    updateCadence,
    personalNote,
  } = parsed.data;

  const html = estimateEmailHtml({
    recipientName,
    projectType,
    estimateUrl,
    portalUrl,
    updateCadence,
    personalNote,
  });

  const text = estimateEmailText({
    recipientName,
    projectType,
    estimateUrl,
    portalUrl,
    updateCadence,
    personalNote,
  });

  return NextResponse.json({ html, text });
}
