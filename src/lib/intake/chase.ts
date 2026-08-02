/**
 * Chasing the two ways an intake goes quiet.
 *
 * WEB-01B is one of them: a lead who submitted the form and never opened the
 * link. The other - opened it, answered some, stopped - is not in the spec, and
 * fell in the gap between "never opened" and "completed" when slice A shipped.
 * A half-answered lead has still told us something, and the owner should have it.
 *
 * Both fire ONCE per session. A cron that re-alerts every run is worse than one
 * that never fires, because the owner learns to ignore it.
 */
import { escapeTelegram } from '@/lib/notify/telegramMessage';

export type ChaseKind = 'low_intent' | 'abandoned';

export interface ChaseCandidate {
  id: string;
  lead_id: string | null;
  first_name: string | null;
  project_type: string | null;
  answers: Record<string, string>;
  created_at: string;
  opened_at: string | null;
}

/** Which questions a lead got through, in the order the flow asks them. */
const ANSWER_ORDER: Array<{ field: string; label: string }> = [
  { field: 'message', label: 'what the project is' },
  { field: 'city', label: 'their town' },
  { field: 'scope_tier', label: 'scope' },
  { field: 'scope_detail', label: 'scope in their words' },
  { field: 'finish_level', label: 'finish level' },
  { field: 'project_timeline', label: 'timeline' },
  { field: 'price_reaction', label: 'how the price landed' },
  { field: 'address', label: 'address' },
  { field: 'contact_time_preference', label: 'when to call' },
];

export function answeredLabels(answers: Record<string, string>): string[] {
  return ANSWER_ORDER.filter((a) => answers[a.field]).map((a) => a.label);
}

/** Whole hours since an ISO timestamp, floored. Pure, so it is testable. */
export function hoursSince(iso: string, now: Date): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 3_600_000));
}

/**
 * WEB-01B. Says plainly that non-engagement is the signal, so it reads as
 * information rather than as a system complaining about itself.
 */
export function lowIntentMessage(c: ChaseCandidate, now: Date): string {
  const who = c.first_name || 'A lead';
  const hrs = hoursSince(c.created_at, now);
  return [
    '<b>Never opened their intake link</b>',
    '',
    `<b>${escapeTelegram(who)}</b>${c.project_type ? ` · ${escapeTelegram(c.project_type)}` : ''}`,
    `Submitted ${hrs} hour${hrs === 1 ? '' : 's'} ago, link never opened.`,
    '',
    'Lower intent, but not nothing - worth one manual follow-up before nurture takes over.',
  ].join('\n');
}

/**
 * The half-finished case. Leads with how far they got, because a partial answer
 * set read as a complete one would be worse than no message at all.
 */
export function abandonedMessage(c: ChaseCandidate, now: Date): string {
  const who = c.first_name || 'A lead';
  const hrs = hoursSince(c.opened_at ?? c.created_at, now);
  const got = answeredLabels(c.answers);
  const a = c.answers;

  const lines: (string | null)[] = [
    '<b>Started the intake and stopped</b>',
    '',
    `<b>${escapeTelegram(who)}</b>${c.project_type ? ` · ${escapeTelegram(c.project_type)}` : ''}`,
    `Opened it ${hrs} hour${hrs === 1 ? '' : 's'} ago and did not finish.`,
    '',
    got.length
      ? `<b>They did tell us</b> ${escapeTelegram(got.join(', '))}`
      : '<b>They answered nothing</b> - opened it and left.',
    a.message ? `<i>"${escapeTelegram(a.message.slice(0, 400))}"</i>` : null,
    a.city ? `<b>Town</b> ${escapeTelegram(a.city)}` : null,
    '',
    'Incomplete, so it has NOT been scored or routed. Call them on what is here.',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

export function chaseMessage(kind: ChaseKind, c: ChaseCandidate, now: Date): string {
  return kind === 'low_intent' ? lowIntentMessage(c, now) : abandonedMessage(c, now);
}
