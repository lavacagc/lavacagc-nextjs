/**
 * Outbound text messages: the one-time verification code and confirmation to
 * a homeowner, and the job offer to a sub.
 *
 * Twilio's Messages API over plain fetch - no SDK, nothing to bundle. Reads
 * env per call, like supabase-rest.ts, so a stub can swap it under test and a
 * late-arriving variable is seen.
 *
 * NEVER THROWS, and `not_configured` is a normal outcome, not an error: the
 * site runs without an SMS provider today (docs/home-services/00-site-audit.md,
 * C6). Callers decide what that means for them - the request flow skips the
 * Held queue and marks the lead unverified; the bid system falls back to email
 * only. Both must handle every status here, so the type is closed.
 */
import { cleanEnv } from '@/lib/envClean';

export type SmsStatus = 'sent' | 'not_configured' | 'failed';

export interface SmsResult {
  status: SmsStatus;
  /** Twilio message SID when sent. */
  sid?: string;
  error?: string;
}

export interface SmsInput {
  /** E.164 preferred; a bare 10-digit US number is normalised. */
  to: string;
  body: string;
}

function readConfig(): { sid: string; token: string; from: string } | null {
  const sid = cleanEnv(process.env.TWILIO_ACCOUNT_SID);
  const token = cleanEnv(process.env.TWILIO_AUTH_TOKEN);
  const from = cleanEnv(process.env.TWILIO_FROM);
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

export function isSmsConfigured(): boolean {
  return readConfig() !== null;
}

/**
 * Normalise what a homeowner typed into E.164 for the US. Returns null when it
 * cannot be a US mobile number; the caller then treats it as unverifiable
 * rather than sending to garbage.
 */
export function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

/** The Twilio text body cap is 1600 characters; keep every message well under. */
export const SMS_BODY_MAX = 600;

export async function sendSms(input: SmsInput): Promise<SmsResult> {
  const config = readConfig();
  if (!config) return { status: 'not_configured' };

  const to = normalizeUsPhone(input.to);
  if (!to) return { status: 'failed', error: 'not a US phone number' };

  const body = input.body.length > SMS_BODY_MAX ? `${input.body.slice(0, SMS_BODY_MAX - 3)}...` : input.body;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.sid}:${config.token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: config.from, Body: body }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Twilio's error body names the number; keep the status and code only.
      const code = text.match(/"code":\s*(\d+)/)?.[1];
      return { status: 'failed', error: `Twilio ${res.status}${code ? ` code ${code}` : ''}` };
    }
    const data = (await res.json()) as { sid?: string };
    return { status: 'sent', sid: data.sid };
  } catch (err) {
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}
