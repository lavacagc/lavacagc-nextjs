/**
 * Northern-NJ season math: season from a date, ordering, boundaries, and the
 * seasonal-reset completion cutoff. Pure + testable.
 */

/** Single source of truth for the four seasons, in display order (spring first). */
export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/** Single source of truth for season boundaries: season → UTC start month (0=Jan). Each season runs 3 months. */
const SEASON_START_MONTH: Record<Season, number> = {
  winter: 11, // Dec–Feb
  spring: 2, // Mar–May
  summer: 5, // Jun–Aug
  fall: 8, // Sep–Nov
};

export function currentSeason(date: Date = new Date()): Season {
  const m = date.getUTCMonth(); // 0=Jan
  return SEASONS.find((s) => (m - SEASON_START_MONTH[s] + 12) % 12 < 3) ?? 'winter';
}

/**
 * The season a visit for this task should be FILED under, or null when the
 * task's catalog row names no real season.
 *
 * `homeowner_maintenance` is keyed on (homeowner, task, season) and the portal
 * renders a task only in the seasons its catalog row lists, so the visit's own
 * season is not always somewhere the row can be SEEN. Gutters are
 * `['fall','spring']` and a furnace tune-up is `['fall']`, but both get booked
 * in July, which is 'summer'. Filed there the row matches no tab - no booked
 * state, no completion label - and because suppression is per season too, the
 * September newsletter still lists work La Vaca did in August as outstanding.
 *
 * So: the visit's own season wins whenever the task applies to it, and
 * otherwise the nearest season the task DOES apply to, preferring the upcoming
 * one on a tie. A gutter clean booked in July is fall prep; an A/C tune-up
 * booked in June belongs to the spring row that is still current.
 */
export function seasonForTaskVisit(visitDate: Date, taskSeasons: readonly string[]): Season | null {
  const applicable = SEASONS.filter((s) => taskSeasons.includes(s));
  if (applicable.length === 0) return null;
  const visit = currentSeason(visitDate);
  if (applicable.includes(visit)) return visit;

  const from = SEASONS.indexOf(visit);
  // [distance, 0 if upcoming / 1 if past] - lowest wins, so a season one step
  // ahead beats one step behind, and both beat the season two steps away.
  const rank = (s: Season): [number, number] => {
    const ahead = (SEASONS.indexOf(s) - from + SEASONS.length) % SEASONS.length;
    const behind = SEASONS.length - ahead;
    return [Math.min(ahead, behind), ahead <= behind ? 0 : 1];
  };
  return applicable.reduce((best, s) => {
    const [d, dir] = rank(s);
    const [bd, bdir] = rank(best);
    return d < bd || (d === bd && dir < bdir) ? s : best;
  });
}

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

/** The next season after the given one (for "coming up" hints). */
export function nextSeason(s: Season): Season {
  return SEASONS[(SEASONS.indexOf(s) + 1) % SEASONS.length];
}

/** The season before the given one (for "catch up on what you missed"). */
export function prevSeason(s: Season): Season {
  return SEASONS[(SEASONS.indexOf(s) + 3) % SEASONS.length];
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

/**
 * UTC start of the most recent occurrence of season `s` (this year's if it has
 * begun, otherwise last year's).
 */
export function mostRecentSeasonStart(s: Season, date: Date = new Date()): Date {
  const m = SEASON_START_MONTH[s];
  const candidate = new Date(Date.UTC(date.getUTCFullYear(), m, 1));
  return candidate.getTime() <= date.getTime()
    ? candidate
    : new Date(Date.UTC(date.getUTCFullYear() - 1, m, 1));
}

/**
 * UTC cutoff for the seasonal reset: a completion of season `s` counts while
 * `completed_at >= completionCutoff(s)`, then expires so the checklist starts
 * fresh each year. Applied through `isRowCurrent` (selection.ts), which the
 * checklist page and the monthly newsletter both read, so the page and the
 * email agree on when a completion expires. The cutoff is the end of the
 * occurrence BEFORE the most recent one (its start + 3 months = most recent
 * start − 9 months), not the most recent start itself: season tabs are freely
 * browsable, so checking off a task shortly before its season begins is
 * legitimate prep and must count toward the upcoming occurrence instead of
 * silently expiring on day one.
 */
export function completionCutoff(s: Season, date: Date = new Date()): Date {
  const start = mostRecentSeasonStart(s, date);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 9, 1));
}
