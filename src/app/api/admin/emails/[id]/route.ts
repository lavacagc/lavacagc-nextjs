import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';

/**
 * GET /api/admin/emails/[id]
 *
 * A single email_log row INCLUDING the rendered html/text body - this is what
 * powers the "see what was sent" HTML viewer. Kept separate from the list route
 * so the list stays light.
 *
 * The body is the STORED copy, whose link credentials were blanked on the way
 * in (see `redactEmailBody`), so the viewer shows the shape of every link
 * without handing an admin screen a live portal token.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */

export const dynamic = 'force-dynamic';

// Basic UUID shape guard so a malformed id can't be interpolated into the path.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const rows = await supabaseRest<Array<Record<string, unknown>>>(
      'GET',
      `email_log?id=eq.${id}&select=*&limit=1`,
    );
    const row = rows?.[0];
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ row });
  } catch (err) {
    console.error('Admin email detail fetch failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Fetch failed' },
      { status: 500 },
    );
  }
}
