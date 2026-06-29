import { Resend } from 'resend';
import {
  listingsVerificationHtml,
  listingsVerificationText,
  listingsWelcomeHtml,
  listingsWelcomeText,
} from '@/lib/emailTemplates';
import { cleanEnv } from '@/lib/envClean';

/**
 * Customer-facing emails for the "Buy + Remodel" email gate (double opt-in +
 * newsletter). Sent from the warm identity per the email-from-address
 * convention (anything a customer reads is "Alex from La Vaca GC").
 *
 * Runs in-process — do NOT self-fetch. See note in sendEstimateEmail.ts.
 */

const FROM_ADDRESS = 'Alex from La Vaca GC <alex@email.lavaca.link>';
const DEFAULT_REPLY_TO = 'info@lavacagc.com';

export interface ListingsEmailResult {
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
  emailId?: string;
  error?: string;
}

interface VerificationArgs {
  to: string;
  firstName: string;
  verifyUrl: string;
  unsubscribeUrl: string;
}

interface WelcomeArgs {
  to: string;
  firstName: string;
  browseUrl: string;
  unsubscribeUrl: string;
}

async function send(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<ListingsEmailResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) {
    console.warn('⚠️ RESEND_API_KEY not configured — skipping listings email');
    return { status: 'skipped', reason: 'no_api_key' };
  }
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      replyTo: DEFAULT_REPLY_TO,
      subject,
      html,
      text,
    });
    if (error) {
      console.error('Failed to send listings email:', error);
      return { status: 'failed', error: error.message };
    }
    return { status: 'sent', emailId: data?.id };
  } catch (err) {
    console.error('Listings email error:', err);
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

export function sendListingsVerificationEmail(args: VerificationArgs): Promise<ListingsEmailResult> {
  const payload = {
    firstName: args.firstName,
    verifyUrl: args.verifyUrl,
    unsubscribeUrl: args.unsubscribeUrl,
  };
  return send(
    args.to,
    'Confirm your email to unlock La Vaca’s Buy + Remodel homes',
    listingsVerificationHtml(payload),
    listingsVerificationText(payload),
  );
}

export function sendListingsWelcomeEmail(args: WelcomeArgs): Promise<ListingsEmailResult> {
  const payload = {
    firstName: args.firstName,
    browseUrl: args.browseUrl,
    unsubscribeUrl: args.unsubscribeUrl,
  };
  return send(
    args.to,
    'You’re in — browse La Vaca’s Buy + Remodel homes',
    listingsWelcomeHtml(payload),
    listingsWelcomeText(payload),
  );
}
