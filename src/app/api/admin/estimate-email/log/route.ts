import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/seo/supabase-rest';

/**
 * GET /api/admin/estimate-email/log?status=&limit=
 *
 * Returns recent estimate_emails audit rows for the admin log view.
 * Defaults to 50 rows ordered newest-first. Optional status filter
 * accepts 'sent', 'failed', or 'test'.
 */

export const dynamic = 'force-dynamic';

interface LogRow {
  id: string;
  lead_id: string | null;
  recipient_email: string;
  recipient_name: string;
  cc_emails: string | null;
  project_type: string;
  estimate_url: string;
  portal_url: string | null;
  update_cadence: string | null;
  sent_at: string;
  sent_by: string | null;
  resend_message_id: string | null;
  status: string;
  error_message: string | null;
}

const ALLOWED_STATUS = new Set(['sent', 'failed', 'test']);

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status');
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(Math.max(Number.parseInt(limitParam ?? '50', 10) || 50, 1), 200);

  let path =
    `estimate_emails?select=id,lead_id,recipient_email,recipient_name,cc_emails,` +
    `project_type,estimate_url,portal_url,update_cadence,sent_at,sent_by,` +
    `resend_message_id,status,error_message&order=sent_at.desc&limit=${limit}`;

  if (status && ALLOWED_STATUS.has(status)) {
    path += `&status=eq.${status}`;
  }

  try {
    const rows = await supabaseRest<LogRow[]>('GET', path);
    return NextResponse.json({ rows: rows ?? [] });
  } catch (err) {
    console.error('Estimate-email log fetch failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Fetch failed' },
      { status: 500 },
    );
  }
}
