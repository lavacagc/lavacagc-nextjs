/**
 * Exchange a homeowner's stable access token for the portal cookie.
 *
 * This is what makes an emailed checklist link open the checklist. Without it
 * every email that points at /home-care/checklist bounces a recipient whose
 * `hc_access` cookie has lapsed - it lasts 30 days - onto the signup page, which
 * is what "the link is not reachable" turned out to be.
 *
 * GET, because it is followed from an email client. That is safe here: it grants
 * the recipient a view of their own plan and changes nothing. Mail scanners
 * fetching it set a cookie on a robot and nothing else.
 */
import { NextRequest, NextResponse } from 'next/server';
import { findHomeownerByAccessToken } from '@/lib/homecare/homeowners';
import {
  HC_ACCESS_COOKIE,
  HC_KNOWN_COOKIE,
  HC_ACCESS_MAX_AGE_SECONDS,
  hcAccessCookieOptions,
  hcKnownCookieOptions,
  sanitizeKnownName,
  signHomeAccess,
} from '@/lib/homecare/accessCookie';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Where the link may send them.
 *
 * An open redirect on a route that just handed out a session cookie would be a
 * genuinely bad combination, so this is an allow-list of paths rather than any
 * attempt to sanitise an arbitrary URL. Query strings on those paths survive,
 * because the newsletter's "Add to plan" buttons carry `?add=<task>`.
 */
const ALLOWED_PATHS = ['/home-care/checklist', '/home-care/guides', '/home-care/whats-new', '/home-care'];

export function safeDestination(raw: string | null): string {
  if (!raw) return '/home-care/checklist';
  // Reject anything that could leave the site: protocol-relative, absolute,
  // or backslash-escaped.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/home-care/checklist';
  const path = raw.split('?')[0].split('#')[0];
  const ok = ALLOWED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  return ok ? raw : '/home-care/checklist';
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get('token');
  const to = safeDestination(request.nextUrl.searchParams.get('to'));

  const rl = await checkRateLimit(`hc-access:${getClientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.redirect(new URL('/home-care?error=busy', origin));
  }

  if (!token) return NextResponse.redirect(new URL('/home-care?error=invalid', origin));

  let homeowner;
  try {
    homeowner = await findHomeownerByAccessToken(token);
  } catch (err) {
    // A lookup that FAILED is not a bad token. Sending someone to an "invalid
    // link" page when the database blinked teaches them the link is broken.
    console.error('[home-care/access] token lookup failed:', err);
    return NextResponse.redirect(new URL('/home-care?error=unavailable', origin));
  }

  if (!homeowner) return NextResponse.redirect(new URL('/home-care?error=invalid', origin));
  if (homeowner.status === 'unsubscribed') {
    return NextResponse.redirect(new URL('/home-care?error=unsubscribed', origin));
  }

  // Signed, exactly as /verify does it - a raw id in the cookie would let
  // anyone read any homeowner's plan by editing one value.
  //
  // signHomeAccess throws when LISTINGS_ACCESS_SECRET is unset or rotated away.
  // Unhandled that is a bare 500 from a link in a customer's inbox, with nothing
  // telling them what to do; caught, they get a page that says we could not open
  // it and offers the way back in.
  let signed: string;
  try {
    signed = await signHomeAccess(homeowner.id);
  } catch (err) {
    console.error('[home-care/access] could not sign the access cookie:', err);
    return NextResponse.redirect(new URL('/home-care?error=unavailable', origin));
  }

  const res = NextResponse.redirect(new URL(to, origin));
  res.cookies.set(HC_ACCESS_COOKIE, signed, hcAccessCookieOptions(HC_ACCESS_MAX_AGE_SECONDS));
  res.cookies.set(HC_KNOWN_COOKIE, sanitizeKnownName(homeowner.first_name), hcKnownCookieOptions(HC_ACCESS_MAX_AGE_SECONDS));
  return res;
}
