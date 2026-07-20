/**
 * Stop a lead's remaining follow-up emails.
 *
 * The lead nurture drip lives in `follow_up_queue`. When an estimate is accepted
 * (the owner marks the lead "Converted") we cancel that lead's still-PENDING
 * follow-ups so a won customer stops getting nudged. Already-sent mail can't be
 * recalled, so only 'pending' rows are touched.
 *
 * The queue is keyed on the raw submitted email, which is NOT normalized on
 * write, so we match case-insensitively with ilike. LIKE wildcards in the address
 * (`%`, `_`, `\`) are escaped so the match stays literal (underscores are valid
 * in email local-parts).
 *
 * `follow_up_queue` is shared: it also holds post-job review-request emails
 * (`feedback_day0`/`feedback_day3`/`feedback_day7`) for the same address. We
 * therefore scope the cancel to the lead-nurture drip types only
 * (`instant_ack`/`24h`/`48h`/`7d`) so converting an estimate lead never silently
 * kills a repeat customer's pending review solicitations.
 *
 * Takes any Supabase-like client so it works from the admin browser client today
 * and is unit-testable with a stub.
 */

/** Lead-nurture drip follow-up types created by leadFollowUp - the only rows a
 * "Converted" estimate lead should cancel. Excludes shared review-request rows. */
export const LEAD_NURTURE_FOLLOW_UP_TYPES = ['instant_ack', '24h', '48h', '7d'] as const;

/** Post-job review-request types created by feedback/create, sharing the queue. */
export const REVIEW_REQUEST_FOLLOW_UP_TYPES = ['feedback_day0', 'feedback_day3', 'feedback_day7'] as const;

/**
 * The sibling sequence a given follow_up_type belongs to. Used so a "stop this
 * person's follow-ups" action cancels the SAME sequence the row is part of
 * (nurture vs review request) instead of blindly cancelling everything for the
 * email. Unknown types fall back to the nurture set.
 */
export function followUpSequenceTypes(followUpType: string): readonly string[] {
  return (REVIEW_REQUEST_FOLLOW_UP_TYPES as readonly string[]).includes(followUpType)
    ? REVIEW_REQUEST_FOLLOW_UP_TYPES
    : LEAD_NURTURE_FOLLOW_UP_TYPES;
}

/** Escape Postgres LIKE/ILIKE wildcards so a value matches literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1');
}

/**
 * Cancel an email's still-PENDING follow-ups, scoped to a set of follow_up_types
 * (defaults to the lead-nurture drip). Because `follow_up_queue` is shared between
 * the nurture drip and post-job review requests, callers pass the type-set they
 * actually mean so one sequence is never cancelled by touching the other. Returns
 * the number of rows stopped.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function cancelPendingFollowUps(
  client: any,
  email: string,
  types: readonly string[] = LEAD_NURTURE_FOLLOW_UP_TYPES,
): Promise<number> {
  const target = (email ?? '').trim();
  if (!target) return 0;

  const { data, error } = await client
    .from('follow_up_queue')
    .update({ status: 'cancelled' })
    .eq('status', 'pending')
    .ilike('lead_email', escapeLikePattern(target))
    .in('follow_up_type', types)
    .select('id');

  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
