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

/**
 * How long each stage waits before a session counts as quiet.
 *
 * Lives here, with the query and the claim that both apply it, so the window a
 * candidate was selected by and the window its claim re-checks cannot drift.
 */
export const CHASE_AFTER_HOURS: Record<ChaseKind, number> = {
  /** Long enough that a lead who is simply busy is not chased mid-afternoon. */
  low_intent: 6,
  /** Measured from the last answer, not from the open. See `conditions`. */
  abandoned: 4,
};

/**
 * How old a candidate may be before chasing it stops being worth doing.
 *
 * Three days, because past that the lead has either called or gone, and
 * "Submitted 700 hours ago, link never opened - worth one manual follow-up" is
 * advice the owner cannot act on. It is also not a hypothetical backlog: a send
 * that does not succeed releases its claim so the next run retries, so any
 * sustained outage - or an environment with no Telegram credentials at all -
 * accumulates candidates indefinitely, and they would arrive 25 a run on
 * recovery. A channel that delivers stale noise is a channel that gets ignored.
 */
export const CHASE_MAX_AGE_HOURS = 72;

export function chaseCutoff(kind: ChaseKind, now: Date): string {
  return new Date(now.getTime() - CHASE_AFTER_HOURS[kind] * 3_600_000).toISOString();
}

/**
 * The timestamp a stage measures its candidate by - the same one `conditions`
 * selects on, so the age judged here cannot mean something else than the age
 * that put the row on the list.
 */
export function chaseClock(kind: ChaseKind, c: ChaseCandidate): string {
  return kind === 'low_intent' ? c.created_at : (c.updated_at ?? c.created_at);
}

/**
 * Too old to be worth a message. An unparseable timestamp reads as 0 hours via
 * `hoursSince`, so it is chased normally rather than silently retired: dropping
 * a lead on the strength of a bad date is the more expensive mistake.
 */
export function isPastChasing(kind: ChaseKind, c: ChaseCandidate, now: Date): boolean {
  return hoursSince(chaseClock(kind, c), now) >= CHASE_MAX_AGE_HOURS;
}

const SELECT = 'id,lead_id,first_name,project_type,answers,created_at,opened_at,updated_at';

/**
 * Everything that makes a session a candidate for a stage, as PostgREST
 * filters - written once and applied BOTH when the candidates are listed and
 * when one of them is claimed.
 *
 * Both stages guard `completed_at` and `declined_at`: `markOpened` deliberately
 * swallows its errors, so a finished session with an unwritten open stamp would
 * otherwise match the low-intent query and have its real routing decision
 * overwritten with score 0 / cold.
 *
 * The abandoned stage measures the QUIET period from `updated_at`, which every
 * answer writes - not from `opened_at`. A lead who opened the link at 16:00 and
 * answered a question at 20:55 is still mid-conversation, and telling the owner
 * they "did not finish" a minute before the completion brief arrives would make
 * both messages untrustworthy.
 */
function conditions(kind: ChaseKind, cutoff: string): string {
  const stamp = CHASE_STAMP[kind];
  if (kind === 'low_intent') {
    return (
      `&opened_at=is.null&completed_at=is.null&declined_at=is.null` +
      `&${stamp}=is.null&created_at=lt.${cutoff}`
    );
  }
  return (
    `&opened_at=not.is.null&completed_at=is.null&declined_at=is.null` +
    `&${stamp}=is.null&updated_at=lt.${cutoff}`
  );
}

/**
 * The candidate list. One row over the page size is requested so the caller can
 * tell a drained run from a truncated one.
 *
 * Oldest first, on the same clock the stage selects by. Unordered, a backlog is
 * drained in whatever order Postgres happens to produce, so a lead quiet for
 * three hours can go ahead of one quiet for three days and the dry run previews
 * three arbitrary rows rather than the three that will actually go. "The rest go
 * on the next run" only reads as a queue if it is one - and it puts the rows
 * near the age ceiling at the front, where they are retired before the page
 * fills with rows that still have time.
 */
export function candidateQuery(kind: ChaseKind, cutoff: string): string {
  const order = kind === 'low_intent' ? 'created_at.asc' : 'updated_at.asc';
  return (
    `lead_intake_sessions?select=${SELECT}${conditions(kind, cutoff)}` +
    `&order=${order}&limit=${CHASE_PAGE + 1}`
  );
}

/**
 * The claim on one candidate.
 *
 * It re-asserts the whole candidate condition, not just the unset stamp. The
 * list is read ONCE and then worked through one at a time - tens of seconds for
 * a full page, each with a Telegram send - so by the time a row is reached its
 * state is an assumption. The claim is the only atomic point in the run, and it
 * is where that assumption has to be paid for: a lead who opens their link
 * mid-run must not be told "never opened their intake link" and must not have a
 * real routing decision overwritten with score 0 / cold.
 */
export function claimPath(kind: ChaseKind, id: string, cutoff: string): string {
  return `lead_intake_sessions?id=eq.${encodeURIComponent(id)}${conditions(kind, cutoff)}`;
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
  }) => Promise<boolean | null>;
}

/**
 * Which half of the run broke, because the cron log shows the name and nothing
 * else. "The send failed" pointed at Telegram for a run where every claim was
 * refused by an unreachable Supabase, which is worse than reporting nothing.
 */
export type ChaseFailure = 'claim' | 'send' | 'not_configured' | 'unexpected';

