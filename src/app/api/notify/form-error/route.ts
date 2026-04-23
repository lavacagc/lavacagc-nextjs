import { NextRequest, NextResponse } from 'next/server';
import { sendFormFailureAlert, FormErrorAlertPayload } from '@/lib/notify/formErrorAlert';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notify/form-error
 * External entrypoint. Internal callers should import `sendFormFailureAlert`
 * from '@/lib/notify/formErrorAlert' directly — Cloudflare will interstitial
 * server-to-server self-fetches to www.lavacagc.com.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FormErrorAlertPayload;
    const result = await sendFormFailureAlert(body);
    const status = result.status === 'error' ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error('form-error notify endpoint crashed:', error);
    return NextResponse.json(
      { status: 'error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
