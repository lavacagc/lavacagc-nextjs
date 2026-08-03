import { NextRequest, NextResponse } from 'next/server';
import { findHomeownerByVerifyToken, updateHomeowner, newToken } from '@/lib/homecare/homeowners';
import { checklistUrl } from '@/lib/homecare/emailLinks';
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
import { preferencesUrlFor, isSuppressed } from '@/lib/preferences/preferences';
import { addOrUpdateResendContact } from '@/lib/notify/resendAudience';

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
    // Same self-heal the subscribe route applies: a row that predates the
    // backfill gets a token here rather than being emailed bare links forever.
    const accessToken = ho.access_token || newToken();
    await updateHomeowner(ho.id, {
      status: 'active',
      verified_at: ho.verified_at || new Date().toISOString(),
      verify_token: null,
      verify_token_expires_at: null,
      access_token: accessToken,
    });

    if (wasPending) {
      // New active opt-in → add to the Resend broadcast audience so future
      // broadcasts can reach them. The audience represents the 'announcements'
      // stream, so mirror THIS recipient's announcements preference rather than
      // hardcoding subscribed — otherwise a Home Care opt-in would resurrect a
      // prior announcements opt-out. Fire-and-forget: never block the redirect.
      const annOptedOut = await isSuppressed(ho.email, 'announcements').catch(() => false);
      void addOrUpdateResendContact(ho.email, {
        firstName: ho.first_name,
        unsubscribed: annOptedOut,
      });

      const preferencesUrl = await preferencesUrlFor(origin, ho.email).catch(() => undefined);
      await sendHomeCareWelcomeEmail({
        to: ho.email,
        firstName: ho.first_name,
        // Tokenized like every other portal email. The cookie this request sets
        // only helps in the browser that just verified: opened on their phone,
        // or more than 30 days later, a bare link lands on the signup page -
        // which is the reported bug, in the very first email a member gets.
        checklistUrl: checklistUrl(origin, accessToken, {
          utm: { utm_source: 'home_care_welcome', utm_medium: 'email' },
        }),
        unsubscribeUrl: `${origin}/api/home-care/unsubscribe?token=${encodeURIComponent(ho.unsubscribe_token)}`,
        preferencesUrl,
        homeownerId: ho.id,
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
