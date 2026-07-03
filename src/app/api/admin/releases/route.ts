/**
 * Admin CRUD for the release-notes queue (R1).
 *
 *   GET    /api/admin/releases          → { queued: [...], sent: [...] }
 *   POST   /api/admin/releases          → create a queued entry
 *   PATCH  /api/admin/releases?id=<id>  → edit an entry's copy/screenshot/order
 *   DELETE /api/admin/releases?id=<id>  → remove a queued entry
 *
 * Auth: /api/admin/* is session-gated by middleware. Sending lives in
 * ./send/route.ts and is a separate, deliberate admin action.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = 'id,headline,subhead,benefit,screenshot_path,status,sort_order,created_at,sent_at';

interface ReleaseRow {
  id: string;
  headline: string;
  subhead: string;
  benefit: string;
  screenshot_path: string | null;
  status: 'queued' | 'sent';
  sort_order: number;
  created_at: string;
  sent_at: string | null;
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** Screenshot paths must be repo-public release assets, not arbitrary URLs. */
function cleanScreenshot(v: unknown): string | null | undefined {
  if (v === null) return null; // explicit clear
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return /^\/email\/releases\/[\w.-]+$/.test(s) ? s : undefined;
}

export async function GET() {
  try {
    const rows = (await supabaseRest<ReleaseRow[]>(
      'GET',
      `feature_releases?select=${SELECT}&order=sort_order.asc,created_at.asc`,
    )) ?? [];
    return NextResponse.json({
      queued: rows.filter((r) => r.status === 'queued'),
      sent: rows.filter((r) => r.status === 'sent').reverse(),
    });
  } catch (err) {
    console.error('releases GET failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const headline = cleanText(body.headline, 120);
  const subhead = cleanText(body.subhead, 300);
  const benefit = cleanText(body.benefit, 300);
  if (!headline || !subhead || !benefit) {
    return NextResponse.json({ error: 'headline, subhead, and benefit are required' }, { status: 400 });
  }
  const screenshot = cleanScreenshot(body.screenshot_path);
  try {
    const rows = await supabaseRest<ReleaseRow[]>('POST', `feature_releases?select=${SELECT}`, {
      headline,
      subhead,
      benefit,
      screenshot_path: screenshot ?? null,
      sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
    }, { prefer: 'return=representation' });
    return NextResponse.json({ entry: rows?.[0] ?? null });
  } catch (err) {
    console.error('releases POST failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'valid id required' }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const headline = cleanText(body.headline, 120);
  const subhead = cleanText(body.subhead, 300);
  const benefit = cleanText(body.benefit, 300);
  if (headline) patch.headline = headline;
  if (subhead) patch.subhead = subhead;
  if (benefit) patch.benefit = benefit;
  if ('screenshot_path' in body) {
    const s = cleanScreenshot(body.screenshot_path);
    if (s !== undefined) patch.screenshot_path = s;
  }
  if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  try {
    const rows = await supabaseRest<ReleaseRow[]>(
      'PATCH',
      `feature_releases?id=eq.${id}&select=${SELECT}`,
      patch,
      { prefer: 'return=representation' },
    );
    return NextResponse.json({ entry: rows?.[0] ?? null });
  } catch (err) {
    console.error('releases PATCH failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'valid id required' }, { status: 400 });
  try {
    // Only queued entries can be deleted — sent rows are the send history.
    await supabaseRest('DELETE', `feature_releases?id=eq.${id}&status=eq.queued`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('releases DELETE failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
