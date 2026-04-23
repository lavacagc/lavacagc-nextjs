import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health/forms
 *
 * Diagnostic endpoint that reports which env vars the lead-submission
 * pipeline needs, whether each is configured, and a pass/fail summary.
 * Safe to hit in a browser: no secret values are returned, only presence.
 *
 * Protected by ?key=<DIAGNOSTICS_KEY> if DIAGNOSTICS_KEY is set in env.
 */
export async function GET(request: NextRequest) {
  const diagKey = process.env.DIAGNOSTICS_KEY;
  if (diagKey) {
    const provided = request.nextUrl.searchParams.get('key');
    if (provided !== diagKey) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const required = {
    NEXT_PUBLIC_SUPABASE_URL: {
      present: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      role: 'Points browser + server to Supabase project',
      critical: true,
    },
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
      present: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
      role: 'Browser-side Supabase anon key',
      critical: true,
    },
    SUPABASE_SECRET_KEY: {
      present: Boolean(process.env.SUPABASE_SECRET_KEY),
      role: 'Server-side service-role key; required to insert leads (bypasses RLS)',
      critical: true,
    },
    NEXT_PUBLIC_RECAPTCHA_SITE_KEY: {
      present: Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
      role: 'Browser reCAPTCHA site key',
      critical: true,
    },
    RECAPTCHA_SECRET_KEY: {
      present: Boolean(process.env.RECAPTCHA_SECRET_KEY),
      role: 'Server-side reCAPTCHA verification; without it every submit returns 403',
      critical: true,
    },
    RECAPTCHA_PROJECT_ID: {
      present: Boolean(process.env.RECAPTCHA_PROJECT_ID),
      role: 'GCP project id for reCAPTCHA Enterprise (optional, defaults to "lavaca-gc")',
      critical: false,
    },
    RESEND_API_KEY: {
      present: Boolean(process.env.RESEND_API_KEY),
      role: 'Email delivery for lead + error notifications',
      critical: false,
    },
    LEAD_NOTIFICATION_EMAIL: {
      present: Boolean(process.env.LEAD_NOTIFICATION_EMAIL),
      role: 'Where lead + error alert emails go (defaults to alex@vacamoo.com)',
      critical: false,
    },
    TELEGRAM_BOT_TOKEN: {
      present: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      role: 'Telegram bot token for instant lead + error alerts',
      critical: false,
    },
    TELEGRAM_CHAT_ID: {
      present: Boolean(process.env.TELEGRAM_CHAT_ID),
      role: 'Telegram chat/channel id to send alerts to',
      critical: false,
    },
  };

  const missingCritical = Object.entries(required)
    .filter(([, v]) => v.critical && !v.present)
    .map(([k]) => k);
  const missingOptional = Object.entries(required)
    .filter(([, v]) => !v.critical && !v.present)
    .map(([k]) => k);

  const summary = {
    formsWillWork: missingCritical.length === 0,
    leadAlertsEnabled:
      Boolean(process.env.RESEND_API_KEY) ||
      (Boolean(process.env.TELEGRAM_BOT_TOKEN) && Boolean(process.env.TELEGRAM_CHAT_ID)),
    missingCritical,
    missingOptional,
  };

  return NextResponse.json(
    {
      status: summary.formsWillWork ? 'ok' : 'broken',
      summary,
      env: required,
      hint: summary.formsWillWork
        ? 'All critical env vars set. If submissions still fail, hit /api/health/forms after a failing submit to see logs in Vercel.'
        : `Missing critical env vars: ${missingCritical.join(', ')}. Add them in Vercel → Project → Settings → Environment Variables, then redeploy.`,
    },
    { status: summary.formsWillWork ? 200 : 503 }
  );
}
