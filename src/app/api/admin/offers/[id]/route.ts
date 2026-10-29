/**
 * POST /api/admin/offers/<id> { action: 'cancel' } - withdraw an open offer so
 * Alex can resend the trade at a different pay without waiting out 24 hours.
 * Only one offer per trade may be open on a request at a time.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { cancelOffer } from '@/lib/home-services/offers';
import { UUID_RE, actingAdmin, readJson, serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ action: z.literal('cancel') });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const read = await readJson(request, 1024);
  if (read.ok === false) return read.response;
  if (!schema.safeParse(read.body).success) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  try {
    const ok = await cancelOffer(id, await actingAdmin());
    if (!ok) return NextResponse.json({ error: 'That offer is not open any more.' }, { status: 409 });
    return NextResponse.json({ status: 'cancelled' });
  } catch (err) {
    return serverError('Could not withdraw the offer', err);
  }
}
