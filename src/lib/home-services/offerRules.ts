/**
 * The rules of the bid request system that do not need a database: who may
 * receive an offer (BD3), what a sub's offer page shows (OF1-OF5), the decline
 * reasons, and the row types. Pure so the admin UI explains an exclusion with
 * exactly the rule the server applies, and so the tests can pin them.
 */
import type { Lang, Trade } from './catalog';
import type { StringKey } from './i18n';

export type SubStatus = 'pending' | 'approved' | 'suspended';

export interface SubRow {
  id: string;
  business_name: string;
  contact_name: string;
  phone: string;
  email: string;
  trades: string[];
  counties: string[];
  language: Lang;
  status: SubStatus;
  specnook_sub_id: string | null;
  insurance_expires_at: string | null;
  hic_expires_at: string | null;
  callback_count: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type OfferStatus = 'open' | 'assigned' | 'expired' | 'cancelled';

export interface JobOfferRow {
  id: string;
  request_id: string;
  trade: Trade;
  scope_summary: string;
  town: string;
  sub_pay_cents: number;
  customer_price_cents: number;
  target_start: string | null;
  target_end: string | null;
  photo_ids: string[];
  status: OfferStatus;
  assigned_sub_id: string | null;
  assigned_at: string | null;
  specnook_push_status: 'pending' | 'sent' | 'failed' | 'skipped';
  expires_at: string;
  created_at: string;
  created_by: string | null;
}

export interface OfferRecipientRow {
  id: string;
  offer_id: string;
  sub_id: string;
  token: string;
  email_status: string;
  sms_status: string;
  sent_at: string | null;
  opened_at: string | null;
  paused_at: string | null;
  expires_at: string;
  closed_reason: 'taken' | 'expired' | 'cancelled' | null;
  created_at: string;
}

export const RESPONSE_TYPES = ['accept', 'counter', 'details', 'decline'] as const;
export type ResponseType = (typeof RESPONSE_TYPES)[number];
export type ResponseStatus = 'pending' | 'accepted' | 'confirmed' | 'rejected' | 'replied' | 'recorded';

export interface Attachment {
  storage_path: string;
  content_type: string;
  bytes: number;
  name?: string;
}

export interface OfferResponseRow {
  id: string;
  offer_id: string;
  recipient_id: string;
  sub_id: string;
  type: ResponseType;
  counter_cents: number | null;
  note: string;
  decline_reason: DeclineReason | null;
  attachments: Attachment[];
  status: ResponseStatus;
  admin_reply: string | null;
  admin_reply_at: string | null;
  admin_price_cents: number | null;
  admin_reply_attachments: Attachment[];
  created_at: string;
}

export interface DeclineCallRow {
  id: string;
  response_id: string;
  request_id: string;
  sub_id: string;
  status: 'open' | 'done';
  counter_cents: number | null;
  will_take: boolean | null;
  reason_text: string;
  called_at: string | null;
  created_at: string;
}

export const DECLINE_REASONS = ['pay_too_low', 'too_far', 'schedule', 'scope_unclear', 'other'] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export const DECLINE_REASON_KEY: Record<DeclineReason, StringKey> = {
  pay_too_low: 'declinePayTooLow',
  too_far: 'declineTooFar',
  schedule: 'declineSchedule',
  scope_unclear: 'declineScopeUnclear',
  other: 'declineOther',
};

export const DECLINE_REASON_LABEL: Record<DeclineReason, string> = {
  pay_too_low: 'Pay too low',
  too_far: 'Too far',
  schedule: 'Schedule',
  scope_unclear: 'Scope unclear',
  other: 'Other',
};

/** Detail-request attachments: up to 3 files, 6 MB each (OF4). */
export const MAX_RESPONSE_FILES = 3;
export const MAX_RESPONSE_FILE_BYTES = 6 * 1024 * 1024;

/** A date column (YYYY-MM-DD) is expired when it is before today in New Jersey. */
export function isDateExpired(date: string | null | undefined, today: string): boolean {
  if (!date) return false;
  return date.slice(0, 10) < today;
}

/** Today as YYYY-MM-DD in America/New_York, the calendar the expiry dates are written in. */
export function todayInNewJersey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export interface ComplianceFlags {
  insuranceExpired: boolean;
  hicExpired: boolean;
}

export function complianceFlags(sub: Pick<SubRow, 'insurance_expires_at' | 'hic_expires_at'>, today: string): ComplianceFlags {
  return {
    insuranceExpired: isDateExpired(sub.insurance_expires_at, today),
    hicExpired: isDateExpired(sub.hic_expires_at, today),
  };
}

/**
 * Why a sub would NOT get an offer for this trade in this county, or null when
 * they would (BD3): status approved, trade listed, county listed or no county
 * restriction, and neither insurance nor HIC expired.
 *
 * A request whose county is unknown matches only subs with no county list,
 * since "serves Essex" says nothing about a town we cannot place.
 */
export function offerExclusion(
  sub: Pick<SubRow, 'status' | 'trades' | 'counties' | 'insurance_expires_at' | 'hic_expires_at'>,
  trade: string,
  county: string | null,
  today: string,
): string | null {
  if (sub.status !== 'approved') return `Status is ${sub.status}`;
  if (!sub.trades.includes(trade)) return 'Does not do this trade';
  if (sub.counties.length > 0 && (!county || !sub.counties.includes(county))) {
    return county ? `Does not serve ${county}` : 'Request county unknown and sub is limited to listed counties';
  }
  const flags = complianceFlags(sub, today);
  if (flags.insuranceExpired) return 'Insurance expired';
  if (flags.hicExpired) return 'HIC registration expired';
  return null;
}

/**
 * What a sub's offer page is showing. Ordered: the first state that applies
 * wins. `live` means the sub can still respond.
 */
export type RecipientView =
  | { kind: 'won' }
  | { kind: 'taken' }
  | { kind: 'cancelled' }
  | { kind: 'expired' }
  | { kind: 'live' };

export function recipientView(
  offer: Pick<JobOfferRow, 'status' | 'assigned_sub_id'>,
  recipient: Pick<OfferRecipientRow, 'sub_id' | 'paused_at' | 'expires_at' | 'closed_reason'>,
  now: Date,
): RecipientView {
  if (offer.status === 'assigned') {
    return offer.assigned_sub_id === recipient.sub_id ? { kind: 'won' } : { kind: 'taken' };
  }
  if (recipient.closed_reason === 'taken') return { kind: 'taken' };
  if (offer.status === 'cancelled' || recipient.closed_reason === 'cancelled') return { kind: 'cancelled' };
  if (offer.status === 'expired' || recipient.closed_reason === 'expired') return { kind: 'expired' };
  // A paused clock never runs out: the sub is waiting on Alex, not dawdling.
  if (!recipient.paused_at && new Date(recipient.expires_at).getTime() <= now.getTime()) return { kind: 'expired' };
  return { kind: 'live' };
}

/**
 * The price a sub can confirm at, if Alex has put one in front of them: an
 * accepted counter (their own number) or a reply with a new price (his).
 * Latest response wins.
 */
export function confirmablePrice(responses: Array<Pick<OfferResponseRow, 'type' | 'status' | 'counter_cents' | 'admin_price_cents' | 'created_at' | 'id'>>):
  { responseId: string; cents: number; source: 'accepted_counter' | 'admin_price' } | null {
  const counters = responses
    .filter((r) => r.type === 'counter')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const latest = counters[0];
  if (!latest) return null;
  if (latest.status === 'accepted' && latest.counter_cents) {
    return { responseId: latest.id, cents: latest.counter_cents, source: 'accepted_counter' };
  }
  if (latest.status === 'replied' && latest.admin_price_cents) {
    return { responseId: latest.id, cents: latest.admin_price_cents, source: 'admin_price' };
  }
  return null;
}

/** New 24h deadline after a detail reply: the old one plus however long the clock was paused. */
export function extendedExpiry(expiresAt: string, pausedAt: string, now: Date): string {
  const paused = Math.max(0, now.getTime() - new Date(pausedAt).getTime());
  return new Date(new Date(expiresAt).getTime() + paused).toISOString();
}
