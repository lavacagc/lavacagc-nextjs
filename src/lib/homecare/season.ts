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
