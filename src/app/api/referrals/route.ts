import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

/**
 * CM-08: this route was public with NO rate limit, NO honeypot and NO body cap
 * - `await request.json()` on an unbounded stream, straight into an INSERT.
 * Anyone could write unlimited rows of unlimited size into a table the owner
 * is expected to act on.
 *
 * The gates below are the ones /api/home-care/subscribe already uses; this is
 * the same shape of public write, so it gets the same treatment. reCAPTCHA is
 * deliberately NOT added here: the referral form does not currently render a
 * reCAPTCHA widget, and adding a server check for a token the form never sends
 * would reject every real referral. The honeypot plus the rate limit are the
 * gates that work without changing the form; see CM-08 in chaos/findings.json.
 */
const MAX_BODY_BYTES = 16 * 1024;
/** Per-IP ceiling, matching /api/leads/submit - the same abuse shape. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 1000;
/** Server-side length caps. The form's maxLength attributes are not a control. */
const MAX_NAME = 120;
const MAX_EMAIL = 320;
const MAX_PHONE = 40;
const MAX_PROJECT_TYPE = 120;
const MAX_MESSAGE = 2000;

const capped = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Bots fill hidden fields; humans do not. Answer as though it worked so a
    // bot learns nothing, and write nothing.
    if (body.website) {
      return NextResponse.json({ success: true });
    }

    const rl = await checkRateLimit(`referrals:${getClientIp(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many referrals from this connection. Give it a minute and try again.' },
        { status: 429 },
      );
    }

    // Normalise and cap FIRST, so everything below works on trimmed strings of
    // known length rather than on whatever arrived (CM-08). The old code
    // destructured raw values and trimmed them only at insert time, which is
    // why a multi-megabyte name reached the table.
    const referrerName = capped(body.referrerName, MAX_NAME);
    const referrerEmail = capped(body.referrerEmail, MAX_EMAIL).toLowerCase();
    const referrerPhone = capped(body.referrerPhone, MAX_PHONE);
    const friendName = capped(body.friendName, MAX_NAME);
    const friendEmail = capped(body.friendEmail, MAX_EMAIL).toLowerCase();
    const friendPhone = capped(body.friendPhone, MAX_PHONE);
    const projectType = capped(body.projectType, MAX_PROJECT_TYPE);
    const message = capped(body.message, MAX_MESSAGE);
    const { contactTimePreference, contactTimeDetails, contactTimezone } = body;

    // Basic validation
    if (!referrerName || !referrerEmail || !referrerPhone || !friendName || !friendEmail || !friendPhone || !projectType) {
      return NextResponse.json(
        { error: 'All required fields must be filled out.' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(referrerEmail) || !emailRegex.test(friendEmail)) {
      return NextResponse.json(
        { error: 'Please provide valid email addresses.' },
        { status: 400 }
      );
    }

    // Phone validation
    const phoneRegex = /^[\+]?[0-9\(\)\s\-\.]{7,20}$/;
    if (!phoneRegex.test(referrerPhone) || !phoneRegex.test(friendPhone)) {
      return NextResponse.json(
        { error: 'Please provide valid phone numbers.' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabaseClient();

    // Validate the time preference enum server-side. Anything outside the
    // allowed set is silently dropped to null — the column CHECK constraint
    // would reject a bad value anyway, but we'd rather not fail the insert
    // over a malformed client payload.
    const ALLOWED_TIMES = new Set(['anytime', 'morning', 'afternoon', 'evening', 'weekends', 'specific']);
    const safeTimePref = typeof contactTimePreference === 'string' && ALLOWED_TIMES.has(contactTimePreference)
      ? contactTimePreference
      : null;
    const safeTimeDetails = safeTimePref === 'specific' && typeof contactTimeDetails === 'string'
      ? contactTimeDetails.slice(0, 200).trim() || null
      : null;
    const safeTimezone = typeof contactTimezone === 'string' && contactTimezone.length < 80
      ? contactTimezone
      : null;

    // Every string is capped server-side before it reaches the table. The
    // form's maxLength attributes bounded only the browser; a raw POST could
    // store a multi-megabyte name or message (CM-08).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from as any)('referrals')
      .insert({
        referrer_name: referrerName,
        referrer_email: referrerEmail,
        referrer_phone: referrerPhone,
        friend_name: friendName,
        friend_email: friendEmail,
        friend_phone: friendPhone,
        project_type: projectType,
        message: message || null,
        status: 'pending',
        contact_time_preference: safeTimePref,
        contact_time_details: safeTimeDetails,
        contact_timezone: safeTimezone,
      });

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { error: 'Failed to submit referral. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Referral submitted successfully!' },
      { status: 201 }
    );
  } catch (err) {
    console.error('Referral submission error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
