/**
 * POST /api/home-services/request - the submit of the three-screen request flow.
 *
 * Contract and order of checks: docs/home-services/acceptance-criteria.md,
 * "Request flow API". In order:
 *   body cap (32 KB) -> schema -> honeypot (silent 200) -> fill time under 5 s
 *   (silent 200) -> rate limit per IP (5/min) and per phone (3/h) -> reCAPTCHA
 *   -> service area (403 out_of_area) -> dedupe (merge within 24 h) -> leads
 *   row -> home_service_requests row -> claim photos -> owner alert ->
 *   follow-up email -> customer text + one-time code.
 *
 * It composes the same helpers /api/leads/submit uses (sanitizer, scorer,
 * Telegram, owner email, follow-up drip, rate limiter, reCAPTCHA) rather than
 * calling that route, so the existing five forms are untouched.
 *
 * A request is never lost to a failing leads insert: the home_service_requests
 * row is the record Alex works from, so it is still written (lead_id null), the
 * owner is still alerted, and the failure is escalated through the form-error
 * alert channel. That is the same "never lose the lead" rule the leads route
 * lives by, applied one table further.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { scoreLead, prepareLeadForScoring } from '@/lib/leadScoring';
import { sanitizeLeadForInsert } from '@/lib/leadSanitize';
import { createLeadFollowUpSequence } from '@/lib/notify/leadFollowUp';
import { sendFormFailureAlert } from '@/lib/notify/formErrorAlert';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyRecaptcha, verifyRecaptchaV2, isRecaptchaV2Configured } from '@/lib/recaptchaVerify';
import { geoTierLabel, GEO_TIER_HEADER } from '@/lib/geo/tier';
import { isSmsConfigured, normalizeUsPhone, sendSms } from '@/lib/home-services/sms';
import { isInServiceArea } from '@/lib/home-services/serviceArea';
import { readAttribution } from '@/lib/home-services/attribution';
import { claimDraftPhotos, signPhotoUrls } from '@/lib/home-services/photos';
import { generateCode, hashCode, VERIFY_CODE_TTL_MS } from '@/lib/home-services/verify';
import {
  RequestBodySchema,
  MAX_REQUEST_BODY_BYTES,
  MIN_FILL_MS,
  DEDUPE_WINDOW_MS,
  RECAPTCHA_ACTION,
  validateRequest,
  dedupeKey,
  mergeAnswers,
  leadFields,
  phoneDigits,
  confirmationSmsBody,
  sendOwnerAlert,
  withTimeout,
  type AlertableRequest,
  type RequestStatus,
} from '@/lib/home-services/requests';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const IP_LIMIT = 5;
const IP_WINDOW_MS = 60 * 1000;
const PHONE_LIMIT = 3;
const PHONE_WINDOW_MS = 60 * 60 * 1000;

/** Same hook as /api/leads/submit: inert unless set, 32+ chars, and not production. */
function isE2eRecaptchaBypass(token: string | null | undefined): boolean {
  const expected = process.env.RECAPTCHA_E2E_BYPASS_TOKEN;
  return Boolean(expected && expected.length >= 32 && process.env.VERCEL_ENV !== 'production' && token === expected);
}

/**
 * What a bot that tripped the honeypot or the timer is told: exactly the shape
 * of a success, with a random request id (review D10), so the answer does not
 * reveal that nothing was saved.
 */
function silentOk() {
  return NextResponse.json({ ok: true, request_id: randomUUID(), status: 'new', verification: 'skipped', merged: false });
}

/** Same-origin path the visitor submitted from, e.g. /home-services/gutter-cleaning. Query dropped. */
function landingPath(request: NextRequest): string | null {
  const referer = request.headers.get('referer');
  if (!referer) return null;
  try {
    const url = new URL(referer);
    if (url.host !== request.nextUrl.host) return null;
    return url.pathname.slice(0, 200);
  } catch {
    return null;
  }
}

