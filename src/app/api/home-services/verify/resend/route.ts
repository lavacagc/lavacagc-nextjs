/**
 * POST /api/home-services/verify/resend  { request_id }
 *
 * Texts a fresh 4-digit code for a Held request (acceptance-criteria.md: at
 * most 3 sends in total, including the one at submit). A new code resets the
 * attempt counter and the 10 minute expiry.
 *
 * SEC3: an unknown id, a request that is not held, and a successful send all
 * answer the same `{ ok: true }`; the per-id rate limit counts unknown ids the
 * same way, so the 429 cannot be used to tell them apart either.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { isSmsConfigured, sendSms } from '@/lib/home-services/sms';
import { codeSmsBody, generateCode, hashCode, VERIFY_CODE_TTL_MS, VERIFY_MAX_SENDS } from '@/lib/home-services/verify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 512;
const Body = z.object({ request_id: z.string().uuid() });

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const parsed = Body.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const requestId = parsed.data.request_id;

    const ipLimit = await checkRateLimit(`hs-resend:${getClientIp(request)}`, 10, 60 * 60 * 1000);
    // The submit already spent one send, so the id bucket allows the remaining two.
    const idLimit = await checkRateLimit(`hs-resend-req:${requestId}`, VERIFY_MAX_SENDS - 1, 60 * 60 * 1000);
    if (!ipLimit.allowed || !idLimit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

    const rows = await supabaseRest<Array<{ id: string; status: string; phone: string; language: 'en' | 'es'; verify_sends: number }>>(
      'GET',
      `home_service_requests?select=id,status,phone,language,verify_sends&id=eq.${requestId}&limit=1`,
    );
    const row = rows?.[0];
    if (!row || row.status !== 'held' || !isSmsConfigured()) return NextResponse.json({ ok: true });
    if (row.verify_sends >= VERIFY_MAX_SENDS) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

    const code = generateCode();
    const hash = hashCode(code);
    if (!hash) return NextResponse.json({ ok: true });
    await supabaseRest('PATCH', `home_service_requests?id=eq.${row.id}`, {
      verify_code_hash: hash,
      verify_expires_at: new Date(Date.now() + VERIFY_CODE_TTL_MS).toISOString(),
      verify_attempts: 0,
      verify_sends: row.verify_sends + 1,
    }, { prefer: 'return=minimal' });
    const sms = await sendSms({ to: row.phone, body: codeSmsBody(code, row.language) });
    console.log('[home-services/verify/resend] sms:', sms.status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[home-services/verify/resend] unhandled:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
