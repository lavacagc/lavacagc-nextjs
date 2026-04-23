import { NextRequest, NextResponse } from 'next/server';
import { createLeadFollowUpSequence, LeadFollowUpPayload } from '@/lib/notify/leadFollowUp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/leads/webhook
 * External entrypoint for the follow-up sequence creator. Internal callers
 * should import `createLeadFollowUpSequence` from '@/lib/notify/leadFollowUp'
 * directly — Cloudflare will interstitial server-to-server self-fetches to
 * www.lavacagc.com.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LeadFollowUpPayload;
    const result = await createLeadFollowUpSequence(body);
    if (result.status === 'invalid') {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (result.status === 'error') {
      return NextResponse.json({ error: result.error || 'Internal error' }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
