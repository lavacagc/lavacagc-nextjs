/** Northern-NJ season from a date. Pure + testable. */
export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export function currentSeason(date: Date = new Date()): Season {
  const m = date.getUTCMonth(); // 0=Jan
  if (m <= 1 || m === 11) return 'winter'; // Dec, Jan, Feb
  if (m <= 4) return 'spring'; // Mar–May
  if (m <= 7) return 'summer'; // Jun–Aug
  return 'fall'; // Sep–Nov
}

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

/** The next season after the given one (for "coming up" hints). */
export function nextSeason(s: Season): Season {
  const order: Season[] = ['winter', 'spring', 'summer', 'fall'];
  return order[(order.indexOf(s) + 1) % order.length];
}

/** The season before the given one (for "catch up on what you missed"). */
export function prevSeason(s: Season): Season {
  const order: Season[] = ['winter', 'spring', 'summer', 'fall'];
  return order[(order.indexOf(s) + 3) % order.length];
}

/**
 * UTC start of the season containing `date`. Used to tell members who signed
 * up in a previous season (catch-up applies) from brand-new ones (it doesn't).
 */
export function seasonStart(date: Date = new Date()): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  if (m === 11) return new Date(Date.UTC(y, 11, 1)); // Dec → winter starts this Dec
  if (m <= 1) return new Date(Date.UTC(y - 1, 11, 1)); // Jan/Feb → winter started last Dec
  if (m <= 4) return new Date(Date.UTC(y, 2, 1)); // spring: Mar 1
  if (m <= 7) return new Date(Date.UTC(y, 5, 1)); // summer: Jun 1
  return new Date(Date.UTC(y, 8, 1)); // fall: Sep 1
}
