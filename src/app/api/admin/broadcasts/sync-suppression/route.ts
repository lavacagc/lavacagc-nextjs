import { NextRequest, NextResponse } from 'next/server';
import { syncAudienceSuppression } from '@/lib/notify/resendAudience';

/**
 * POST /api/admin/broadcasts/sync-suppression  { audienceId }
 *
 * Mirrors every "News & offers" opt-out onto the given Resend audience by
 * flagging those contacts `unsubscribed`, so an upcoming broadcast skips them.
 * Run this right before sending a broadcast. Admin-gated by middleware.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { audienceId } = (body ?? {}) as { audienceId?: string };
  if (!audienceId || typeof audienceId !== 'string') {
    return NextResponse.json({ error: 'audienceId required' }, { status: 400 });
  }

  const result = await syncAudienceSuppression(audienceId.trim());
  const httpStatus = result.status === 'error' ? 502 : 200;
  return NextResponse.json(result, { status: httpStatus });
}
