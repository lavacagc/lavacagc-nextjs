/**
 * `projects.date_completed` is a DATE column (`YYYY-MM-DD`, stored as the first
 * of the month since the admin form takes a month).
 *
 * `new Date('2026-10-01')` parses a bare date as UTC midnight, which in any US
 * timezone is the evening of September 30: the public page showed every
 * project one month early. Parse at LOCAL noon instead, which no timezone
 * offset can push into another day. Every reader that displays the date goes
 * through these two helpers.
 *
 * Client- and server-safe.
 */

/** A date-only string (or a timestamp; only the first ten characters count) at local noon. */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

/** `October 2026`, or `Oct 2026` with `month: 'short'`. Empty for an empty or unparseable value. */
export function formatMonthYear(value: string | null | undefined, month: 'long' | 'short' = 'long'): string {
  if (!value || !/^\d{4}-\d{2}/.test(value)) return '';
  const date = parseDateOnly(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month });
}
