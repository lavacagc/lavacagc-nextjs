/**
 * Shared formatter for "best time to contact" used by both Telegram and
 * email notification templates, plus the admin dashboard where we want to
 * show callers "available right now."
 *
 * Kept in src/lib/notify/ because its consumers all live in or around the
 * notification pipeline.
 */

export type ContactTimePreference =
  | 'anytime'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'weekends'
  | 'specific'
  | null
  | undefined;

const LABELS: Record<string, string> = {
  anytime: 'Anytime',
  morning: 'Mornings (8am–12pm)',
  afternoon: 'Afternoons (12pm–5pm)',
  evening: 'Evenings (5pm–8pm)',
  weekends: 'Weekends',
  specific: 'Specific time',
};

const SHORT_LABELS: Record<string, string> = {
  anytime: 'anytime',
  morning: 'mornings',
  afternoon: 'afternoons',
  evening: 'evenings',
  weekends: 'weekends',
  specific: 'specific time',
};

/** Human-readable label, e.g. "Evenings (5pm–8pm)". Returns empty string if unset. */
export function formatContactTime(pref: ContactTimePreference): string {
  if (!pref) return '';
  return LABELS[pref] ?? '';
}

/** Compact label for subject lines, e.g. "evenings". */
export function formatContactTimeShort(pref: ContactTimePreference): string {
  if (!pref || pref === 'anytime') return '';
  return SHORT_LABELS[pref] ?? '';
}

/**
 * Flags a tz mismatch in the Telegram message so the owner isn't calling a
 * "morning" window that's actually 6am local to the lead. Compares only the
 * offset bucket, not the exact zone — "America/New_York" vs
 * "America/Detroit" are both fine.
 */
export function isTimezoneMismatch(
  contactTimezone: string | null | undefined,
  ownerTimezone = 'America/New_York',
): boolean {
  if (!contactTimezone) return false;
  if (contactTimezone === ownerTimezone) return false;
  try {
    const now = new Date();
    const offsetFor = (tz: string) => {
      // Use the formatter's resolved offset in minutes.
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        hour12: false,
      });
      const parts = dtf.formatToParts(now);
      const hour = parts.find((p) => p.type === 'hour')?.value ?? '0';
      return parseInt(hour, 10);
    };
    return offsetFor(contactTimezone) !== offsetFor(ownerTimezone);
  } catch {
    return false;
  }
}
