/**
 * La Vaca Home Care — magic-link login.
 *
 * A returning, already-verified homeowner enters just their email and we send a
 * fresh sign-in link (the same verify-token flow as onboarding; clicking it sets
 * the hc_access cookie and lands them on their checklist). We ALWAYS respond with
 * a generic success so this endpoint can't be used to enumerate who is a member.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyRecaptcha } from '@/lib/recaptchaVerify';
import {
  findHomeownerByEmail,
  updateHomeowner,
  newToken,
  hoursFromNow,
  normalizeEmail,
} from '@/lib/homecare/homeowners';
import { sendHomeCareVerificationEmail } from '@/lib/notify/sendHomeCareEmails';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 8 * 1024;
const RECAPTCHA_ACTION = 'home_care_login';
const VERIFY_TOKEN_TTL_HOURS = 48;

const optStr = (max: number) => z.string().max(max).nullish();
const Schema = z
  .object({
    email: z.string().email().max(320),
    recaptchaToken: optStr(5000),
    honeypot: optStr(500),
  })
  .passthrough();

function buildVerifyUrl(origin: string, token: string): string {
  const u = new URL(`${origin}/api/home-care/verify`);
  u.searchParams.set('token', token);
  return u.toString();
}
function buildUnsubscribeUrl(origin: string, token: string): string {
  return `${origin}/api/home-care/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const parsed = Schema.safeParse(parsedJson);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { email, recaptchaToken, honeypot } = parsed.data;

    if (honeypot) return NextResponse.json({ ok: true }); // silently accept bots

    // Per-IP throttle.
    const rl = await checkRateLimit(`hc-login:${getClientIp(request)}`, 5, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } });
    }

    // reCAPTCHA.
    if (!recaptchaToken) return NextResponse.json({ error: 'Missing reCAPTCHA token' }, { status: 400 });
    const result = await verifyRecaptcha(recaptchaToken, RECAPTCHA_ACTION);
    if (!result.success) return NextResponse.json({ error: 'reCAPTCHA verification failed' }, { status: 403 });

    const normEmail = normalizeEmail(email);
    const origin = request.nextUrl.origin;

    // Per-email throttle (stops inbox bombing); generic success either way.
    const emailRl = await checkRateLimit(`hc-login-email:${normEmail}`, 3, 10 * 60 * 1000);
    if (!emailRl.allowed) return NextResponse.json({ ok: true });

    // Only send a link to an already-verified (active) member. Silent otherwise —
    // never reveal whether an email is in the program.
    const existing = await findHomeownerByEmail(normEmail);
    if (existing && existing.status === 'active') {
      const verifyToken = newToken();
      await updateHomeowner(existing.id, {
        verify_token: verifyToken,
        verify_token_expires_at: hoursFromNow(VERIFY_TOKEN_TTL_HOURS),
      });
      await sendHomeCareVerificationEmail({
        to: normEmail,
        firstName: existing.first_name,
        verifyUrl: buildVerifyUrl(origin, verifyToken),
        unsubscribeUrl: buildUnsubscribeUrl(origin, existing.unsubscribe_token),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Home Care login error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
