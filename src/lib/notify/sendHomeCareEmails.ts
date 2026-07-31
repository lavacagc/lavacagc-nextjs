import { sendTrackedEmail, type EmailCategory } from '@/lib/notify/sendEmail';
import type { StreamKey } from '@/lib/preferences/preferences';
import { buildVerificationEmail, buildWelcomeEmail } from '@/lib/homecare/lifecycleEmails';

/**
 * Customer-facing emails for La Vaca Home Care (double opt-in + welcome).
 * Program identity: everything a Home Care member receives is from
 * "La Vaca Home Care" (owner decision 2026-07-03 — program emails carry the
 * program's name, not the personal warm identity used elsewhere). Runs
 * in-process (do NOT self-fetch). All sends funnel through sendTrackedEmail
 * so they land in email_log.
 *
 * This module is the SEND side only: the verification and welcome bodies are
 * pure builders in lib/homecare/lifecycleEmails.ts (on the shared emailShell),
 * so they can be rendered and asserted without sending anything. `HOME_CARE_FROM`
 * is the shared sender for the service-work emails too, which send through
 * sendTrackedEmail directly with their own reply-to (SERVICE_REPLY_TO) rather
 * than the DEFAULT_REPLY_TO here.
 */

export const HOME_CARE_FROM = 'La Vaca Home Care <alex@email.lavaca.link>';
const DEFAULT_REPLY_TO = 'info@lavacagc.com';

export interface HomeCareEmailResult {
  status: 'sent' | 'skipped' | 'failed' | 'error';
  reason?: string;
  emailId?: string;
  error?: string;
}

function send(
  to: string,
  subject: string,
  html: string,
  text: string,
  category: EmailCategory,
  homeownerId?: string | null,
  preferenceStream?: StreamKey,
  knownSuppressed?: boolean,
): Promise<HomeCareEmailResult> {
  const base = {
    from: HOME_CARE_FROM,
    to,
    replyTo: DEFAULT_REPLY_TO,
    subject,
    html,
    text,
    category,
    homeownerId: homeownerId ?? null,
  };
  // The stream and a verdict about it are one decision, so they're attached in
  // one branch: sendTrackedEmail's type has no shape where a suppression exists
  // without the stream it came from.
  return sendTrackedEmail(
    preferenceStream ? { ...base, preferenceStream, knownSuppressed: knownSuppressed === true } : base,
  );
}

export function sendHomeCareVerificationEmail(args: {
  to: string;
  firstName?: string | null;
  verifyUrl: string;
  unsubscribeUrl: string;
  homeownerId?: string | null;
}): Promise<HomeCareEmailResult> {
  const { subject, html, text } = buildVerificationEmail({
    firstName: args.firstName,
    verifyUrl: args.verifyUrl,
    unsubscribeUrl: args.unsubscribeUrl,
  });
  return send(args.to, subject, html, text, 'verification', args.homeownerId);
}

/**
 * Send a pre-rendered seasonal/monthly newsletter (content built by
 * lib/homecare/newsletter).
 *
 * `knownSuppressed` is for a caller that classified this recipient against its
 * own read of the home_care opt-out list: pass it rather than skipping the call,
 * and the honored opt-out still lands in email_log as a suppression.
 */
export function sendHomeCareNewsletterEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
  homeownerId?: string | null;
  knownSuppressed?: boolean;
}): Promise<HomeCareEmailResult> {
  return send(args.to, args.subject, args.html, args.text, 'home_care_newsletter', args.homeownerId, 'home_care', args.knownSuppressed);
}

export function sendHomeCareWelcomeEmail(args: {
  to: string;
  firstName?: string | null;
  checklistUrl: string;
  unsubscribeUrl: string;
  preferencesUrl?: string | null;
  homeownerId?: string | null;
}): Promise<HomeCareEmailResult> {
  const { subject, html, text } = buildWelcomeEmail({
    firstName: args.firstName,
    checklistUrl: args.checklistUrl,
    unsubscribeUrl: args.unsubscribeUrl,
    preferencesUrl: args.preferencesUrl,
  });
  return send(args.to, subject, html, text, 'welcome', args.homeownerId);
}
