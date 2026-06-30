import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyRecaptcha, verifyRecaptchaV2 } from '@/lib/recaptchaVerify';
import {
  findHomeownerByEmail,
  insertHomeowner,
  updateHomeowner,
  logHomeownerConsent,
  newToken,
  hoursFromNow,
  normalizeEmail,
} from '@/lib/homecare/homeowners';
import { sendHomeCareVerificationEmail } from '@/lib/notify/sendHomeCareEmails';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 16 * 1024;
const RECAPTCHA_ACTION = 'home_care_signup';
const VERIFY_TOKEN_TTL_HOURS = 48;

const optStr = (max: number) => z.string().max(max).nullish();
const Schema = z
  .object({
    first_name: z.string().min(1).max(200),
    email: z.string().email().max(320),
    phone: optStr(60),
    zip: z.string().max(20).nullish(),
    home_type: optStr(40),
    recaptchaToken: optStr(5000),
    recaptchaV2Token: optStr(5000),
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
    const { first_name, email, phone, zip, home_type, recaptchaToken, recaptchaV2Token, honeypot } = parsed.data;

    if (honeypot) return NextResponse.json({ ok: true }); // silently accept bots

    // Per-IP throttle.
    const rl = await checkRateLimit(`hc-subscribe:${getClientIp(request)}`, 5, 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } });
    }

    // reCAPTCHA.
    if (recaptchaV2Token) {
      if (!(await verifyRecaptchaV2(recaptchaV2Token))) {
        return NextResponse.json({ error: 'reCAPTCHA verification failed' }, { status: 403 });
      }
    } else {
      if (!recaptchaToken) return NextResponse.json({ error: 'Missing reCAPTCHA token' }, { status: 400 });
      const result = await verifyRecaptcha(recaptchaToken, RECAPTCHA_ACTION);
      if (!result.success) return NextResponse.json({ error: 'reCAPTCHA verification failed' }, { status: 403 });
    }

    const normEmail = normalizeEmail(email);
    const cleanZip = (zip ?? '').match(/\d{5}/)?.[0] ?? null;
    const origin = request.nextUrl.origin;
    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent');

    // Per-email throttle (stops inbox bombing); respond with generic success.
    const emailRl = await checkRateLimit(`hc-subscribe-email:${normEmail}`, 3, 10 * 60 * 1000);
    if (!emailRl.allowed) return NextResponse.json({ ok: true });

    const existing = await findHomeownerByEmail(normEmail);
    const verifyToken = newToken();
    const verifyUrl = buildVerifyUrl(origin, verifyToken);

    if (existing && existing.status === 'active') {
      // Already verified — resend a fresh magic link (new device, etc.).
      await updateHomeowner(existing.id, { verify_token: verifyToken, verify_token_expires_at: hoursFromNow(VERIFY_TOKEN_TTL_HOURS) });
      await sendHomeCareVerificationEmail({ to: normEmail, firstName: existing.first_name || first_name, verifyUrl, unsubscribeUrl: buildUnsubscribeUrl(origin, existing.unsubscribe_token) });
      return NextResponse.json({ ok: true });
    }

    if (existing) {
      const unsubToken = existing.unsubscribe_token || newToken();
      await updateHomeowner(existing.id, {
        first_name: first_name || existing.first_name,
        phone: phone || null,
        zip: cleanZip,
        home_type: home_type || null,
        status: 'pending',
        verify_token: verifyToken,
        verify_token_expires_at: hoursFromNow(VERIFY_TOKEN_TTL_HOURS),
        unsubscribe_token: unsubToken,
        unsubscribed_at: null,
        source: 'home-care',
      });
      await logHomeownerConsent({ email: normEmail, phone, ip, userAgent });
      await sendHomeCareVerificationEmail({ to: normEmail, firstName: first_name, verifyUrl, unsubscribeUrl: buildUnsubscribeUrl(origin, unsubToken) });
      return NextResponse.json({ ok: true });
    }

    const unsubToken = newToken();
    await insertHomeowner({
      email: normEmail,
      first_name: first_name || null,
      phone: phone || null,
      zip: cleanZip,
      home_type: home_type || null,
      status: 'pending',
      verify_token: verifyToken,
      verify_token_expires_at: hoursFromNow(VERIFY_TOKEN_TTL_HOURS),
      unsubscribe_token: unsubToken,
      source: 'home-care',
      consent_ip: ip,
      consent_user_agent: userAgent,
    });
    await logHomeownerConsent({ email: normEmail, phone, ip, userAgent });
    await sendHomeCareVerificationEmail({ to: normEmail, firstName: first_name, verifyUrl, unsubscribeUrl: buildUnsubscribeUrl(origin, unsubToken) });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Home Care subscribe error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
