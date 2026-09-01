/**
 * Admin answer to "did the sign-in link actually go out?"
 *
 *   GET  /api/admin/home-care/member?email=…  -> membership + recent Home Care mail
 *   POST /api/admin/home-care/member          -> { email } resend the sign-in link
 *
 * WHY THIS EXISTS. The public /api/home-care/login endpoint answers every caller
 * identically on purpose, so it cannot be used to enumerate who is a member.
 * The cost is that staff got the same non-answer as a stranger: when the owner's
 * own link "never arrived" on 2026-08-06, the only way to learn that no
 * `homeowners` row existed for that address was a database session. The route
 * logging (see /api/home-care/login) fixes that after the fact; this fixes it
 * while someone is still on the phone.
 *
 * Admin auth is enforced by middleware on /api/admin/*, so enumeration is not a
 * concern here - a caller who reached this route is already authenticated staff.
 * Deliberately NOT behind the extra HOME_CARE_STAFF_EMAILS allowlist that the
 * Home Record view uses: that gate protects shut-off maps and appliance details,
 * which are home-security data. Membership status and whether an email was sent
 * are ordinary support facts, and gating them would mean the person answering
 * the phone cannot answer the phone.
 *
 * No secrets leave this route: tokens are never returned, and neither is the
 * body of any email - only what was sent, when, and what became of it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { findHomeownerByEmail, normalizeEmail } from '@/lib/homecare/homeowners';
import { canSendSignInLink, issueSignInLink, VERIFY_TOKEN_TTL_HOURS } from '@/lib/homecare/signInLink';
import { maskEmail } from '@/lib/maskEmail';
import { supabaseRest } from '@/lib/notify/supabase-rest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** How many recent Home Care emails to show for the address. */
const MAIL_HISTORY_LIMIT = 10;

interface MailRow {
  created_at: string;
  category: string;
  subject: string;
  status: string;
  error_message: string | null;
  sent_at: string | null;
}

/**
 * The address's recent mail, newest first.
 *
 * Best-effort: a member's status is the answer staff need most, and a failing
 * email_log read must not withhold it. An empty history and a broken history
 * look different to the caller (`mailHistoryError`) so nobody reads a Supabase
 * hiccup as "we never emailed them".
 */
async function readMailHistory(email: string): Promise<{ mail: MailRow[]; error: string | null }> {
  try {
    const rows = await supabaseRest<MailRow[]>(
      'GET',
      `email_log?select=created_at,category,subject,status,error_message,sent_at` +
        `&to_email=eq.${encodeURIComponent(email)}` +
        `&order=created_at.desc&limit=${MAIL_HISTORY_LIMIT}`,
    );
    return { mail: rows ?? [], error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[admin/home-care/member] email_log read failed:', message);
    return { mail: [], error: message };
  }
}

function readEmailParam(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = normalizeEmail(raw);
  // Loose on purpose: staff paste what the customer told them, and a typo
  // should come back as "no member with that address", not a 400.
  return normalized.includes('@') && normalized.length <= 320 ? normalized : null;
}

export async function GET(request: NextRequest) {
  const email = readEmailParam(request.nextUrl.searchParams.get('email'));
  if (!email) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });

  try {
    const homeowner = await findHomeownerByEmail(email);
    const { mail, error: mailHistoryError } = await readMailHistory(email);

    return NextResponse.json({
      email,
      member: homeowner
        ? {
            id: homeowner.id,
            first_name: homeowner.first_name,
            status: homeowner.status,
            created_at: homeowner.created_at,
            verified_at: homeowner.verified_at,
            unsubscribed_at: homeowner.unsubscribed_at,
            source: homeowner.source,
            // Whether a link is currently outstanding, without exposing it.
            has_pending_link: Boolean(homeowner.verify_token),
            verify_token_expires_at: homeowner.verify_token_expires_at,
            // What the public route would do with this address right now. This
            // is the whole point of the lookup: it names the branch instead of
            // leaving staff to infer it from a status.
            can_send_link: canSendSignInLink(homeowner),
          }
        : null,
      mail,
      mailHistoryError,
    });
  } catch (err) {
    console.error('[admin/home-care/member] lookup failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = readEmailParam(body.email ?? null);
  if (!email) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });

  try {
    const homeowner = await findHomeownerByEmail(email);
    // Staff get the real reason, unlike the public route. "There is nobody here
    // by that address" is exactly the sentence the customer needs to hear.
    if (!homeowner) {
      return NextResponse.json(
        { error: 'No Home Care member with that address. They need to sign up first.' },
        { status: 404 },
      );
    }
    if (!canSendSignInLink(homeowner)) {
      return NextResponse.json(
        {
          error:
            homeowner.status === 'unsubscribed'
              ? 'That member unsubscribed. Re-subscribe them from the preference centre before sending a link.'
              : `Cannot send a link to a member with status "${homeowner.status}".`,
        },
        { status: 409 },
      );
    }

    // Deliberately NOT charged to the public per-email throttle. That limit
    // exists to stop a stranger bombing someone's inbox; an authenticated staff
    // member resending to a customer who just asked for it is the opposite, and
    // hitting the limit here would block the support path exactly when the
    // customer has already tried a few times themselves.
    const send = await issueSignInLink(homeowner, request.nextUrl.origin);
    console.info(`[admin/home-care/member] resend ${send.status} for ${maskEmail(email)}`);

    if (send.status !== 'sent') {
      return NextResponse.json(
        { error: send.error ?? `Send ${send.status}`, status: send.status },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, expiresInHours: VERIFY_TOKEN_TTL_HOURS });
  } catch (err) {
    console.error('[admin/home-care/member] resend failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Resend failed' }, { status: 500 });
  }
}
