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
 *
 * The candidate queries and the claim-send-release sequence live here rather
 * than inline in the route so the safety property they exist for can be tested
 * by exercising it, not by grepping the route for the spelling of a filter.
 */
import { escapeTelegram, escapeTelegramClipped, type TelegramOutcome } from '@/lib/notify/telegramMessage';
import { lowIntentDecision } from './scoring';

export type ChaseKind = 'low_intent' | 'abandoned';

export interface ChaseCandidate {
  id: string;
  lead_id: string | null;
  first_name: string | null;
  project_type: string | null;
  answers: Record<string, string>;
  created_at: string;
  opened_at: string | null;
  updated_at: string | null;
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
 * Per-field budgets, counted in escaped characters.
 *
 * Everything a lead typed is unbounded from Telegram's point of view - `city`
 * is a freeform step and `isValidAnswer` lets it run to 2000 characters, which
 * escaping inflates fivefold. Over 4096 Telegram rejects the whole sendMessage
 * with a 400, this run releases its claim, and the SAME session fails again on
 * every subsequent run: that lead is never chased at all. Same helper and same
 * reasoning as the completion brief.
 */
const CAP = {
  name: 60,
  projectType: 80,
  message: 900,
  town: 120,
} as const;

/**
 * WEB-01B. Says plainly that non-engagement is the signal, so it reads as
 * information rather than as a system complaining about itself.
 */
export function lowIntentMessage(c: ChaseCandidate, now: Date): string {
  const who = escapeTelegramClipped(c.first_name || 'A lead', CAP.name);
  const hrs = hoursSince(c.created_at, now);
  return [
    '<b>Never opened their intake link</b>',
    '',
    `<b>${who}</b>${c.project_type ? ` · ${escapeTelegramClipped(c.project_type, CAP.projectType)}` : ''}`,
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
  const who = escapeTelegramClipped(c.first_name || 'A lead', CAP.name);
  const hrs = hoursSince(c.opened_at ?? c.created_at, now);
  const quiet = c.updated_at ? hoursSince(c.updated_at, now) : null;
  const got = answeredLabels(c.answers);
  const a = c.answers;

  const lines: (string | null)[] = [
    '<b>Started the intake and stopped</b>',
    '',
    `<b>${who}</b>${c.project_type ? ` · ${escapeTelegramClipped(c.project_type, CAP.projectType)}` : ''}`,
    `Opened it ${hrs} hour${hrs === 1 ? '' : 's'} ago and did not finish.`,
    // The quiet period is what selected them, so it is what the owner is told.
    quiet !== null ? `Nothing from them for ${quiet} hour${quiet === 1 ? '' : 's'}.` : null,
    '',
    got.length
      ? `<b>They did tell us</b> ${escapeTelegram(got.join(', '))}`
      : '<b>They answered nothing</b> - opened it and left.',
    a.message ? `<i>"${escapeTelegramClipped(a.message, CAP.message)}"</i>` : null,
    a.city ? `<b>Town</b> ${escapeTelegramClipped(a.city, CAP.town)}` : null,
    '',
    'Incomplete, so it has NOT been scored or routed. Call them on what is here.',
  ];
  return lines.filter((l) => l !== null).join('\n');
}

export function chaseMessage(kind: ChaseKind, c: ChaseCandidate, now: Date): string {
  return kind === 'low_intent' ? lowIntentMessage(c, now) : abandonedMessage(c, now);
}

/* ── finding the candidates ───────────────────────────────────────────────── */

/** One "alerted" stamp per stage, so a lead is only ever chased once per kind. */
export const CHASE_STAMP: Record<ChaseKind, string> = {
  low_intent: 'low_intent_alert_at',
  abandoned: 'abandoned_alert_at',
};

/** How many candidates one run will chase. */
export const CHASE_PAGE = 25;

const SELECT = 'id,lead_id,first_name,project_type,answers,created_at,opened_at,updated_at';

/**
 * The two candidate queries.
 *
 * Both guard `completed_at` and `declined_at`: `markOpened` deliberately
 * swallows its errors, so a finished session with an unwritten open stamp would
 * otherwise match the low-intent query and have its real routing decision
 * overwritten with score 0 / cold.
 *
 * The abandoned stage measures the QUIET period from `updated_at`, which every
 * answer writes - not from `opened_at`. A lead who opened the link at 16:00 and
 * answered a question at 20:55 is still mid-conversation, and telling the owner
 * they "did not finish" a minute before the completion brief arrives would make
 * both messages untrustworthy.
 *
 * One row over the page size is requested so the caller can tell a drained run
 * from a truncated one.
 */
export function candidateQuery(kind: ChaseKind, cutoff: string): string {
  if (kind === 'low_intent') {
    return (
      `lead_intake_sessions?select=${SELECT}` +
      `&opened_at=is.null&low_intent_alert_at=is.null` +
      `&completed_at=is.null&declined_at=is.null` +
      `&created_at=lt.${cutoff}&limit=${CHASE_PAGE + 1}`
    );
  }
  return (
    `lead_intake_sessions?select=${SELECT}` +
    `&opened_at=not.is.null&completed_at=is.null&declined_at=is.null` +
    `&abandoned_alert_at=is.null&updated_at=lt.${cutoff}&limit=${CHASE_PAGE + 1}`
  );
}

/**
 * Split the over-fetched row off. A backlog reported as `found: 25` reads
 * exactly like a fully drained run, which is the failure AC8 exists to stop.
 */
export function paginate<T>(rows: T[]): { candidates: T[]; truncated: boolean } {
  return rows.length > CHASE_PAGE
    ? { candidates: rows.slice(0, CHASE_PAGE), truncated: true }
    : { candidates: rows, truncated: false };
}

/* ── claiming, sending, releasing ─────────────────────────────────────────── */

export interface ChaseDeps {
  /** A PATCH that resolves to the rows it actually affected. */
  patch: (path: string, body: Record<string, unknown>) => Promise<unknown>;
  send: (text: string) => Promise<TelegramOutcome>;
  recordRouting: (args: {
    leadId: string | null;
    score: number;
    bucket: 'hot' | 'cold';
    signals: string[];
    routedTo: string;
    reason: string;
  }) => Promise<boolean>;
}

export interface ChaseResult {
  /** `skipped` is another run holding the stamp, which is not a failure. */
  outcome: 'sent' | 'skipped' | 'failed';
  /** null when no routing decision was due, so it cannot read as a failure. */
  routingRecorded: boolean | null;
}

/**
 * Chase one candidate: claim the stamp, send, and release the claim if the send
 * failed.
 *
 * The claim must be PROVEN, not assumed. The filter only matches a session
 * nobody has stamped, so the affected rows are what tell this run whether it
 * won the race - a PATCH that reports nothing back cannot, and two overlapping
 * runs would both alert on the same lead.
 */
export async function chaseOne(
  kind: ChaseKind,
  c: ChaseCandidate,
  now: Date,
  deps: ChaseDeps,
): Promise<ChaseResult> {
  const stamp = CHASE_STAMP[kind];
  const stampedAt = now.toISOString();

  let claimed: unknown;
  try {
    claimed = await deps.patch(`lead_intake_sessions?id=eq.${c.id}&${stamp}=is.null`, {
      [stamp]: stampedAt,
    });
  } catch (err) {
    console.error(`[intake-chase] could not claim ${c.id}:`, err);
    return { outcome: 'failed', routingRecorded: null };
  }

  if (!Array.isArray(claimed)) {
    // Cannot tell a won race from a lost one. Not sending is the safe half, and
    // the stamp is left alone because clearing one this run may not have set
    // would hand the same lead to a second alert.
    console.error(`[intake-chase] claim on ${c.id} returned no rows to check - not sending`);
    return { outcome: 'failed', routingRecorded: null };
  }
  if (claimed.length === 0) {
    return { outcome: 'skipped', routingRecorded: null };
  }

  const outcome = await deps.send(chaseMessage(kind, c, now));

  if (outcome !== 'sent') {
    // Release the claim so the next run retries. A stamp left behind on a
    // failed send is a lead nobody is ever told about. Scoped to the exact
    // value this run wrote, so it can never clear somebody else's stamp.
    try {
      await deps.patch(
        `lead_intake_sessions?id=eq.${c.id}&${stamp}=eq.${encodeURIComponent(stampedAt)}`,
        { [stamp]: null },
      );
    } catch (err) {
      console.error(`[intake-chase] could not release the claim on ${c.id}:`, err);
    }
    return { outcome: 'failed', routingRecorded: null };
  }

  // WEB-01B: non-engagement recorded as a signal on the lead, not inferred
  // later from an absence.
  if (kind !== 'low_intent' || !c.lead_id) return { outcome: 'sent', routingRecorded: null };

  const d = lowIntentDecision();
  const routingRecorded = await deps.recordRouting({
    leadId: c.lead_id,
    score: 0,
    bucket: d.bucket,
    signals: ['Never opened the intake link'],
    routedTo: d.routedTo,
    reason: d.reason,
  });
  return { outcome: 'sent', routingRecorded };
}
