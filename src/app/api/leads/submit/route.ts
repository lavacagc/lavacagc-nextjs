import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { scoreLead, prepareLeadForScoring } from '@/lib/leadScoring';
import { sanitizeLeadForInsert } from '@/lib/leadSanitize';
import { sendTelegramLead } from '@/lib/notify/telegramLead';
import { sendNewLeadEmail } from '@/lib/notify/newLeadEmail';
import { sendFormFailureAlert, FormErrorAlertPayload } from '@/lib/notify/formErrorAlert';
import { createLeadFollowUpSequence } from '@/lib/notify/leadFollowUp';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { createIntakeSession, intakePathFor } from '@/lib/intake/session';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { readBookedHomeDetails } from '@/lib/homecare/homeRecords';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// In-process alert dispatch. Previously this self-fetched /api/notify/form-error,
// which Cloudflare intercepted with a managed-challenge page before the request
// could reach our middleware. Now it calls the helper directly.
async function reportFailure(payload: FormErrorAlertPayload): Promise<void> {
  try {
    await sendFormFailureAlert(payload);
  } catch (err) {
    console.error('Failed to dispatch form-error alert:', err);
  }
}

// Minimum reCAPTCHA score (0.0–1.0) required to accept a submission.
// Configurable via RECAPTCHA_MIN_SCORE so the threshold can be tuned without a
// redeploy. Fail-closed: any unset/out-of-range/malformed value falls back to
// 0.5 rather than silently accepting everything.
function getMinRecaptchaScore(): number {
  const n = Number(process.env.RECAPTCHA_MIN_SCORE);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.5;
}

// Hard cap on request body size. A lead form payload is a few hundred bytes;
// 16 KB is generous headroom while bounding an abusive oversized payload.
const MAX_BODY_BYTES = 16 * 1024;

// Permissive-but-bounded input schema. This endpoint is shared by 5 different
// lead forms, so unknown-but-valid fields pass through (PostgREST is the column
// gate, and the body-size cap above bounds total payload). Known fields get
// length caps so no single field can be abused. The reCAPTCHA envelope stays
// optional here so the existing explicit presence checks below still produce
// their specific error + owner alert.
// Accept null as well as undefined: the lead forms send `null` for unselected
// optional fields (e.g. contact_time_details when the time preference isn't
// "specific"). `.optional()` alone rejects null and would 400 the whole
// submission ("Invalid request") before any processing. `.nullish()` treats a
// null and an omitted field the same — both mean "not provided".
// Truncate rather than reject at the cap: a 3000-char document.referrer or an
// extra-long booking note must never 400 the whole submission - the lead
// matters more than the field's tail, and the 16 KB body cap above already
// bounds abuse. (Truncating a reCAPTCHA token just makes verification fail,
// which is the same outcome an over-long token deserves.)
const optStr = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (v == null ? v : v.slice(0, max)));
const LeadSubmitSchema = z
  .object({
    recaptchaToken: optStr(5000),
    recaptchaAction: optStr(100),
    recaptchaV2Token: optStr(5000),
    honeypot: optStr(500),
    first_name: optStr(200),
    last_name: optStr(200),
    email: optStr(320),
    phone: optStr(60),
    address: optStr(300),
    city: optStr(200),
    zip_code: optStr(20),
    message: optStr(5000),
    inquiry_type: optStr(100),
    project_type: optStr(200),
    project_timeline: optStr(100),
    budget_range: optStr(100),
    current_project_status: optStr(200),
    preferred_contact_method: optStr(50),
    source: optStr(200),
    contact_time_preference: optStr(50),
    contact_time_details: optStr(300),
    contact_timezone: optStr(100),
    referrer: optStr(2000),
    // Structured service titles for a consolidated request (e.g. a Home Care
    // multi-task estimate). This rides in the notification payload ONLY - it is
    // pulled out below before the lead is sanitized/inserted, so it can't trip
    // the "unknown column" alert or reach the leads table.
    services: z.array(z.string().max(200)).max(30).nullish(),
    // Machine-readable booked task keys (catalog slugs, non-sensitive). Used
    // server-side with the verified hc_access cookie to attach the homeowner's
    // saved home details (My Home Systems) for ONLY the booked services to the
    // owner alert. Like `services`, destructured out before sanitize/insert.
    task_keys: z.array(z.string().max(80)).max(20).nullish(),
  })
  .passthrough();

