import { NextRequest, NextResponse } from 'next/server';
import {
  findByVerifyToken,
  updateSubscriber,
} from '@/lib/listings/subscribers';
import {
  signAccess,
  ACCESS_COOKIE_NAME,
  ACCESS_MAX_AGE_SECONDS,
  accessCookieOptions,
  KNOWN_COOKIE_NAME,
  knownCookieOptions,
  sanitizeKnownName,
} from '@/lib/listings/accessCookie';
import { sendListingsWelcomeEmail } from '@/lib/notify/sendListingsEmails';
import { addOrUpdateResendContact } from '@/lib/notify/resendAudience';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Only allow same-origin listing paths as a post-verify destination. */
function sanitizeNext(next: string | null): string {
  if (next && next.startsWith('/buy-and-remodel/') && !next.startsWith('/buy-and-remodel/unlock')) {
    return next;
  }
  return '/buy-and-remodel';
}

function unlockRedirect(origin: string, error: string): NextResponse {
  return NextResponse.redirect(new URL(`/buy-and-remodel/unlock?error=${error}`, origin));
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get('token');
  const next = sanitizeNext(request.nextUrl.searchParams.get('next'));

  if (!token) {
    return unlockRedirect(origin, 'invalid');
  }

  try {
    const sub = await findByVerifyToken(token);

    // Unknown token, already-unsubscribed, or expired → treat as invalid/expired.
    if (!sub || sub.status === 'unsubscribed') {
      return unlockRedirect(origin, 'expired');
    }
    if (sub.verify_token_expires_at && new Date(sub.verify_token_expires_at).getTime() < Date.now()) {
      return unlockRedirect(origin, 'expired');
    }

    const wasPending = sub.status !== 'active';

    // Activate (idempotent for already-active resends) and clear the one-time token.
    await updateSubscriber(sub.id, {
      status: 'active',
      verified_at: sub.verified_at || new Date().toISOString(),
      verify_token: null,
      verify_token_expires_at: null,
    });

    // Welcome email only on the first activation, not on every magic-link reissue.
    if (wasPending) {
      // New active opt-in → add to the Resend broadcast audience. Fire-and-forget:
      // the helper never throws and no-ops when unconfigured, so it can't block
      // or fail this verification redirect.
      void addOrUpdateResendContact(sub.email, {
        firstName: sub.first_name,
        unsubscribed: false,
      });

      await sendListingsWelcomeEmail({
        to: sub.email,
        firstName: sub.first_name,
        browseUrl: `${origin}/buy-and-remodel`,
        unsubscribeUrl: `${origin}/api/buy-and-remodel/unsubscribe?token=${encodeURIComponent(sub.unsubscribe_token)}`,
      }).catch((err) => console.error('welcome email failed:', err));
    }

    const response = NextResponse.redirect(new URL(next, origin));
    response.cookies.set(ACCESS_COOKIE_NAME, await signAccess(sub.id), accessCookieOptions(ACCESS_MAX_AGE_SECONDS));
    // Readable hint cookie: lets the client greet returning subscribers and gate
    // the tracking beacon. Identity is still taken from the signed br_access cookie.
    response.cookies.set(KNOWN_COOKIE_NAME, sanitizeKnownName(sub.first_name), knownCookieOptions(ACCESS_MAX_AGE_SECONDS));
    return response;
  } catch (error) {
    console.error('Buy+Remodel verify error:', error);
    return unlockRedirect(origin, 'error');
  }
}
