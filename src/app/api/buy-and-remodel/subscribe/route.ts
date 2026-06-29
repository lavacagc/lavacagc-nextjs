import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import {
  verifyRecaptcha,
  verifyRecaptchaV2,
  isRecaptchaV2Configured,
} from '@/lib/recaptchaVerify';
import {
  findByEmail,
  insertSubscriber,
  updateSubscriber,
  logConsent,
  newToken,
  hoursFromNow,
  normalizeEmail,
} from '@/lib/listings/subscribers';
import { sendListingsVerificationEmail } from '@/lib/notify/sendListingsEmails';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// A signup payload is tiny; 16 KB is generous headroom while bounding abuse.
const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RECAPTCHA_ACTION = 'buy_remodel_unlock';
const VERIFY_TOKEN_TTL_HOURS = 48;

const optStr = (max: number) => z.string().max(max).nullish();
const SubscribeSchema = z
  .object({
    first_name: z.string().min(1).max(200),
    last_name: z.string().min(1).max(200),
    email: z.string().email().max(320),
    phone: optStr(60),
    // Comma/space separated zips as a single string OR an array.
    zips: z.union([z.string().max(500), z.array(z.string().max(20)).max(50)]).nullish(),
    recaptchaToken: optStr(5000),
    recaptchaAction: optStr(100),
    recaptchaV2Token: optStr(5000),
    honeypot: optStr(500),
  })
  .passthrough();

/** Parse "07450, 07042 07039" → ['07450','07042','07039'] (5-digit only, deduped, max 25). */
function parseZips(input: unknown): string[] {
  let raw: string[];
  if (Array.isArray(input)) raw = input.map((z) => String(z));
  else if (typeof input === 'string') raw = input.split(/[\s,;]+/);
  else return [];
  const zips = raw
    .map((z) => z.trim())
    .filter((z) => /^\d{5}$/.test(z));
  return Array.from(new Set(zips)).slice(0, 25);
}

function buildUnsubscribeUrl(origin: string, token: string): string {
  return `${origin}/api/buy-and-remodel/unsubscribe?token=${encodeURIComponent(token)}`;
}

function buildVerifyUrl(origin: string, token: string, next?: string): string {
  const u = new URL(`${origin}/api/buy-and-remodel/verify`);
  u.searchParams.set('token', token);
  if (next) u.searchParams.set('next', next);
  return u.toString();
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
    const parsed = SubscribeSchema.safeParse(parsedJson);
    if (!parsed.success) {
      console.warn('Subscribe validation failed:', parsed.error.issues.slice(0, 3));
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { first_name, last_name, email, phone, zips, recaptchaToken, recaptchaV2Token, honeypot } =
      parsed.data;

    // Silently accept honeypot hits — bots think they succeeded.
    if (honeypot) {
      return NextResponse.json({ ok: true });
    }

    // Optional `next` (where to land after verifying) — sanitized in the verify route too.
    const nextParam = (parsedJson as { next?: unknown })?.next;
    const next = typeof nextParam === 'string' && nextParam.startsWith('/buy-and-remodel/') ? nextParam : undefined;

    // Throttle per IP before expensive downstream work.
    const rl = await checkRateLimit(
      `br-subscribe:${getClientIp(request)}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_SECONDS * 1000,
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? RATE_LIMIT_WINDOW_SECONDS) } },
      );
    }

    // reCAPTCHA gate — identical two-phase flow to /api/leads/submit.
    if (recaptchaV2Token) {
      const v2Ok = await verifyRecaptchaV2(recaptchaV2Token);
      if (!v2Ok) {
        return NextResponse.json({ error: 'reCAPTCHA verification failed' }, { status: 403 });
      }
    } else {
      if (!recaptchaToken) {
        return NextResponse.json({ error: 'Missing reCAPTCHA token' }, { status: 400 });
      }
      // Verify against the server-side expected action, not the client-claimed one.
      const result = await verifyRecaptcha(recaptchaToken, RECAPTCHA_ACTION);
      if (!result.success) {
        if (result.reason === 'low_score' && isRecaptchaV2Configured()) {
          return NextResponse.json({ challenge: 'recaptcha_v2' }, { status: 200 });
        }
        return NextResponse.json({ error: 'reCAPTCHA verification failed' }, { status: 403 });
      }
    }

    const normEmail = normalizeEmail(email);
    const zipCodes = parseZips(zips);
    const origin = request.nextUrl.origin;
    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent');

    // Per-EMAIL throttle (independent of the per-IP limit above): stops a
    // distributed attacker from bombing a victim's inbox with verification
    // emails. Respond with the same generic success so nothing is revealed.
    const emailRl = await checkRateLimit(`br-subscribe-email:${normEmail}`, 3, 10 * 60 * 1000);
    if (!emailRl.allowed) {
      return NextResponse.json({ ok: true });
    }

    const existing = await findByEmail(normEmail);

    if (existing && existing.status === 'active') {
      // Already verified — don't reset state; just resend a magic access link so a
      // returning visitor on a new device can unlock without re-verifying.
      const verifyUrl = buildVerifyUrl(origin, newToken(), next);
      // Issue a fresh short-lived token so the resent link works.
      const token = new URL(verifyUrl).searchParams.get('token')!;
      await updateSubscriber(existing.id, {
        verify_token: token,
        verify_token_expires_at: hoursFromNow(VERIFY_TOKEN_TTL_HOURS),
      });
      await sendListingsVerificationEmail({
        to: normEmail,
        firstName: existing.first_name || first_name,
        verifyUrl,
        unsubscribeUrl: buildUnsubscribeUrl(origin, existing.unsubscribe_token),
      });
      return NextResponse.json({ ok: true });
    }

    const verifyToken = newToken();
    const verifyUrl = buildVerifyUrl(origin, verifyToken, next);

    if (existing) {
      // pending or unsubscribed → (re)start the double opt-in.
      const unsubToken = existing.unsubscribe_token || newToken();
      await updateSubscriber(existing.id, {
        first_name,
        last_name,
        phone: phone || null,
        zip_codes: zipCodes,
        status: 'pending',
        verify_token: verifyToken,
        verify_token_expires_at: hoursFromNow(VERIFY_TOKEN_TTL_HOURS),
        unsubscribe_token: unsubToken,
        unsubscribed_at: null,
        source: 'buy-and-remodel',
      });
      await logConsent({ email: normEmail, phone, ip, userAgent });
      await sendListingsVerificationEmail({
        to: normEmail,
        firstName: first_name,
        verifyUrl,
        unsubscribeUrl: buildUnsubscribeUrl(origin, unsubToken),
      });
      return NextResponse.json({ ok: true });
    }

    // Brand-new subscriber.
    const unsubToken = newToken();
    await insertSubscriber({
      email: normEmail,
      first_name,
      last_name,
      phone: phone || null,
      zip_codes: zipCodes,
      status: 'pending',
      verify_token: verifyToken,
      verify_token_expires_at: hoursFromNow(VERIFY_TOKEN_TTL_HOURS),
      unsubscribe_token: unsubToken,
      source: 'buy-and-remodel',
      consent_ip: ip,
      consent_user_agent: userAgent,
    });
    await logConsent({ email: normEmail, phone, ip, userAgent });
    await sendListingsVerificationEmail({
      to: normEmail,
      firstName: first_name,
      verifyUrl,
      unsubscribeUrl: buildUnsubscribeUrl(origin, unsubToken),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Buy+Remodel subscribe error:', error);
    // Generic success-shaped failure would hide real errors; return 500 so the
    // client shows a retry message, but never leak internals.
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
