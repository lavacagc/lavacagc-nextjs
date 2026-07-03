/** Northern-NJ season from a date. Pure + testable. */
export type Season = 'spring' | 'summer' | 'fall' | 'winter';

/** Single source of truth for season boundaries: season → UTC start month (0=Jan). Each season runs 3 months. */
const SEASON_START_MONTH: Record<Season, number> = {
  winter: 11, // Dec–Feb
  spring: 2, // Mar–May
  summer: 5, // Jun–Aug
  fall: 8, // Sep–Nov
};

const SEASON_ORDER: Season[] = ['winter', 'spring', 'summer', 'fall'];

export function currentSeason(date: Date = new Date()): Season {
  const m = date.getUTCMonth(); // 0=Jan
  return SEASON_ORDER.find((s) => (m - SEASON_START_MONTH[s] + 12) % 12 < 3) ?? 'winter';
}

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

/** The next season after the given one (for "coming up" hints). */
export function nextSeason(s: Season): Season {
  return SEASON_ORDER[(SEASON_ORDER.indexOf(s) + 1) % SEASON_ORDER.length];
}

/** The season before the given one (for "catch up on what you missed"). */
export function prevSeason(s: Season): Season {
  return SEASON_ORDER[(SEASON_ORDER.indexOf(s) + 3) % SEASON_ORDER.length];
}

/**
 * UTC start of the season containing `date`. Used to tell members who signed
 * up in a previous season (catch-up applies) from brand-new ones (it doesn't).
 */
export function seasonStart(date: Date = new Date()): Date {
  const startMonth = SEASON_START_MONTH[currentSeason(date)];
  const y = date.getUTCFullYear() - (date.getUTCMonth() < startMonth ? 1 : 0);
  return new Date(Date.UTC(y, startMonth, 1));
}
