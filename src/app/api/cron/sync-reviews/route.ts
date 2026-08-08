import { NextRequest, NextResponse } from 'next/server';
import { syncGoogleReviews } from '@/lib/reviews/syncGoogleReviews';
import { sendTelegramMessage, escapeTelegramClipped } from '@/lib/notify/telegramMessage';

/**
 * GET /api/cron/sync-reviews
 *
 * Pulls Google reviews in on a schedule, which nothing did before: the old
 * pg_cron job ran monthly, never refreshed the access token, and logged
 * "success" whatever Google answered (see syncGoogleReviews.ts for the full
 * diagnosis). New reviews therefore only ever appeared when somebody pressed
 * two buttons in the admin by hand.
 *
 * Daily rather than persistent, per the owner: reviews arrive a handful of
 * times a month, and the six public components that read `google_reviews` are
 * happy to be a few hours behind. The manual Sync button stays for the moment
 * a review lands and it needs to be on the site now.
 *
 * A FAILURE IS ANNOUNCED. The whole reason this went unnoticed for months is
 * that a broken sync looked exactly like a working one, so a failed run pings
 * Telegram with Google's own message. The alert is best-effort - it must never
 * turn a sync failure into a 500 that Vercel retries.
 *
 * Auth: Bearer CRON_SECRET, same as every other cron route here, also enforced
 * in middleware. The schedule lives in vercel.json.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'Server misconfiguration: CRON_SECRET not set' },
      { status: 500 },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await syncGoogleReviews('cron');

  if (result.status === 'error') {
    try {
      await sendTelegramMessage(
        '<b>Google reviews did not sync</b>\n\n'
        + `Step: ${escapeTelegramClipped(result.failedStep ?? 'unknown', 40)}\n`
        + `${escapeTelegramClipped(result.message ?? 'no message', 600)}\n\n`
        + 'The site keeps showing the reviews it already has. If this repeats, '
        + 'reconnect from the admin Google Reviews tab.',
      );
    } catch (err) {
      console.error('review sync alert failed:', err instanceof Error ? err.message : err);
    }
  }

  // 200 even on a failed sync: the run itself completed and recorded the
  // failure, and a non-2xx here only earns a retry that would fail the same
  // way. The status in the body is the answer.
  return NextResponse.json(result);
}
