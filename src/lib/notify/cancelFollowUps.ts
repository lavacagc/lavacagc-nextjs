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
 * Takes any Supabase-like client so it works from the admin browser client today
 * and is unit-testable with a stub.
 */

/** Escape Postgres LIKE/ILIKE wildcards so a value matches literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function cancelPendingFollowUps(client: any, email: string): Promise<number> {
  const target = (email ?? '').trim();
  if (!target) return 0;

  const { data, error } = await client
    .from('follow_up_queue')
    .update({ status: 'cancelled' })
    .eq('status', 'pending')
    .ilike('lead_email', escapeLikePattern(target))
    .select('id');

  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
