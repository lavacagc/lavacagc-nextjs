/**
 * The CTA Tests leader board, computed from already-fetched rows. Pure, so the
 * numbers can be reasoned about (and tested) without a database.
 *
 * Views and clicks come from cta_events, where a unique index allows one row
 * per visitor per variant per event type, so a row count IS a distinct-visitor
 * count. Requests, valid leads and won jobs come only from
 * home_service_requests.cta_variant_primary / cta_variant_secondary.
 */
import { CTA_BUTTONS, type CtaButton, type CtaVariantKey } from './types';

export interface CtaVariantRow {
  id: string;
  button: CtaButton;
  variant_key: CtaVariantKey;
  wording: string;
  subtext: string | null;
  color: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CtaRequestRow {
  status: string;
  phone_verified: boolean;
  cta_variant_primary: string | null;
  cta_variant_secondary: string | null;
}

export type EventType = 'view' | 'click';
/** Keyed by `eventCountKey`. */
export type EventCounts = Map<string, number>;

export function eventCountKey(button: CtaButton, variantKey: string, type: EventType): string {
  return `${button}:${variantKey}:${type}`;
}

/** Statuses that count as a valid lead while SMS verification is not in use. */
export const VALID_STATUSES_WITHOUT_SMS = ['new', 'contacted', 'bid_sent', 'assigned', 'won'] as const;

export const VALID_LEAD_RULE_SMS =
  'Valid lead = phone_verified is true (SMS verification is in use: at least one request has a verified phone).';
export const VALID_LEAD_RULE_NO_SMS =
  'Valid lead = status in new, contacted, bid_sent, assigned or won (SMS verification is not in use: no request has a verified phone, so held and lost are excluded).';

export interface CtaVariantStats {
  id: string;
  variant_key: CtaVariantKey;
  wording: string;
  subtext: string | null;
  color: string | null;
  active: boolean;
  views: number;
  clicks: number;
  requests: number;
  valid_leads: number;
  won: number;
  /** clicks / views; null when there are no views. */
  click_rate: number | null;
  /** requests / views; null when there are no views. The leader metric. */
  request_rate: number | null;
}

export type LeaderStatus = 'leader' | 'not_enough_visitors' | 'tied' | 'single_variant' | 'no_active_variants';

export interface CtaButtonReport {
  button: CtaButton;
  variants: CtaVariantStats[];
  active_count: number;
  /** Fewest views among ACTIVE variants (0 when none are active). */
  sample_size: number;
  /** Active variants with at least min_visitors views. */
  eligible_count: number;
  leader: { variant_key: CtaVariantKey; wording: string; request_rate: number; views: number } | null;
  leader_status: LeaderStatus;
}

export interface CtaReport {
  min_visitors: number;
  sms_verification_in_use: boolean;
  valid_lead_rule: string;
  leader_rule: string;
  buttons: Record<CtaButton, CtaButtonReport>;
}

export const LEADER_RULE =
  'The leader is the active variant with the highest request rate (requests / views). ' +
  'It is only named once every active variant has at least min_visitors views ' +
  '(sample_size >= min_visitors), when the button has two or more active variants, and when the top rate is not tied.';

function rate(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

export function isValidLead(row: CtaRequestRow, smsInUse: boolean): boolean {
  if (smsInUse) return row.phone_verified === true;
  return (VALID_STATUSES_WITHOUT_SMS as readonly string[]).includes(row.status);
}

export function computeCtaReport(input: {
  variants: CtaVariantRow[];
  events: EventCounts;
  requests: CtaRequestRow[];
  minVisitors: number;
  /** True when any home_service_requests row (not only attributed ones) has phone_verified. */
  smsInUse: boolean;
}): CtaReport {
  const { variants, events, requests, minVisitors, smsInUse } = input;
  const buttons = {} as Record<CtaButton, CtaButtonReport>;

  for (const button of CTA_BUTTONS) {
    const column = button === 'primary' ? 'cta_variant_primary' : 'cta_variant_secondary';
    const stats: CtaVariantStats[] = variants
      .filter((v) => v.button === button)
      .sort((a, b) => a.variant_key.localeCompare(b.variant_key))
      .map((v) => {
        const attributed = requests.filter((r) => r[column] === v.variant_key);
        const views = events.get(eventCountKey(button, v.variant_key, 'view')) ?? 0;
        const clicks = events.get(eventCountKey(button, v.variant_key, 'click')) ?? 0;
        return {
          id: v.id,
          variant_key: v.variant_key,
          wording: v.wording,
          subtext: v.subtext,
          color: v.color,
          active: v.active,
          views,
          clicks,
          requests: attributed.length,
          valid_leads: attributed.filter((r) => isValidLead(r, smsInUse)).length,
          won: attributed.filter((r) => r.status === 'won').length,
          click_rate: rate(clicks, views),
          request_rate: rate(attributed.length, views),
        };
      });

    const active = stats.filter((s) => s.active);
    const sampleSize = active.length > 0 ? Math.min(...active.map((s) => s.views)) : 0;
    const eligible = active.filter((s) => s.views >= minVisitors);

    let leader: CtaButtonReport['leader'] = null;
    let status: LeaderStatus;
    if (active.length === 0) status = 'no_active_variants';
    else if (active.length === 1) status = 'single_variant';
    else if (sampleSize < minVisitors) status = 'not_enough_visitors';
    else {
      const ranked = [...eligible].sort((a, b) => (b.request_rate ?? 0) - (a.request_rate ?? 0));
      const [top, second] = ranked;
      if (second && (top.request_rate ?? 0) === (second.request_rate ?? 0)) status = 'tied';
      else {
        status = 'leader';
        leader = { variant_key: top.variant_key, wording: top.wording, request_rate: top.request_rate ?? 0, views: top.views };
      }
    }

    buttons[button] = {
      button,
      variants: stats,
      active_count: active.length,
      sample_size: sampleSize,
      eligible_count: eligible.length,
      leader,
      leader_status: status,
    };
  }

  return {
    min_visitors: minVisitors,
    sms_verification_in_use: smsInUse,
    valid_lead_rule: smsInUse ? VALID_LEAD_RULE_SMS : VALID_LEAD_RULE_NO_SMS,
    leader_rule: LEADER_RULE,
    buttons,
  };
}
