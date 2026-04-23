import { NextRequest, NextResponse } from 'next/server';
import { sendNewLeadEmail, NewLeadEmailPayload } from '@/lib/notify/newLeadEmail';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notify/new-lead
 * External entrypoint. Internal callers should import `sendNewLeadEmail` from
 * '@/lib/notify/newLeadEmail' directly — Cloudflare will interstitial
 * server-to-server self-fetches to www.lavacagc.com.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NewLeadEmailPayload;
    const result = await sendNewLeadEmail(body);
    const status = result.status === 'error' || result.status === 'failed' ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error('Notification endpoint error:', error);
    return NextResponse.json(
      { status: 'error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}
