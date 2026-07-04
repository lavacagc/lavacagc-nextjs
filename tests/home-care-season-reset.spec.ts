import { test, expect } from '@playwright/test';
import { completionCutoff, mostRecentSeasonStart, SEASONS } from '@/lib/homecare/season';

// Unit-style checks for the seasonal-reset boundary. The checklist page keeps
// a completion while completed_at >= completionCutoff(season, now); the cutoff
// is the predecessor occurrence's end (most recent start − 9 months), so
// pre-season check-offs count as prep for the upcoming occurrence.

const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m, d));
const counts = (season: (typeof SEASONS)[number], completedAt: Date, now: Date) =>
  completedAt.getTime() >= completionCutoff(season, now).getTime();

test.describe('Home Care: seasonal completion cutoff', () => {
  test('in-season fall completion counts until the next fall begins', () => {
    const completed = utc(2025, 9); // Oct 2025, during fall 2025
    expect(counts('fall', completed, utc(2025, 10))).toBe(true); // Nov 2025
    expect(counts('fall', completed, utc(2026, 4))).toBe(true); // May 2026
    expect(counts('fall', completed, utc(2026, 7, 31))).toBe(true); // Aug 31 2026
    expect(counts('fall', completed, utc(2026, 8))).toBe(false); // Sep 1 2026: fall resets
  });

  test('pre-season fall completion counts toward the upcoming fall', () => {
    const completed = utc(2026, 7); // Aug 2026, just before fall 2026
    expect(counts('fall', completed, utc(2026, 7, 15))).toBe(true); // still summer
    expect(counts('fall', completed, utc(2026, 8))).toBe(true); // Sep 1 2026: survives the season start
    expect(counts('fall', completed, utc(2026, 10, 30))).toBe(true); // end of fall 2026
    expect(counts('fall', completed, utc(2027, 8))).toBe(false); // fall 2027 resets it
  });

  test('summer completion expires when summer next comes around', () => {
    const completed = utc(2026, 6); // Jul 2026, during summer 2026
    expect(counts('summer', completed, utc(2027, 4))).toBe(true); // May 2027, summer not yet back
    expect(counts('summer', completed, utc(2027, 5))).toBe(false); // Jun 1 2027: cutoff passes it
  });

  test('cutoff is always 9 months before the most recent season start', () => {
    const now = utc(2026, 6, 3);
    for (const s of SEASONS) {
      const start = mostRecentSeasonStart(s, now);
      expect(completionCutoff(s, now).getTime()).toBe(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 9, 1),
      );
    }
  });
});
