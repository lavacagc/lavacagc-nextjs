import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramLead, TelegramLeadPayload } from '@/lib/notify/telegramLead';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notify/telegram-lead
 * External entrypoint for the Telegram lead notifier. Internal callers should
 * import `sendTelegramLead` from '@/lib/notify/telegramLead' directly rather
 * than self-fetching — Cloudflare will interstitial server-to-server requests
 * hitting www.lavacagc.com.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TelegramLeadPayload;
    const result = await sendTelegramLead(body);
    const status = result.status === 'error' || result.status === 'failed' ? 500 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error('Telegram notification endpoint error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
