import { NextRequest, NextResponse } from 'next/server';
import { cleanEnv } from '@/lib/envClean';
import { syncAudienceSuppression, RESEND_AUDIENCE_ENV } from '@/lib/notify/resendAudience';

/**
 * GET /api/cron/resend-sync
 *
 * Automatic DB → Resend audience suppression sync so the manual admin button
 * isn't the only path. Paginates the whole audience and flags opt-outs
 * `unsubscribed:true` (suppress-only — see resendAudience.ts).
 *
 * ONE stream only ('announcements'). A Resend audience carries a SINGLE
 * `unsubscribed` boolean per contact, and this audience is the general broadcast
 * ('announcements') list. Because the underlying sync is suppress-only, running
 * it for every marketing stream would flag the UNION of all opt-outs onto that
 * one flag — over-suppressing a contact who only opted out of home_care/
 * buy_remodel from the announcements broadcast they still want. So we sync the
 * stream the audience actually represents. Finer control needs a dedicated
 * Resend audience per stream (then sync each against its own id).
 *
 * Auth: Bearer CRON_SECRET (same pattern as /api/cron/send-follow-ups), also
 * enforced by middleware. Schedule is wired separately in vercel.json.
 */

/** The marketing stream this shared broadcast audience represents. */
const AUDIENCE_STREAM = 'announcements' as const;

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

  const result = await syncAudienceSuppression(audienceId, AUDIENCE_STREAM);
  const isError = result.status === 'error';
  return NextResponse.json(
    {
      status: isError ? 'error' : 'ok',
      audienceId,
      stream: AUDIENCE_STREAM,
      result,
    },
    { status: isError ? 502 : 200 },
  );
}
