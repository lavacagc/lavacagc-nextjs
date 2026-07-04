import {
  listingsVerificationHtml,
  listingsVerificationText,
  listingsWelcomeHtml,
  listingsWelcomeText,
} from '@/lib/emailTemplates';
import { sendTrackedEmail, type EmailCategory } from '@/lib/notify/sendEmail';

/**
 * Customer-facing emails for the "Buy + Remodel" email gate (double opt-in +
 * newsletter). Sent from the warm identity per the email-from-address
 * convention (anything a customer reads is "Alex from La Vaca GC", except
 * Home Care program mail, which sends as "La Vaca Home Care" - see
 * sendHomeCareEmails.ts).
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
  subscriberId?: string | null;
}

function send(
  to: string,
  subject: string,
  html: string,
  text: string,
  category: EmailCategory,
  subscriberId?: string | null,
): Promise<ListingsEmailResult> {
  return sendTrackedEmail({
    from: FROM_ADDRESS,
    to,
    replyTo: DEFAULT_REPLY_TO,
    subject,
    html,
    text,
    category,
    subscriberId: subscriberId ?? null,
  });
}

export function sendListingsVerificationEmail(
  args: VerificationArgs & { subscriberId?: string | null },
): Promise<ListingsEmailResult> {
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
    'verification',
    args.subscriberId,
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
    'welcome',
    args.subscriberId,
  );
}