// Per-IP rate limit on the lead-submit endpoint. Protects the expensive
// downstream (reCAPTCHA Enterprise, Supabase, Resend, Telegram) from scripted
// abuse on top of the reCAPTCHA gate. Uses the shared limiter backed by the
// existing public.rate_limits table — no new infra, secret, or migration. Fails
// open (see src/lib/rateLimit.ts).
const RATE_LIMIT_MAX = 5; // submissions per window, per IP
const RATE_LIMIT_WINDOW_SECONDS = 60;

// reCAPTCHA outcome reason:
//  - 'ok'        : token valid, action matched, score >= threshold → accept
//  - 'low_score' : token VALID but score below threshold → may be a real user
//                  having a bad day; offer a v2 checkbox challenge instead of a
//                  hard block (only if v2 is configured).
//  - 'invalid'   : token invalid / action mismatch → almost certainly a bot;
//                  hard fail, no challenge.
//  - 'error'     : verification couldn't run (no secret, upstream error) →
//                  fail closed, no challenge.
type RecaptchaReason = 'ok' | 'low_score' | 'invalid' | 'error';

async function verifyRecaptcha(
  token: string,
  expectedAction: string
): Promise<{ success: boolean; score: number; reason: RecaptchaReason }> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey) {
    console.error('RECAPTCHA_SECRET_KEY not configured');
    return { success: false, score: 0, reason: 'error' };
  }

  const minScore = getMinRecaptchaScore();

  try {
    const res = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${process.env.RECAPTCHA_PROJECT_ID || 'lavaca-gc'}/assessments?key=${secretKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: {
            token,
            siteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY,
            expectedAction,
          },
        }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      const v3Res = await fetch(
        `https://www.google.com/recaptcha/api/siteverify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            secret: secretKey,
            response: token,
          }),
          signal: AbortSignal.timeout(8000),
        }
      );
      const v3Data = await v3Res.json();
      const score = v3Data.score ?? 0;
      if (!v3Data.success) return { success: false, score, reason: 'invalid' };
      if (score >= minScore) return { success: true, score, reason: 'ok' };
      return { success: false, score, reason: 'low_score' };
    }

    const data = await res.json();
    const score = data.riskAnalysis?.score ?? 0;
    const actionMatch = data.tokenProperties?.action === expectedAction;
    const valid = data.tokenProperties?.valid === true;

    if (!valid || !actionMatch) return { success: false, score, reason: 'invalid' };
    if (score >= minScore) return { success: true, score, reason: 'ok' };
    return { success: false, score, reason: 'low_score' };
  } catch (err) {
    console.error('reCAPTCHA verification error:', err);
    return { success: false, score: 0, reason: 'error' };
  }
}

// --- E2E test hook ----------------------------------------------------------
// A submission whose recaptchaToken exactly matches RECAPTCHA_E2E_BYPASS_TOKEN
// skips reCAPTCHA verification so Playwright can drive the FULL path (browser
// form → this route → Supabase insert → notifications). Real tokens cannot be
// minted for localhost, and automation-scored traffic would flake on the v2
// challenge, so without this hook the insert layer is untestable end-to-end.
// Inactive unless ALL hold: the env var is set (it is never set in Vercel),
// it is ≥ 32 chars, this is NOT the production environment, and the token
// matches exactly.
function isE2eRecaptchaBypass(token: string | null | undefined): boolean {
  const expected = process.env.RECAPTCHA_E2E_BYPASS_TOKEN;
  return Boolean(
    expected &&
      expected.length >= 32 &&
      process.env.VERCEL_ENV !== 'production' &&
      token === expected
  );
}

// Whether the v2 checkbox fallback is available. Requires a v2 (checkbox)
// Enterprise site key plus the GCP API key used for assessments. When unset,
// the endpoint behaves exactly as before (low scores hard-fail) — so this
// feature can ship before the key is created.
function isRecaptchaV2Configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY && process.env.RECAPTCHA_SECRET_KEY);
}

// Verify a v2 "I'm not a robot" checkbox token via the Enterprise assessments
// API (reuses the existing GCP API key). Checkbox keys are score-less — a valid
// token means a human cleared the challenge. Fails CLOSED: any error or missing
// config returns false, so a misconfiguration never lets a bot through.
async function verifyRecaptchaV2(token: string): Promise<boolean> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const v2SiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY;
  if (!secretKey || !v2SiteKey) return false;
  try {
    const res = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${process.env.RECAPTCHA_PROJECT_ID || 'lavaca-gc'}/assessments?key=${secretKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: { token, siteKey: v2SiteKey } }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data.tokenProperties?.valid === true;
  } catch (err) {
    console.error('reCAPTCHA v2 verification error:', err);
    return false;
  }
}

async function insertLead(leadData: Record<string, unknown>): Promise<{ data: Record<string, unknown>[] | null; error: string | null }> {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    return { data: null, error: 'Server configuration error' };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'apikey': secretKey,
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(leadData),
      // Explicit timeout: a hung Supabase request must not stall the response.
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Lead insert failed:', res.status, errText);
      return { data: null, error: errText };
    }

    const data = await res.json();
    return { data: Array.isArray(data) ? data : [data], error: null };
  } catch (err) {
    console.error('Lead insert exception:', err);
    return { data: null, error: String(err) };
  }
}

// Run a task with a hard timeout. Used to cap each notification so one slow
// downstream (Telegram API, Resend, Supabase) can't stall the user-facing
// response indefinitely.
function withTimeoutPromise<T>(promise: Promise<T>, ms: number, label: string): Promise<T | { status: 'timeout'; label: string }> {
  return Promise.race([
    promise,
    new Promise<{ status: 'timeout'; label: string }>((resolve) =>
      setTimeout(() => resolve({ status: 'timeout', label }), ms)
    ),
  ]);
}

export async function POST(request: NextRequest) {
  let leadFieldsForError: Record<string, unknown> = {};
  let sourceForError = 'unknown';
  try {
    // Bound the request body before parsing, then validate its shape. The
    // endpoint is public, so treat the payload as fully untrusted.
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
    const parsed = LeadSubmitSchema.safeParse(parsedJson);
    if (!parsed.success) {
      // Don't leak schema internals to the client; log a trimmed view for debugging.
      console.warn('Lead submit validation failed:', parsed.error.issues.slice(0, 3));
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { recaptchaToken, recaptchaAction, recaptchaV2Token, honeypot, services: rawServices, task_keys: rawTaskKeys, ...rawLeadFields } = parsed.data as {
      recaptchaToken?: string;
      recaptchaAction?: string;
      recaptchaV2Token?: string;
      honeypot?: string;
      services?: string[] | null;
      task_keys?: string[] | null;
      [key: string]: unknown;
    };
    // Structured service titles for the owner alert only. Destructured OUT of
    // the lead fields above so they never reach sanitizeLeadForInsert (which
    // would flag "services" as an unknown column and spam a warning alert) or
    // the leads table. The durable record stays in the lead's `message`.
    const requestedServices = Array.isArray(rawServices)
      ? rawServices.map((s) => String(s).trim()).filter(Boolean).slice(0, 30)
      : [];
    // Booked task keys - also owner-alert only, also destructured out of the
    // lead fields. Non-sensitive on their own; they only select which saved home
    // details ride along, resolved server-side below from the verified cookie.
    const bookedTaskKeys = Array.isArray(rawTaskKeys)
      ? rawTaskKeys.map((k) => String(k).trim()).filter(Boolean).slice(0, 20)
      : [];
    // Normalize the payload to what public.leads actually accepts (NOT NULL
    // contact/name columns, enum CHECKs, integer/timestamp types, no unknown
    // columns). A well-formed form payload passes through unchanged; anything
    // that would have made Postgres reject the row - and lose the lead - is
    // fixed up and reported via a warning alert after the insert succeeds.
    const { lead: leadFields, adjustments: sanitizeAdjustments } = sanitizeLeadForInsert(rawLeadFields);
    leadFieldsForError = leadFields;
    sourceForError = String(leadFields.source || recaptchaAction || 'unknown');
    const leadContext = {
      name: `${leadFields.first_name || ''} ${leadFields.last_name || ''}`.trim() || undefined,
      email: (leadFields.email as string) || undefined,
      phone: (leadFields.phone as string) || undefined,
    };

    if (honeypot) {
      return NextResponse.json({ success: true });
    }

    // Throttle per IP before doing any expensive downstream work.
    const rl = await checkRateLimit(
      `lead-submit:${getClientIp(request)}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_SECONDS * 1000
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? RATE_LIMIT_WINDOW_SECONDS) } }
      );
    }

    // A v2-challenge re-submit carries recaptchaV2Token instead of a fresh v3
    // token/action, so only require the v3 envelope when no v2 token is present.
    if (!recaptchaV2Token && (!recaptchaToken || !recaptchaAction)) {
      await reportFailure({
        stage: 'validation',
        source: sourceForError,
        message: 'Missing reCAPTCHA token or action on submit',
        lead: leadContext,
      });
      return NextResponse.json(
        { error: 'Missing reCAPTCHA token' },
        { status: 400 }
      );
    }

    if (!leadFields.email && !leadFields.phone) {
      await reportFailure({
        stage: 'validation',
        source: sourceForError,
        message: 'Submission missing both email and phone',
        lead: leadContext,
      });
      return NextResponse.json(
        { error: 'Email or phone is required' },
        { status: 400 }
      );
    }

    // reCAPTCHA gate. Two paths:
    //  (a) v2-challenge re-submit: the user already cleared a checkbox — verify
    //      that token and, if valid, accept (the human check stands in for the
    //      low v3 score).
    //  (b) normal v3 submit: on a LOW score (valid token, just under the bar)
    //      and when v2 is configured, ask the client to show the checkbox
    //      instead of hard-blocking a possible real customer. Invalid tokens or
    //      a missing v2 key still hard-fail.
    if (isE2eRecaptchaBypass(recaptchaToken)) {
      console.warn('reCAPTCHA E2E bypass token accepted - non-production test mode');
    } else if (recaptchaV2Token) {
      const v2Ok = await verifyRecaptchaV2(recaptchaV2Token);
      console.log(`reCAPTCHA v2 checkbox verification: success=${v2Ok}`);
      if (!v2Ok) {
        await reportFailure({
          stage: 'recaptcha',
          source: sourceForError,
          message: 'reCAPTCHA v2 checkbox verification failed',
          details: { hint: 'v2 token invalid/expired, or v2 key misconfigured.' },
          lead: leadContext,
        });
        return NextResponse.json(
          { error: 'reCAPTCHA verification failed' },
          { status: 403 }
        );
      }
    } else {
      const recaptchaResult = await verifyRecaptcha(recaptchaToken!, recaptchaAction!);
      console.log(`reCAPTCHA verification: action=${recaptchaAction}, score=${recaptchaResult.score}, success=${recaptchaResult.success}, reason=${recaptchaResult.reason}`);

      if (!recaptchaResult.success) {
        // Low score + v2 available → offer the checkbox. Do NOT save or notify;
        // the client will re-submit with a v2 token.
        if (recaptchaResult.reason === 'low_score' && isRecaptchaV2Configured()) {
          return NextResponse.json({ challenge: 'recaptcha_v2' }, { status: 200 });
        }
        await reportFailure({
          stage: 'recaptcha',
          source: sourceForError,
          message: `reCAPTCHA verification failed (score=${recaptchaResult.score}, reason=${recaptchaResult.reason})`,
          details: {
            action: recaptchaAction,
            score: recaptchaResult.score,
            reason: recaptchaResult.reason,
            hint: !process.env.RECAPTCHA_SECRET_KEY
              ? 'RECAPTCHA_SECRET_KEY is not set — every submission will fail until it is configured.'
              : 'Score below threshold or token invalid. Check reCAPTCHA console + siteKey/action match.',
          },
          lead: leadContext,
        });
        return NextResponse.json(
          { error: 'reCAPTCHA verification failed' },
          { status: 403 }
        );
      }
    }

    let finalLeadData = { ...leadFields };
    if (!finalLeadData.score) {
      const scoringInput = prepareLeadForScoring(finalLeadData as Record<string, string | null | undefined>);
      const scoringResult = scoreLead(scoringInput);
      finalLeadData = {
        ...finalLeadData,
        score: scoringResult.score,
        tier: scoringResult.tier,
        scoring_reasons: scoringResult.reasons,
      };
    }

    const { data: insertedRows, error: insertError } = await insertLead(finalLeadData);
    const leadId = (insertedRows?.[0]?.id as string | undefined) ?? null;
    if (insertError) {
      console.error('Failed to insert lead:', insertError);
      await reportFailure({
        stage: 'insert',
        source: sourceForError,
        message: 'Supabase insert failed — lead was NOT saved',
        details: {
          dbError: insertError,
          hint: !process.env.SUPABASE_SECRET_KEY
            ? 'SUPABASE_SECRET_KEY is not set — the server cannot write to the leads table.'
            : 'Check RLS, column mismatches, or Supabase project status.',
        },
        lead: leadContext,
      });
      return NextResponse.json({ error: 'Failed to save lead' }, { status: 500 });
    }

    // Create the intake session (WEB-012/013) before the notifications, so the
    // ack email can carry the link. Deliberately non-fatal: a lead whose
    // session failed to create is still a lead, and must still get its alerts
    // and its acknowledgement. In that case the flow simply is not offered.
    const intakeSession = await createIntakeSession({
      leadId,
      firstName: (finalLeadData.first_name as string | undefined) ?? null,
      projectType: (finalLeadData.project_type as string | undefined) ?? null,
    });
    // A path, not an absolute URL built from the request host. The confirmation
    // panel is already on whichever host served the form, so a path is right
    // there; and the ack email must not carry a link derived from a
    // client-supplied Host - `createLeadFollowUpSequence` makes it absolute
    // against the canonical NEXT_PUBLIC_SITE_URL instead.
    const intakePath = intakeSession ? intakePathFor(intakeSession.token) : null;

    // The lead is saved. If the sanitizer had to change anything to get it
    // past the DB constraints, tell the owner - a form is sending
    // non-standard values and should be fixed before the data quality slips.
    if (sanitizeAdjustments.length > 0) {
      await reportFailure({
        stage: 'sanitize',
        severity: 'warning',
        source: sourceForError,
        message: `Lead saved after auto-correcting ${sanitizeAdjustments.length} field(s) - a form is sending non-standard values`,
        details: { adjustments: sanitizeAdjustments },
        lead: leadContext,
      });
    }

    // Fire notifications in-process. No self-fetch: Cloudflare would otherwise
    // interstitial server-to-server requests hitting www.lavacagc.com. Each
    // task is capped at 4s so one slow downstream can't stall the response.
    const name = leadContext.name || '';
    const projectType = (leadFields.project_type || leadFields.inquiry_type || 'General Inquiry') as string;
    const source = (leadFields.source || 'website') as string;
    // Home Care requests store project_type 'other'; relabel just the owner
    // alert to "Home Care" so the notification is legible at a glance. The
    // stored lead value is unchanged.
    const alertProjectType = source.startsWith('home_care') ? 'Home Care' : projectType;
    const email = (leadFields.email || '') as string;
    const phone = (leadFields.phone || '') as string;

    // Booking rider (My Home Systems, Slice 5): for a Home Care booking, attach
    // the homeowner's saved home details (shut-off locations, panel, filter
    // sizes) for ONLY the booked services to the owner alert, so the crew arrives
    // knowing where things are. The homeowner id comes from the verified,
    // HMAC-signed hc_access cookie - NEVER from the client payload - so a request
    // can only surface its own home's details. Server-side + fail-soft: any
    // problem (no cookie, no saved details, table not live yet) just yields no
    // rider block. The sensitive values never touch the leads table or the
    // browser; they live only in La Vaca's internal alert.
    let homeDetails: string[] = [];
    if (source.startsWith('home_care') && bookedTaskKeys.length > 0) {
      try {
        const access = await verifyHomeAccess(request.cookies.get(HC_ACCESS_COOKIE)?.value);
        if (access) {
          homeDetails = await readBookedHomeDetails(access.homeownerId, bookedTaskKeys);
        }
      } catch {
        homeDetails = [];
      }
    }

    // Pull the best-time fields off the payload once so both notify tasks
    // and the DB row see the same values. Cast through the known-but-loosely-
    // typed enum set; insertLead already received the raw column values.
    const contactTimePreference = (finalLeadData.contact_time_preference || undefined) as
      | 'anytime'
      | 'morning'
      | 'afternoon'
      | 'evening'
      | 'weekends'
      | 'specific'
      | undefined;
    const contactTimeDetails = (finalLeadData.contact_time_details as string | undefined) || undefined;
    const contactTimezone = (finalLeadData.contact_timezone as string | undefined) || undefined;

    const notifyTasks = [
      withTimeoutPromise(
        sendTelegramLead({
          name,
          email,
          phone,
          projectType: alertProjectType,
          score: finalLeadData.score as number | undefined,
          tier: finalLeadData.tier as 'hot' | 'warm' | 'cold' | undefined,
          source,
          contactTimePreference,
          contactTimeDetails,
          contactTimezone,
          services: requestedServices.length ? requestedServices : undefined,
          homeDetails: homeDetails.length ? homeDetails : undefined,
        }),
        6000,
        'telegram-lead'
      ).catch((err) => {
        console.error('telegram-lead notify threw:', err);
        return { status: 'error' as const, label: 'telegram-lead' };
      }),
      withTimeoutPromise(
        sendNewLeadEmail({
          name,
          email,
          phone,
          projectType: alertProjectType,
          source,
          tier: finalLeadData.tier as 'hot' | 'warm' | 'cold' | undefined,
          contactTimePreference,
          contactTimeDetails,
          contactTimezone,
          services: requestedServices.length ? requestedServices : undefined,
          homeDetails: homeDetails.length ? homeDetails : undefined,
          leadId,
        }),
        4000,
        'new-lead'
      ).catch((err) => {
        console.error('new-lead notify threw:', err);
        return { status: 'error' as const, label: 'new-lead' };
      }),
      withTimeoutPromise(
        createLeadFollowUpSequence({
          name,
          email,
          source,
          projectType,
          leadId: leadId ?? undefined,
          intakePath,
        }),
        4000,
        'follow-up'
      ).catch((err) => {
        console.error('follow-up sequence threw:', err);
        return { status: 'error' as const, label: 'follow-up' };
      }),
    ];
    const notifyResults = await Promise.allSettled(notifyTasks);
    const notifyLabels = ['telegram-lead', 'new-lead', 'follow-up'] as const;
    // Collect any channel that outright failed (not counting the benign
    // "skipped:not_configured" state, which is the normal response in envs
    // where credentials aren't set). Anything else — failed/error/timeout —
    // means a lead came in but a channel silently didn't deliver.
    const notifyFailures: Array<{ label: string; detail: unknown }> = [];
    notifyResults.forEach((r, i) => {
      const label = notifyLabels[i];
      if (r.status === 'fulfilled') {
        const val = r.value as { status?: string; reason?: string; error?: string; label?: string };
        console.log(`notify ${label}:`, JSON.stringify(val));
        const bad = val.status === 'failed' || val.status === 'error' || val.status === 'timeout';
        const isSkipConfig = val.status === 'skipped' && val.reason === 'not_configured';
        if (bad && !isSkipConfig) {
          notifyFailures.push({ label, detail: val });
        }
      } else {
        console.error(`notify ${label} rejected:`, r.reason);
        notifyFailures.push({
          label,
          detail: r.reason instanceof Error ? { message: r.reason.message, stack: r.reason.stack } : String(r.reason),
        });
      }
    });

    // Escalate any notify failure to the form-error alert channel so the
    // site owner finds out even if ONE channel is down (e.g. Telegram token
    // revoked, Resend suspension, 4s timeout). The alert itself dual-writes
    // to Telegram + email, so a single broken channel still lets the other
    // one deliver the news.
    if (notifyFailures.length > 0) {
      await reportFailure({
        stage: 'notify',
        source: sourceForError,
        message: `${notifyFailures.length}/${notifyLabels.length} lead notification channel(s) failed — lead was saved but the owner may not have been alerted`,
        details: {
          failures: notifyFailures,
          hint:
            'The lead is in Supabase. Channels listed above did not dispatch. ' +
            'Check TELEGRAM_BOT_TOKEN / RESEND_API_KEY validity and Vercel runtime logs.',
        },
        lead: leadContext,
      });
    }

    return NextResponse.json({
      success: true,
      score: finalLeadData.score,
      tier: finalLeadData.tier,
      // WEB-012 path 1: the on-page confirmation offers this immediately.
      // Null when the session could not be created, and the caller must treat
      // null as "do not offer it" rather than rendering a dead link.
      intakeUrl: intakePath,
    });
  } catch (error) {
    console.error('Lead submission error:', error);
    await reportFailure({
      stage: 'exception',
      source: sourceForError,
      message: 'Unhandled exception in /api/leads/submit',
      details: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
      lead: {
        name: `${leadFieldsForError.first_name || ''} ${leadFieldsForError.last_name || ''}`.trim() || undefined,
        email: (leadFieldsForError.email as string) || undefined,
        phone: (leadFieldsForError.phone as string) || undefined,
      },
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
