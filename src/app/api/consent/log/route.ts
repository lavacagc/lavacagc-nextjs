import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendFormFailureAlert } from '@/lib/notify/formErrorAlert';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * Server-side TCPA/terms consent logging for the public lead forms.
 *
 * Replaces the deployed `log-consent` Supabase edge function, which the forms
 * called with `ip_address: null` (a browser cannot know its own IP). A
 * stricter fn deploy around 2025-11-14 made that a Zod 400 - verified live on
 * 2026-07-13 - so every consent log from ContactForm, EstimateForm,
 * HomeEstimateForm and WarrantyForm silently failed for months (the forms
 * swallow the error by design). Logging server-side removes the problem
 * structurally: the IP and user agent come from the request itself.
 *
 * consent_logs.ip_address is a Postgres inet column - only set it when the
 * value parses as one (same guard as src/lib/listings/subscribers.ts).
 */

const ConsentSchema = z.object({
  user_email: z.string().trim().max(320).nullish(),
  user_phone: z.string().trim().max(60).nullish(),
  consent_type: z.string().trim().min(1).max(100),
  tcpa_consent: z.boolean().optional().default(false),
  consent_text: z.string().trim().max(2000).nullish(),
});

const RATE_LIMIT_MAX = 60; // per window, per IP
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const parsed = ConsentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const body = parsed.data;

    const ip = getClientIp(request);
    const rl = await checkRateLimit(`consent-log:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rl.allowed) {
      // Above 60/min/IP is flood/attack traffic, not legitimate lead volume,
      // so dropping consent here is not a compliance loss. Log the drop so it
      // is visible in Vercel logs, but deliberately do NOT fire
      // sendFormFailureAlert on 429/400 - an attacker exceeding the ceiling or
      // posting junk must not become an owner-alert flood vector.
      const truncatedEmail = body.user_email ? body.user_email.slice(0, 3) + '***' : 'none';
      console.error(
        `consent-log rate limited: consent_type=${body.consent_type} email=${truncatedEmail}`
      );
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }

    const row: Record<string, unknown> = {
      consent_type: body.consent_type,
      tcpa_consent: body.tcpa_consent,
      user_email: body.user_email || null,
      user_phone: body.user_phone || null,
      consent_text: body.consent_text || null,
      user_agent: request.headers.get('user-agent') || null,
    };
    if (ip && ip !== 'unknown' && /^[0-9a-fA-F.:]+$/.test(ip)) {
      row.ip_address = ip;
    }

    try {
      await supabaseRest('POST', 'consent_logs', row, { prefer: 'return=minimal' });
    } catch (err) {
      // A consent record that failed to write is a compliance signal, not
      // just a log line - tell the owner. The lead/claim itself is unaffected.
      console.error('consent_logs insert failed:', err);
      await sendFormFailureAlert({
        stage: 'consent',
        source: body.consent_type,
        message: 'Consent log failed to save - TCPA consent proof was NOT recorded',
        details: { error: err instanceof Error ? err.message : String(err) },
        lead: { email: body.user_email || undefined, phone: body.user_phone || undefined },
      });
      return NextResponse.json({ error: 'Failed to log consent' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Consent log error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
