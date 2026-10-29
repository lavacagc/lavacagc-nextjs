/**
 * GET /api/cron/offers-expire - every 30 minutes (vercel.json).
 *
 * Also retries the SpecNook push of assigned offers still pending or failed
 * (only when SpecNook is configured).
 *
 * Offers past their 24 hours with nobody accepted become `expired`; their
 * recipients are closed with reason 'expired'; the request gets the admin note
 * "Offer expired with no acceptance - adjust pay and resend" and Alex gets a
 * Telegram alert (BD8). A recipient whose clock is paused on a detail request,
 * or whose deadline a detail reply pushed out, is never expired, and keeps the
 * offer open.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 * Checked here too, in constant time, so the route is safe on its own.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { expireOffers, retrySpecNookPushes } from '@/lib/home-services/offers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const run = await expireOffers(new Date());
    // Assigned jobs whose SpecNook push is pending or failed (no-op while not connected).
    const pushes = await retrySpecNookPushes();
    return NextResponse.json({ ok: true, ...run, pushes });
  } catch (err) {
    console.error('offers-expire failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: 'offers-expire failed' }, { status: 500 });
  }
}
