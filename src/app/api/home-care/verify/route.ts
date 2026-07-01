import { NextRequest, NextResponse } from 'next/server';
import { findHomeownerByVerifyToken, updateHomeowner } from '@/lib/homecare/homeowners';
import {
  signHomeAccess,
  HC_ACCESS_COOKIE,
  HC_KNOWN_COOKIE,
  HC_ACCESS_MAX_AGE_SECONDS,
  hcAccessCookieOptions,
  hcKnownCookieOptions,
  sanitizeKnownName,
} from '@/lib/homecare/accessCookie';
import { sendHomeCareWelcomeEmail } from '@/lib/notify/sendHomeCareEmails';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function errorRedirect(origin: string, error: string): NextResponse {
  return NextResponse.redirect(new URL(`/home-care?error=${error}`, origin));
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return errorRedirect(origin, 'invalid');

  try {
    const ho = await findHomeownerByVerifyToken(token);
    if (!ho || ho.status === 'unsubscribed') return errorRedirect(origin, 'expired');
    if (ho.verify_token_expires_at && new Date(ho.verify_token_expires_at).getTime() < Date.now()) {
      return errorRedirect(origin, 'expired');
    }

    const wasPending = ho.status !== 'active';
    await updateHomeowner(ho.id, {
      status: 'active',
      verified_at: ho.verified_at || new Date().toISOString(),
      verify_token: null,
      verify_token_expires_at: null,
    });

    if (wasPending) {
      await sendHomeCareWelcomeEmail({
        to: ho.email,
        firstName: ho.first_name,
        checklistUrl: `${origin}/home-care/checklist`,
        unsubscribeUrl: `${origin}/api/home-care/unsubscribe?token=${encodeURIComponent(ho.unsubscribe_token)}`,
      }).catch((err) => console.error('home-care welcome email failed:', err));
    }

    // First-time verifiers run the setup wizard; returning ones go to their checklist.
    const landing = wasPending ? '/home-care/setup' : '/home-care/checklist?welcome=1';
    const response = NextResponse.redirect(new URL(landing, origin));
    response.cookies.set(HC_ACCESS_COOKIE, await signHomeAccess(ho.id), hcAccessCookieOptions(HC_ACCESS_MAX_AGE_SECONDS));
    response.cookies.set(HC_KNOWN_COOKIE, sanitizeKnownName(ho.first_name), hcKnownCookieOptions(HC_ACCESS_MAX_AGE_SECONDS));
    return response;
  } catch (error) {
    console.error('Home Care verify error:', error);
    return errorRedirect(origin, 'error');
  }
}
