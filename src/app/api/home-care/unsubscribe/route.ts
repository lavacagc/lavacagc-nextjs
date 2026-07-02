import { NextRequest, NextResponse } from 'next/server';
import { findHomeownerByUnsubscribeToken, updateHomeowner } from '@/lib/homecare/homeowners';
import { HC_ACCESS_COOKIE, HC_KNOWN_COOKIE } from '@/lib/homecare/accessCookie';
import { setStreamByEmail } from '@/lib/preferences/preferences';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get('token');
  const done = (status: string) => {
    const res = NextResponse.redirect(new URL(`/home-care?unsub=${status}`, origin));
    res.cookies.set(HC_ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
    res.cookies.set(HC_KNOWN_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  };

  if (!token) return done('invalid');
  try {
    const ho = await findHomeownerByUnsubscribeToken(token);
    if (ho && ho.status !== 'unsubscribed') {
      await updateHomeowner(ho.id, { status: 'unsubscribed', unsubscribed_at: new Date().toISOString() });
      // Keep the unified preference model in sync (best-effort).
      await setStreamByEmail(ho.email, 'home_care', false, 'self', 'home-care-unsubscribe-link').catch(
        (e) => console.error('preference sync on home-care unsubscribe failed:', e),
      );
    }
    return done('ok');
  } catch (error) {
    console.error('Home Care unsubscribe error:', error);
    return done('error');
  }
}
