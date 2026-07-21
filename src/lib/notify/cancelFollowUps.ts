/**
 * Stop a lead's remaining follow-up emails.
 *
 * The lead nurture drip lives in `follow_up_queue`. When an estimate is accepted
 * (the owner marks the lead "Converted") we cancel that lead's still-PENDING
 * follow-ups so a won customer stops getting nudged. Already-sent mail can't be
 * recalled, so only 'pending' rows are touched.
 *
 * The queue is keyed on the raw submitted email, which is NOT normalized on
 * write, so we match case-insensitively. The ilike prefilter alone is not safe:
 * PostgREST treats `*` as an alias for `%` (with no way to escape it), and the
 * lead-email validator accepts `*`, so an address like `a*@example.com` would
 * over-match unrelated leads. We therefore SELECT candidate rows with an escaped
 * ilike prefilter and then keep only rows whose `lead_email` is an EXACT
 * case-insensitive match in JS - that equality check is immune to any wildcard,
 * so a literal `*`, `%`, `_`, or `\` in the address can never over-match.
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
 * actually mean so one sequence is never cancelled by touching the other.
 *
 * The email match is EXACT case-insensitive: an escaped ilike prefilter narrows
 * the candidate rows, then a JS equality check keeps only the true matches so a
 * wildcard character in the stored address can never over-match another lead.
 *
 * The UPDATE re-asserts `status = 'pending'` so a row the send-follow-ups cron
 * flips pending -> sent between our SELECT and UPDATE is left alone rather than
 * clobbered back to 'cancelled'. Returns the number of rows actually stopped,
 * which may be fewer than the selected candidates when such a race occurs.
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
    .select('id, lead_email')
    .eq('status', 'pending')
    .in('follow_up_type', types)
    .ilike('lead_email', escapeLikePattern(target));

  if (error) throw error;

  const wanted = target.toLowerCase();
  const ids = (Array.isArray(data) ? data : [])
    .filter((row: any) => (row?.lead_email ?? '').trim().toLowerCase() === wanted)
    .map((row: any) => row.id);
  if (ids.length === 0) return 0;

  const { data: updated, error: updateError } = await client
    .from('follow_up_queue')
    .update({ status: 'cancelled' })
    .eq('status', 'pending')
    .in('id', ids)
    .select('id');

  if (updateError) throw updateError;
  return Array.isArray(updated) ? updated.length : 0;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
