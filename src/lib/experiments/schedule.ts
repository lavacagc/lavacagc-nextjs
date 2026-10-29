/**
 * When things happen (decision 005 Q15, planner fix F3 and F6). Pure.
 *
 * The cron runs DAILY at 07:30 UTC (vercel.json). Evaluation, which proposes
 * winners and retires losers, runs on the Monday run only; the promotion
 * check runs every day, so the 24 hour veto window is really about 24 hours.
 *
 * A proposal is promoted only after its veto message was DELIVERED (Telegram
 * answered `sent`). Its promotion time is the first daily run that starts at
 * least 24 hours after the delivery, less RUN_SLACK_MS for the scheduler
 * starting a run a few minutes early or late; that exact run is what the
 * message and the admin card name.
 */
export const RUN_HOUR_UTC = 7;
export const RUN_MINUTE_UTC = 30;
export const VETO_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Vercel starts a cron within a few minutes of its time; a run this early still counts as that run. */
export const RUN_SLACK_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The daily run that promotes a winner whose veto message was delivered at `deliveredAt`. */
export function promotionRunAfter(deliveredAt: Date): Date {
  const earliest = deliveredAt.getTime() + VETO_WINDOW_MS - RUN_SLACK_MS;
  const day = new Date(earliest);
  let run = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), RUN_HOUR_UTC, RUN_MINUTE_UTC);
  if (run < earliest) run += DAY_MS;
  return new Date(run);
}

/** True when a run at `now` is the promotion run (or later). */
export function isPromotionDue(now: Date, promoteAt: string | null | undefined): boolean {
  if (!promoteAt) return false;
  const at = Date.parse(promoteAt);
  return Number.isFinite(at) && now.getTime() >= at - RUN_SLACK_MS;
}

/** Evaluation (proposing winners, retiring losers) is weekly: the Monday run. */
export function isEvaluationDay(now: Date): boolean {
  return now.getUTCDay() === 1;
}

/** "Tue 3 Nov 2026, 07:30 UTC" for messages and the admin card. */
export function runLabel(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${day}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}