export interface ChaseResult {
  /**
   * `skipped` is another run holding the stamp, or a session that stopped being
   * a candidate while this run worked through the list. Neither is a failure.
   *
   * `retired` is a candidate past `CHASE_MAX_AGE_HOURS`: claimed so it leaves
   * the queue for good, deliberately never sent.
   */
  outcome: 'sent' | 'skipped' | 'failed' | 'retired';
  /** Set only on `failed`, and names the fault rather than the stage after it. */
  failure?: ChaseFailure;
  /** null when no routing decision was due, so it cannot read as a failure. */
  routingRecorded: boolean | null;
}

/**
 * Give the stamp back, scoped to the exact value this run wrote so it can never
 * clear somebody else's claim. A stamp left behind on a lead nobody was told
 * about is a lead nobody is EVER told about: the row stops being a candidate.
 */
async function releaseClaim(
  deps: ChaseDeps,
  kind: ChaseKind,
  id: string,
  stampedAt: string,
): Promise<void> {
  const stamp = CHASE_STAMP[kind];
  try {
    await deps.patch(
      `lead_intake_sessions?id=eq.${encodeURIComponent(id)}` +
        `&${stamp}=eq.${encodeURIComponent(stampedAt)}`,
      { [stamp]: null },
    );
  } catch (err) {
    console.error(`[intake-chase] could not release the claim on ${id}:`, err);
  }
}

/**
 * Chase one candidate: claim the stamp, send, and release the claim if the send
 * failed. A candidate past the age ceiling keeps the claim and gets no send -
 * the claim is what retires it.
 *
 * The claim must be PROVEN, not assumed. The filter matches only a session that
 * is still a candidate and that nobody has stamped, so the affected rows are
 * what tell this run whether it won the race - a PATCH that reports nothing
 * back cannot, and two overlapping runs would both alert on the same lead.
 *
 * Everything between the claim and the send is inside the try that releases it.
 * The stamp is written first on purpose, so ANY throw after it - a row whose
 * `answers` came back as something the message builder cannot walk, anything
 * else nobody has thought of - would otherwise leave a claimed, unsent
 * candidate that no future run can see.
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
    claimed = await deps.patch(claimPath(kind, c.id, chaseCutoff(kind, now)), {
      [stamp]: stampedAt,
    });
  } catch (err) {
    console.error(`[intake-chase] could not claim ${c.id}:`, err);
    return { outcome: 'failed', failure: 'claim', routingRecorded: null };
  }

  if (!Array.isArray(claimed)) {
    // Cannot tell a won race from a lost one. Not sending is the safe half, and
    // the stamp is left alone because clearing one this run may not have set
    // would hand the same lead to a second alert.
    console.error(`[intake-chase] claim on ${c.id} returned no rows to check - not sending`);
    return { outcome: 'failed', failure: 'claim', routingRecorded: null };
  }
  if (claimed.length === 0) {
    // Either another run holds the stamp or the session is no longer a
    // candidate - it was opened, finished or declined since the list was read.
    // Both mean this run has nothing to say about it.
    return { outcome: 'skipped', routingRecorded: null };
  }

  // Aged out. The claim above is what retires it: the stamp is now set, so the
  // row leaves the queue for good and no future run rediscovers it - and
  // nothing is sent, because a three-week-old "they never opened their link" is
  // not something the owner can act on. Deliberately AFTER the claim, so this
  // is a proven, atomic retirement rather than an assumed one.
  if (isPastChasing(kind, c, now)) {
    console.warn(
      `[intake-chase] ${c.id} aged out at ${hoursSince(chaseClock(kind, c), now)}h ` +
        `(ceiling ${CHASE_MAX_AGE_HOURS}h) - stamped and retired, nothing sent`,
    );
    return { outcome: 'retired', routingRecorded: null };
  }

  let outcome: TelegramOutcome;
  try {
    outcome = await deps.send(chaseMessage(kind, c, now));
  } catch (err) {
    console.error(`[intake-chase] chasing ${c.id} threw after the claim:`, err);
    await releaseClaim(deps, kind, c.id, stampedAt);
    return { outcome: 'failed', failure: 'unexpected', routingRecorded: null };
  }

  if (outcome !== 'sent') {
    // Released so the next run retries. A stamp left behind on a failed send is
    // a lead nobody is ever told about.
    //
    // Missing credentials are reported apart from a refused send. Nothing was
    // delivered either way, so the claim goes back either way - but an unset
    // token is not transient, and retrying the rest of the page against it just
    // builds the backlog the age ceiling then has to retire. The caller stops
    // the run on this one, and the cron log names the configuration rather than
    // 25 Telegram failures that never happened.
    await releaseClaim(deps, kind, c.id, stampedAt);
    const failure: ChaseFailure = outcome === 'not_configured' ? 'not_configured' : 'send';
    return { outcome: 'failed', failure, routingRecorded: null };
  }

  // WEB-01B: non-engagement recorded as a signal on the lead, not inferred
  // later from an absence.
  if (kind !== 'low_intent' || !c.lead_id) return { outcome: 'sent', routingRecorded: null };

  const d = lowIntentDecision();
  const write = {
    leadId: c.lead_id,
    score: 0,
    bucket: d.bucket,
    signals: ['Never opened the intake link'],
    routedTo: d.routedTo,
    reason: d.reason,
  };

  // The alert has gone and the stamp stays set - releasing it here would send a
  // second alert, which is worse - so this session is a candidate for no future
  // run and nothing else will ever retry this write. Tried twice on the same
  // reasoning as the scoring read: these fail transiently or not at all.
  let routingRecorded: boolean | null;
  try {
    routingRecorded = await deps.recordRouting(write);
    if (routingRecorded === false) routingRecorded = await deps.recordRouting(write);
  } catch (err) {
    console.error(`[intake-chase] recording the routing for ${c.id} threw:`, err);
    routingRecorded = false;
  }
  return { outcome: 'sent', routingRecorded };
}
