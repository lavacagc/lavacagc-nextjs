/**
 * PATCH /api/admin/offers/decline-calls/<id> - Alex logs the follow-up call
 * after a decline (BD7): the sub's counter price, whether they will take the
 * job at that price, and the reason in their words. Marks the task done.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { InboxError, logDeclineCall } from '@/lib/home-services/offers';
import { UUID_RE, actingAdmin, readJson, serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  counter_cents: z.number().int().positive().max(100_000_000).nullable().default(null),
  will_take: z.boolean().nullable().default(null),
  reason_text: z.string().trim().max(2000).default(''),
}).refine((v) => v.counter_cents !== null || v.will_take !== null || v.reason_text !== '', {
  message: 'Log at least one thing from the call',
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const read = await readJson(request, 8 * 1024);
  if (read.ok === false) return read.response;
  const parsed = schema.safeParse(read.body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed' }, { status: 400 });
  try {
    const call = await logDeclineCall(id, parsed.data, await actingAdmin());
    return NextResponse.json({ call });
  } catch (err) {
    if (err instanceof InboxError) return NextResponse.json({ error: err.message }, { status: err.status });
    return serverError('Could not log the call', err);
  }
}
