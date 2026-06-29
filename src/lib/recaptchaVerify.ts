/**
 * Server-side reCAPTCHA Enterprise verification (v3 score + v2 checkbox fallback).
 *
 * This is the same two-phase verification used by /api/leads/submit, extracted so
 * other public endpoints (e.g. the Buy + Remodel newsletter signup) get the exact
 * same gate without duplicating the logic. Fails CLOSED on any error/misconfig.
 */

export type RecaptchaReason = 'ok' | 'low_score' | 'invalid' | 'error';

// Minimum v3 score to accept. Configurable via RECAPTCHA_MIN_SCORE; fail-closed
// to 0.5 on any unset/out-of-range value.
function getMinRecaptchaScore(): number {
  const n = Number(process.env.RECAPTCHA_MIN_SCORE);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.5;
}

export async function verifyRecaptcha(
  token: string,
  expectedAction: string,
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
      },
    );

    if (!res.ok) {
      // Fall back to the classic siteverify endpoint.
      const v3Res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: secretKey, response: token }),
        signal: AbortSignal.timeout(8000),
      });
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

/** Whether the v2 checkbox fallback is available (v2 site key + secret set). */
export function isRecaptchaV2Configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY && process.env.RECAPTCHA_SECRET_KEY);
}

/** Verify a v2 "I'm not a robot" checkbox token. Fails CLOSED. */
export async function verifyRecaptchaV2(token: string): Promise<boolean> {
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
      },
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data.tokenProperties?.valid === true;
  } catch (err) {
    console.error('reCAPTCHA v2 verification error:', err);
    return false;
  }
}
