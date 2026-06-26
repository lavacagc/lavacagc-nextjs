import { NextRequest, NextResponse } from 'next/server';
import { scoreLead, prepareLeadForScoring } from '@/lib/leadScoring';
import { sendTelegramLead } from '@/lib/notify/telegramLead';
import { sendNewLeadEmail } from '@/lib/notify/newLeadEmail';
import { sendFormFailureAlert, FormErrorAlertPayload } from '@/lib/notify/formErrorAlert';
import { createLeadFollowUpSequence } from '@/lib/notify/leadFollowUp';

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

async function verifyRecaptcha(token: string, expectedAction: string): Promise<{ success: boolean; score: number }> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey) {
    console.error('RECAPTCHA_SECRET_KEY not configured');
    return { success: false, score: 0 };
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
      return {
        success: v3Data.success && (v3Data.score ?? 0) >= minScore,
        score: v3Data.score ?? 0,
      };
    }

    const data = await res.json();
    const score = data.riskAnalysis?.score ?? 0;
    const actionMatch = data.tokenProperties?.action === expectedAction;
    const valid = data.tokenProperties?.valid === true;

    return {
      success: valid && actionMatch && score >= minScore,
      score,
    };
  } catch (err) {
    console.error('reCAPTCHA verification error:', err);
    return { success: false, score: 0 };
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
    const body = await request.json();
    const { recaptchaToken, recaptchaAction, honeypot, ...leadFields } = body as {
      recaptchaToken: string;
      recaptchaAction: string;
      honeypot?: string;
      [key: string]: unknown;
    };
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

    if (!recaptchaToken || !recaptchaAction) {
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

    const recaptchaResult = await verifyRecaptcha(recaptchaToken, recaptchaAction);
    console.log(`reCAPTCHA verification: action=${recaptchaAction}, score=${recaptchaResult.score}, success=${recaptchaResult.success}`);

    if (!recaptchaResult.success) {
      await reportFailure({
        stage: 'recaptcha',
        source: sourceForError,
        message: `reCAPTCHA verification failed (score=${recaptchaResult.score})`,
        details: {
          action: recaptchaAction,
          score: recaptchaResult.score,
          hint: !process.env.RECAPTCHA_SECRET_KEY
            ? 'RECAPTCHA_SECRET_KEY is not set — every submission will fail until it is configured.'
            : 'Score below 0.5 or token invalid. Check reCAPTCHA console + siteKey/action match.',
        },
        lead: leadContext,
      });
      return NextResponse.json(
        { error: 'reCAPTCHA verification failed' },
        { status: 403 }
      );
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

    const { error: insertError } = await insertLead(finalLeadData);
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

    // Fire notifications in-process. No self-fetch: Cloudflare would otherwise
    // interstitial server-to-server requests hitting www.lavacagc.com. Each
    // task is capped at 4s so one slow downstream can't stall the response.
    const name = leadContext.name || '';
    const projectType = (leadFields.project_type || leadFields.inquiry_type || 'General Inquiry') as string;
    const source = (leadFields.source || 'website') as string;
    const email = (leadFields.email || '') as string;
    const phone = (leadFields.phone || '') as string;

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
          projectType,
          score: finalLeadData.score as number | undefined,
          tier: finalLeadData.tier as 'hot' | 'warm' | 'cold' | undefined,
          source,
          contactTimePreference,
          contactTimeDetails,
          contactTimezone,
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
          projectType,
          source,
          tier: finalLeadData.tier as 'hot' | 'warm' | 'cold' | undefined,
          contactTimePreference,
          contactTimeDetails,
          contactTimezone,
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
