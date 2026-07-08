import { NextRequest, NextResponse } from 'next/server';
import { cleanEnv } from '@/lib/envClean';
import { syncAudienceSuppression, RESEND_AUDIENCE_ENV } from '@/lib/notify/resendAudience';
import { STREAM_KEYS } from '@/lib/preferences/preferences';

/**
 * GET /api/cron/resend-sync
 *
 * Automatic DB → Resend audience suppression sync so the manual admin button
 * isn't the only path. For each marketing stream it paginates the whole
 * audience, flags opt-outs `unsubscribed:true`, and re-subscribes anyone who
 * re-opted-in in the preference center.
 *
 * NOTE: a Resend audience carries ONE `unsubscribed` boolean per contact, not a
 * per-stream flag. Running the sync for each marketing stream in sequence means
 * the last stream processed wins per contact. In practice this audience maps to
 * the broadcast ('announcements') stream, so STREAM_KEYS is ordered with
 * 'announcements' effectively authoritative. If per-stream audiences are ever
 * introduced, give each its own audience id. (Flagged for the lead to confirm.)
 *
 * Auth: Bearer CRON_SECRET (same pattern as /api/cron/send-follow-ups), also
 * enforced by middleware. Schedule is wired separately in vercel.json.
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
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) {
    return NextResponse.json({ status: 'skipped', reason: 'no_api_key' });
  }

  const audienceId = cleanEnv(process.env[RESEND_AUDIENCE_ENV]);
  if (!audienceId) {
    return NextResponse.json({
      status: 'skipped',
      reason: 'no_audience_id',
      message: `${RESEND_AUDIENCE_ENV} not configured — cannot sync audience.`,
    });
  }

  const results = [];
  for (const stream of STREAM_KEYS) {
    // Sequential (not parallel) to stay within Resend's rate limits.
    const result = await syncAudienceSuppression(audienceId, stream);
    results.push({ stream, ...result });
  }

  const anyError = results.some((r) => r.status === 'error');
  return NextResponse.json(
    {
      status: anyError ? 'partial_error' : 'ok',
      audienceId,
      results,
    },
    { status: anyError ? 502 : 200 },
  );
}
