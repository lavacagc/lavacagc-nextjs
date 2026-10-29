/**
 * Sends one sub a message built by offerEmail.ts, by email and by text at once,
 * and reports each channel's outcome in the vocabulary offer_recipients stores:
 *   sent | failed | not_configured (no provider key) | skipped (no address on file).
 * Never throws: a failed channel is an outcome to record, not an error.
 */
import { sendSms } from './sms';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { cleanEnv } from '@/lib/envClean';
import { OFFER_FROM } from './offerEmail';

export type ChannelStatus = 'sent' | 'failed' | 'not_configured' | 'skipped';

export interface SendOutcome {
  email: ChannelStatus;
  sms: ChannelStatus;
}

export async function sendToSub(args: {
  sub: { email: string; phone: string; contact_name: string; business_name: string };
  category: 'sub_offer' | 'sub_offer_notice';
  email: { subject: string; html: string; text: string };
  sms: string;
  sentBy?: string | null;
  campaign?: Record<string, unknown>;
}): Promise<SendOutcome> {
  const { sub } = args;
  const emailPromise: Promise<ChannelStatus> = sub.email.trim()
    ? sendTrackedEmail({
        from: OFFER_FROM,
        to: sub.email.trim(),
        replyTo: cleanEnv(process.env.LEAD_NOTIFICATION_EMAIL) || undefined,
        subject: args.email.subject,
        html: args.email.html,
        text: args.email.text,
        category: args.category,
        toName: sub.contact_name || sub.business_name,
        sentBy: args.sentBy ?? 'system',
        campaign: args.campaign ?? null,
      }).then((r) => {
        if (r.status === 'sent') return 'sent' as const;
        if (r.status === 'skipped' && r.reason === 'no_api_key') return 'not_configured' as const;
        if (r.status === 'skipped') return 'skipped' as const;
        return 'failed' as const;
      }).catch(() => 'failed' as const)
    : Promise.resolve('skipped' as const);

  const smsPromise: Promise<ChannelStatus> = sub.phone.trim()
    ? sendSms({ to: sub.phone, body: args.sms }).then((r) => r.status).catch(() => 'failed' as const)
    : Promise.resolve('skipped' as const);

  const [email, sms] = await Promise.all([emailPromise, smsPromise]);
  return { email, sms };
}
