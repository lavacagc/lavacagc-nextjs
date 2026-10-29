/**
 * POST /api/admin/offers/<id>
 *   { action: 'cancel' }     withdraw an open offer so Alex can resend the trade
 *                            at a different pay without waiting out 24 hours.
 *   { action: 'retry_push' } push an assigned offer to SpecNook again when its
 *                            push is pending or failed. 409 while SpecNook is
 *                            not connected (the push stays pending and the
 *                            offers cron sends it once it is).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { InboxError, cancelOffer, retryOnePush } from '@/lib/home-services/offers';
import { UUID_RE, actingAdmin, readJson, serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ action: z.enum(['cancel', 'retry_push']) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const read = await readJson(request, 1024);
  if (read.ok === false) return read.response;
  const parsed = schema.safeParse(read.body);
  if (!parsed.success) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  const by = await actingAdmin();
  try {
    if (parsed.data.action === 'retry_push') {
      const status = await retryOnePush(id, by);
      return NextResponse.json({ specnook_push_status: status });
    }
    const ok = await cancelOffer(id, by);
    if (!ok) return NextResponse.json({ error: 'That offer is not open any more.' }, { status: 409 });
    return NextResponse.json({ status: 'cancelled' });
  } catch (err) {
    if (err instanceof InboxError) return NextResponse.json({ error: err.message }, { status: err.status });
    return serverError(parsed.data.action === 'retry_push' ? 'Could not retry the SpecNook push' : 'Could not withdraw the offer', err);
  }
}
