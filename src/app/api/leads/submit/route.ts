import { NextRequest, NextResponse } from 'next/server';
import { scoreLead, prepareLeadForScoring } from '@/lib/leadScoring';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Shared header for internal server-to-server calls so middleware lets them
// past admin auth. If the secret isn't set the header is omitted and the
// caller will be 401'd — diagnostics will flag this in /api/health/forms.
function internalHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = process.env.INTERNAL_WEBHOOK_SECRET;
  if (secret) headers['x-internal-secret'] = secret;
  return headers;
}

// Fire-and-forget alert to the form-error notify channel. Never throws.
async function reportFailure(
  baseUrl: string,
  payload: {
    stage: string;
    source: string;
    message: string;
    details?: unknown;
    lead?: { name?: string; email?: string; phone?: string };
  }
): Promise<void> {
  try {
    await fetch(`${baseUrl}/api/notify/form-error`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Failed to dispatch form-error alert:', err);
  }
}

// Server-side reCAPTCHA verification
async function verifyRecaptcha(token: string, expectedAction: string): Promise<{ success: boolean; score: number }> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey) {
    console.error('RECAPTCHA_SECRET_KEY not configured');
    return { success: false, score: 0 };
  }

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
      }
    );

    if (!res.ok) {
      // Fallback to reCAPTCHA v3 verification if enterprise fails
      const v3Res = await fetch(
        `https://www.google.com/recaptcha/api/siteverify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            secret: secretKey,
            response: token,
          }),
        }
      );
      const v3Data = await v3Res.json();
      return {
        success: v3Data.success && (v3Data.score ?? 0) >= 0.5,
        score: v3Data.score ?? 0,
      };
    }

    const data = await res.json();
    const score = data.riskAnalysis?.score ?? 0;
    const actionMatch = data.tokenProperties?.action === expectedAction;
    const valid = data.tokenProperties?.valid === true;

    return {
      success: valid && actionMatch && score >= 0.5,
      score,
    };
  } catch (err) {
    console.error('reCAPTCHA verification error:', err);
    return { success: false, score: 0 };
  }
}

// Insert lead using service role key (bypasses RLS)
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

export async function POST(request: NextRequest) {
  const baseUrl = request.nextUrl.origin;
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

    // Honeypot check — bots fill hidden fields, humans don't
    if (honeypot) {
      // Return fake success so bot thinks it worked
      return NextResponse.json({ success: true });
    }

    // Validate required fields
    if (!recaptchaToken || !recaptchaAction) {
      await reportFailure(baseUrl, {
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
      await reportFailure(baseUrl, {
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

    // Server-side reCAPTCHA verification
    const recaptchaResult = await verifyRecaptcha(recaptchaToken, recaptchaAction);
    console.log(`reCAPTCHA verification: action=${recaptchaAction}, score=${recaptchaResult.score}, success=${recaptchaResult.success}`);

    if (!recaptchaResult.success) {
      await reportFailure(baseUrl, {
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

    // Apply lead scoring if not already scored
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

    // Insert lead via service role (bypasses RLS)
    const { error: insertError } = await insertLead(finalLeadData);
    if (insertError) {
      console.error('Failed to insert lead:', insertError);
      await reportFailure(baseUrl, {
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

    // Fire notifications in background (non-blocking)
    const name = leadContext.name || '';

    Promise.allSettled([
      // Telegram notification
      fetch(`${baseUrl}/api/notify/telegram-lead`, {
        method: 'POST',
        headers: internalHeaders(),
        body: JSON.stringify({
          name,
          email: leadFields.email || '',
          phone: leadFields.phone || '',
          projectType: leadFields.project_type || leadFields.inquiry_type || 'General Inquiry',
          score: finalLeadData.score,
          tier: finalLeadData.tier,
          source: leadFields.source || 'website',
        }),
      }),
      // Email notification
      fetch(`${baseUrl}/api/notify/new-lead`, {
        method: 'POST',
        headers: internalHeaders(),
        body: JSON.stringify({
          name,
          email: leadFields.email || '',
          phone: leadFields.phone || '',
          projectType: leadFields.project_type || leadFields.inquiry_type || 'General Inquiry',
          source: leadFields.source || 'website',
        }),
      }),
      // Follow-up webhook (public route — no internal secret needed)
      fetch(`${baseUrl}/api/leads/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email: leadFields.email || '',
          source: leadFields.source || 'website',
          projectType: leadFields.project_type || leadFields.inquiry_type,
        }),
      }),
    ]).catch(err => console.error('Notification dispatch error:', err));

    return NextResponse.json({
      success: true,
      score: finalLeadData.score,
      tier: finalLeadData.tier,
    });
  } catch (error) {
    console.error('Lead submission error:', error);
    await reportFailure(baseUrl, {
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