interface ExistingRequest {
  id: string;
  status: RequestStatus;
  answers: Record<string, Record<string, string>>;
  merged_count: number;
  notes: string;
  first_name: string;
  phone: string;
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BODY_BYTES) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const parsed = RequestBodySchema.safeParse(json);
    if (!parsed.success) {
      console.warn('[home-services/request] schema rejected:', parsed.error.issues.slice(0, 3).map((i) => i.path.join('.')));
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const body = parsed.data;

    if (body.honeypot) return silentOk();
    const elapsed = (body.submitted_at ?? Date.now()) - body.started_at;
    if (!(elapsed >= MIN_FILL_MS)) return silentOk();

    const validated = validateRequest(body);
    if ('reason' in validated) {
      console.warn(`[home-services/request] rejected: ${validated.reason}`);
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const req = validated.value;

    const ip = getClientIp(request);
    const ipLimit = await checkRateLimit(`hs-request:${ip}`, IP_LIMIT, IP_WINDOW_MS);
    if (!ipLimit.allowed) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfter ?? 60) } });
    }
    const phoneLimit = await checkRateLimit(`hs-request-phone:${phoneDigits(req.phone)}`, PHONE_LIMIT, PHONE_WINDOW_MS);
    if (!phoneLimit.allowed) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(phoneLimit.retryAfter ?? 3600) } });
    }

    let captchaScore: number | null = null;
    if (isE2eRecaptchaBypass(body.recaptchaToken)) {
      console.warn('[home-services/request] reCAPTCHA E2E bypass token accepted - non-production test mode');
    } else if (body.recaptchaV2Token) {
      if (!(await verifyRecaptchaV2(body.recaptchaV2Token))) {
        return NextResponse.json({ error: 'verification_failed' }, { status: 403 });
      }
    } else {
      if (!body.recaptchaToken || body.recaptchaAction !== RECAPTCHA_ACTION) {
        return NextResponse.json({ error: 'verification_failed' }, { status: 403 });
      }
      const result = await verifyRecaptcha(body.recaptchaToken, RECAPTCHA_ACTION);
      captchaScore = result.score;
      if (!result.success) {
        if (result.reason === 'low_score' && isRecaptchaV2Configured()) {
          return NextResponse.json({ challenge: 'recaptcha_v2' }, { status: 200 });
        }
        console.warn(`[home-services/request] reCAPTCHA failed (score=${result.score}, reason=${result.reason})`);
        return NextResponse.json({ error: 'verification_failed' }, { status: 403 });
      }
    }

    if (!isInServiceArea({ zip: req.zip, town: req.town })) {
      return NextResponse.json({ error: 'out_of_area' }, { status: 403 });
    }

    const attribution = readAttribution((name) => request.cookies.get(name)?.value);
    const key = dedupeKey(req.address, req.zip, req.services, req.phone);
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();

    // ---- Dedupe: same address + services + phone within 24 h merges ---------
    const existing = await supabaseRest<ExistingRequest[]>(
      'GET',
      `home_service_requests?select=id,status,answers,merged_count,notes,first_name,phone` +
        `&dedupe_key=eq.${encodeURIComponent(key)}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1`,
    );
    if (existing?.[0]) {
      const prior = existing[0];
      const noteParts: string[] = [];
      // Same phone by construction of the key; a different name is still worth keeping.
      const differentContact = prior.first_name !== req.firstName;
      if (differentContact || req.notes) {
        const who = differentContact ? ` from ${req.firstName} ${req.lastName}, ${req.phone}${req.email ? `, ${req.email}` : ''}` : '';
        noteParts.push(`[merged ${new Date().toISOString()}${who}]${req.notes ? ` ${req.notes}` : ''}`);
      }
      await supabaseRest('PATCH', `home_service_requests?id=eq.${prior.id}`, {
        answers: mergeAnswers(prior.answers ?? {}, req.answers),
        merged_count: (prior.merged_count ?? 0) + 1,
        ...(noteParts.length ? { notes: [prior.notes, ...noteParts].filter(Boolean).join('\n') } : {}),
      }, { prefer: 'return=minimal' });
      const claimed = await claimDraftPhotos(prior.id, body.draft_token ?? undefined, body.photo_ids);
      console.log(`[home-services/request] merged into ${prior.id} (+${claimed.length} photos)`);
      return NextResponse.json({ ok: true, request_id: prior.id, status: prior.status, verification: 'skipped', merged: true });
    }

    // ---- leads row: the existing pipeline's record --------------------------
    const { lead: sanitized, adjustments } = sanitizeLeadForInsert(leadFields(req, attribution.source));
    if (adjustments.length) console.warn(`[home-services/request] sanitizer adjusted: ${adjustments.join('; ')}`);
    const scoring = scoreLead(prepareLeadForScoring(sanitized as Record<string, string | null | undefined>));
    const leadRow = { ...sanitized, score: scoring.score, tier: scoring.tier, scoring_reasons: scoring.reasons };
    let leadId: string | null = null;
    try {
      const inserted = await supabaseRest<Array<{ id: string }>>('POST', 'leads', [leadRow]);
      leadId = inserted?.[0]?.id ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[home-services/request] leads insert failed, saving the request without a lead row:', message);
      await withTimeout(
        sendFormFailureAlert({
          stage: 'insert',
          source: `home_services:${attribution.source}`,
          message: 'leads insert failed - the home services request WAS saved (lead_id null)',
          details: { dbError: message.slice(0, 500) },
          lead: { name: `${req.firstName} ${req.lastName}`.trim(), email: req.email, phone: req.phone },
        }),
        4000,
        'form-failure',
      ).catch(() => undefined);
    }

    // ---- home_service_requests row ------------------------------------------
    const smsConfigured = isSmsConfigured();
    const canVerify = smsConfigured && Boolean(normalizeUsPhone(req.phone)) && Boolean(process.env.INTERNAL_WEBHOOK_SECRET);
    const code = canVerify ? generateCode() : null;
    const status: RequestStatus = canVerify ? 'held' : 'new';
    const row = {
      lead_id: leadId,
      status,
      services: req.services,
      answers: req.answers,
      language: req.lang,
      first_name: req.firstName,
      last_name: req.lastName,
      phone: req.phone,
      email: req.email,
      address: req.address,
      town: req.town,
      zip: req.zip,
      in_service_area: true,
      timing: req.timing,
      notes: req.notes,
      consent_sms: true,
      source: attribution.source,
      listing_id: attribution.listingId,
      utm: attribution.utm,
      landing_path: landingPath(request),
      cta_variant_primary: attribution.ctaPrimary,
      cta_variant_secondary: attribution.ctaSecondary,
      captcha_score: captchaScore,
      dedupe_key: key,
      ...(code
        ? { verify_code_hash: hashCode(code), verify_expires_at: new Date(Date.now() + VERIFY_CODE_TTL_MS).toISOString(), verify_sends: 1 }
        : {}),
    };
    const created = await supabaseRest<Array<AlertableRequest & { status: RequestStatus }>>('POST', 'home_service_requests', [row]);
    const stored = created?.[0];
    if (!stored?.id) throw new Error('home_service_requests insert returned no row');

    const claimed = await claimDraftPhotos(stored.id, body.draft_token ?? undefined, body.photo_ids);

    // ---- notifications -------------------------------------------------------
    let verification = 'skipped' as 'sent' | 'skipped';
    const tasks: Array<Promise<unknown>> = [];

    if (status === 'new') {
      // A Held request alerts the owner from /verify once the phone is confirmed.
      const photoUrls = await signPhotoUrls(claimed.map((p) => p.storage_path));
      tasks.push(
        sendOwnerAlert(stored, photoUrls, {
          smsConfigured,
          score: scoring.score,
          tier: scoring.tier,
          geoTier: geoTierLabel(request.headers.get(GEO_TIER_HEADER)),
        }).then((r) => console.log('[home-services/request] owner alert:', JSON.stringify(r))),
      );
    }
    if (req.email) {
      tasks.push(
        withTimeout(
          createLeadFollowUpSequence({
            name: `${req.firstName} ${req.lastName}`.trim(),
            email: req.email,
            phone: req.phone,
            source: `home_services:${attribution.source}`,
            projectType: 'Home Services',
            leadId: leadId ?? undefined,
          }),
          4000,
          'follow-up',
        )
          .then((r) => console.log('[home-services/request] follow-up:', JSON.stringify(r)))
          .catch((err) => console.error('[home-services/request] follow-up threw:', err)),
      );
    }
    if (smsConfigured) {
      // One text carries both the confirmation and, when verifying, the code.
      tasks.push(
        withTimeout(sendSms({ to: req.phone, body: confirmationSmsBody(req.lang, req.firstName, code ?? undefined) }), 8000, 'sms').then((r) => {
          const result = r as { status: string };
          console.log('[home-services/request] customer sms:', result.status);
          if (code && result.status === 'sent') verification = 'sent';
        }),
      );
    } else {
      console.log('[home-services/request] customer sms: not_configured');
    }
    await Promise.allSettled(tasks);

    // A Held request whose code text failed would sit unverifiable forever; release it to New.
    let finalStatus: RequestStatus = status;
    if (status === 'held' && verification !== 'sent') {
      finalStatus = 'new';
      await supabaseRest('PATCH', `home_service_requests?id=eq.${stored.id}`, { status: 'new', verify_code_hash: null }, { prefer: 'return=minimal' });
      const photoUrls = await signPhotoUrls(claimed.map((p) => p.storage_path));
      const alert = await sendOwnerAlert(stored, photoUrls, {
        smsConfigured,
        codeFailed: true,
        score: scoring.score,
        tier: scoring.tier,
      });
      console.log('[home-services/request] code text failed; released to new. owner alert:', JSON.stringify(alert));
    }

    return NextResponse.json({ ok: true, request_id: stored.id, status: finalStatus, verification, merged: false });
  } catch (err) {
    console.error('[home-services/request] unhandled:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
