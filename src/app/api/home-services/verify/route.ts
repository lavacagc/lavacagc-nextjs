/**
 * POST /api/home-services/verify  { request_id, code }
 *
 * Confirms the homeowner's phone with the 4-digit code texted at submit
 * (acceptance-criteria.md: 5 attempts, 10 minute expiry). Success sets
 * phone_verified, phone_verified_at, status 'new', and sends the owner alert
 * that was held back while the request sat in Held.
 *
 * SEC3: every failure - unknown request, not held, expired, out of attempts,
 * wrong code - answers the same `invalid_code`, so an unauthenticated caller
 * learns nothing about which request ids exist.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { isSmsConfigured } from '@/lib/home-services/sms';
import { codeMatches, VERIFY_MAX_ATTEMPTS } from '@/lib/home-services/verify';
import { photosForRequest, signPhotoUrls } from '@/lib/home-services/photos';
import { sendOwnerAlert, type AlertableRequest } from '@/lib/home-services/requests';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY_BYTES = 1024;
const Body = z.object({ request_id: z.string().uuid(), code: z.string().regex(/^\d{4}$/) });

interface HeldRow extends AlertableRequest {
  status: string;
  verify_code_hash: string | null;
  verify_expires_at: string | null;
  verify_attempts: number;
}

const invalid = () => NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 });

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
    const { request_id: requestId, code } = parsed.data;

    const ipLimit = await checkRateLimit(`hs-verify:${getClientIp(request)}`, 20, 10 * 60 * 1000);
    const idLimit = await checkRateLimit(`hs-verify-req:${requestId}`, VERIFY_MAX_ATTEMPTS * 3, 60 * 60 * 1000);
    if (!ipLimit.allowed || !idLimit.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

    const rows = await supabaseRest<HeldRow[]>(
      'GET',
      `home_service_requests?select=id,lead_id,status,services,answers,first_name,last_name,phone,email,address,town,zip,timing,notes,language,source,listing_id,phone_verified,verify_code_hash,verify_expires_at,verify_attempts&id=eq.${requestId}&limit=1`,
    );
    const row = rows?.[0];
    if (!row) return invalid();
    if (row.phone_verified) return NextResponse.json({ ok: true, status: row.status });
    if (row.status !== 'held' || !row.verify_code_hash) return invalid();
    if (row.verify_attempts >= VERIFY_MAX_ATTEMPTS) return invalid();
    if (!row.verify_expires_at || Date.parse(row.verify_expires_at) < Date.now()) return invalid();

    if (!codeMatches(code, row.verify_code_hash)) {
      await supabaseRest('PATCH', `home_service_requests?id=eq.${row.id}`, { verify_attempts: row.verify_attempts + 1 }, { prefer: 'return=minimal' });
      return invalid();
    }

    // Conditional on still being held, so two racing correct submits alert once.
    const updated = await supabaseRest<Array<{ id: string }>>(
      'PATCH',
      `home_service_requests?id=eq.${row.id}&status=eq.held`,
      { phone_verified: true, phone_verified_at: new Date().toISOString(), status: 'new', verify_code_hash: null },
    );
    if (updated?.length) {
      const photos = await photosForRequest(row.id);
      const urls = await signPhotoUrls(photos.map((p) => p.storage_path));
      const alert = await sendOwnerAlert({ ...row, phone_verified: true }, urls, { smsConfigured: isSmsConfigured() });
      console.log('[home-services/verify] verified; owner alert:', JSON.stringify(alert));
    }
    return NextResponse.json({ ok: true, status: 'new' });
  } catch (err) {
    console.error('[home-services/verify] unhandled:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
