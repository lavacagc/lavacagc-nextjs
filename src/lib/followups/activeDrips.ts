/**
 * Turn raw follow_up_queue rows into a person-centric "active drips" view: one
 * entry per (person, sequence) that still has a pending email. Pure + testable —
 * the Follow-Ups admin passes fetched rows, tests pass fixtures.
 *
 * `follow_up_queue` is shared between the lead-nurture drip, post-job review
 * requests and night-before visit reminders (see cancelFollowUps.ts), so each
 * person can appear on several distinct drips; we keep them separate so stopping
 * one never touches the other.
 */
import { followUpSequenceOf } from '@/lib/notify/cancelFollowUps';

export interface FollowUpRow {
  id: string;
  lead_email: string;
  lead_name: string | null;
  follow_up_type: string;
  scheduled_at: string;
  status: string;
}

export type DripSequence = 'nurture' | 'review' | 'visit';

export interface ActiveDrip {
  key: string; // `${email}|${sequence}` — stable list key
  email: string;
  name: string;
  sequence: DripSequence;
  nextType: string; // follow_up_type of the soonest pending email
  nextAt: string; // ISO scheduled_at of that email
  pendingCount: number;
}

/**
 * Which sequence a queued email belongs to, read off the shared registry rather
 * than a local guess. Falling back to 'nurture' for anything unrecognised is
 * what put a visit reminder in the lead-drip bucket, where the Stop button
 * cancels nurture types and can never reach it.
 */
export function sequenceOf(followUpType: string): DripSequence {
  return followUpSequenceOf(followUpType) as DripSequence;
}

/** Group PENDING rows into per-person, per-sequence drips, soonest-next first. */
export function buildActiveDrips(rows: FollowUpRow[]): ActiveDrip[] {
  const groups = new Map<string, FollowUpRow[]>();
  for (const r of rows) {
    if (r.status !== 'pending' || !r.lead_email) continue;
    const key = `${r.lead_email.trim().toLowerCase()}|${sequenceOf(r.follow_up_type)}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  const drips: ActiveDrip[] = [];
  for (const [key, arr] of groups) {
    arr.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    const next = arr[0];
    drips.push({
      key,
      email: next.lead_email,
      name: (next.lead_name && next.lead_name.trim()) || next.lead_email,
      sequence: sequenceOf(next.follow_up_type),
      nextType: next.follow_up_type,
      nextAt: next.scheduled_at,
      pendingCount: arr.length,
    });
  }
  drips.sort((a, b) => a.nextAt.localeCompare(b.nextAt));
  return drips;
}

const TYPE_LABELS: Record<string, string> = {
  instant_ack: 'Instant welcome',
  '24h': '24-hour follow-up',
  '48h': '48-hour follow-up',
  '7d': '7-day check-in',
  feedback_day0: 'Review ask · day 0',
  feedback_day3: 'Review ask · day 3',
  feedback_day7: 'Review ask · day 7',
  visit_reminder_1d: 'Visit reminder · night before',
};

export function followUpTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type;
}

const SEQUENCE_LABELS: Record<DripSequence, string> = {
  nurture: 'Lead nurture',
  review: 'Review requests',
  visit: 'Visit reminders',
};

export function sequenceLabel(seq: DripSequence): string {
  return SEQUENCE_LABELS[seq] ?? SEQUENCE_LABELS.nurture;
}

/** Human "when" for a scheduled time, relative to `nowMs`. Pure for testing. */
export function whenRelative(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = t - nowMs;
  if (diff <= 0) return 'due now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ~${mins} min`;
  const hours = Math.round(diff / 3600000);
  if (hours < 24) return `in ~${hours} hr${hours === 1 ? '' : 's'}`;
  const days = Math.round(diff / 86400000);
  if (days === 1) return 'tomorrow';
  return `in ~${days} days`;
}
