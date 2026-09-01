/**
 * La Vaca Home Care - magic-link login.
 *
 * A returning homeowner enters just their email and we send a fresh sign-in
 * link (the same verify-token flow as onboarding; clicking it sets the
 * hc_access cookie and lands them on their checklist). We ALWAYS respond with
 * a generic success so this endpoint can't be used to enumerate who is a member.
 *
 * That generic answer is right facing the public and was wrong facing US. Every
 * outcome here used to be indistinguishable from every other: an address that
 * belongs to nobody produced no email, no log line and no `email_log` row -
 * byte-identical to a broken mailer. On 2026-08-06 the owner's own sign-in link
 * "never arrived", and answering why took a database session. So each outcome
 * now logs exactly one line naming itself (see `logOutcome`), with the address
 * masked so the logs never become a membership list. The HTTP response is
 * untouched: the caller still learns nothing.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyRecaptcha } from '@/lib/recaptchaVerify';
import { maskEmail } from '@/lib/maskEmail';
import { findHomeownerByEmail, normalizeEmail } from '@/lib/homecare/homeowners';
import { canSendSignInLink, issueSignInLink } from '@/lib/homecare/signInLink';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 8 * 1024;
const RECAPTCHA_ACTION = 'home_care_login';

/** Every way this endpoint can end, as one line a human can grep for. */
type LoginOutcome = 'sent' | 'no_member' | 'not_sendable' | 'throttled' | 'send_failed';

function logOutcome(outcome: LoginOutcome, email: string, detail?: string) {
  console.info(
    `[home-care/login] ${outcome} for ${maskEmail(email)}${detail ? ` (${detail})` : ''}`,
  );
}

const optStr = (max: number) => z.string().max(max).nullish();
const Schema = z
  .object({
    email: z.string().email().max(320),
    recaptchaToken: optStr(5000),
    honeypot: optStr(500),
  })
  .passthrough();

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

    // Do the member lookup + link send AFTER the response is flushed. Whether an
    // email belongs to an active member changes how much work happens (a DB
    // write + an email send), so doing it inline would leak membership through
    // response latency despite the generic body. `after()` runs post-response on
    // Vercel's runtime (unlike a naked fire-and-forget, which gets killed), so
    // the email still sends reliably while every caller sees the same fast 200.
    if (!emailRl.allowed) {
      logOutcome('throttled', normEmail, 'per-email limit');
    } else {
      after(async () => {
        try {
          // Only send a link to a member we are still allowed to mail. Silent
          // otherwise - never reveal whether an email is in the program.
          const existing = await findHomeownerByEmail(normEmail);
          if (!existing) {
            logOutcome('no_member', normEmail);
            return;
          }
          if (!canSendSignInLink(existing)) {
            logOutcome('not_sendable', normEmail, `status=${existing.status}`);
            return;
          }
          const send = await issueSignInLink(existing, origin);
          // A send that Resend refused leaves an email_log row, but only this
          // line says which login attempt it belonged to.
          if (send.status === 'sent') logOutcome('sent', normEmail, `status=${existing.status}`);
          else logOutcome('send_failed', normEmail, send.error ?? send.status);
        } catch (err) {
          console.error(`[home-care/login] deferred send threw for ${maskEmail(normEmail)}:`, err);
        }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Home Care login error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
