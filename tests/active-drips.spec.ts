import { test, expect } from '@playwright/test';
import {
  buildActiveDrips,
  sequenceOf,
  whenRelative,
  type FollowUpRow,
} from '../src/lib/followups/activeDrips';

/**
 * Unit tests for the person-centric "active drips" view. Pure logic — no
 * browser, DB, or network — runs in CI under the Playwright runner.
 *
 * The load-bearing guarantee: `follow_up_queue` is shared between the lead
 * nurture drip and post-job review requests for the SAME email, so one person
 * can appear on two distinct drips. buildActiveDrips must keep them separate,
 * group only still-pending rows, and surface the soonest-scheduled email as the
 * "next" of each drip.
 */

function row(overrides: Partial<FollowUpRow>): FollowUpRow {
  return {
    id: 'id',
    lead_email: 'a@example.com',
    lead_name: 'A',
    follow_up_type: '24h',
    scheduled_at: '2026-01-01T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

test.describe('buildActiveDrips', () => {
  test('groups pending rows by person + sequence, soonest first', () => {
    const rows: FollowUpRow[] = [
      row({ id: '1', lead_email: 'bob@example.com', lead_name: 'Bob', follow_up_type: '24h', scheduled_at: '2026-02-10T10:00:00.000Z' }),
      row({ id: '2', lead_email: 'bob@example.com', lead_name: 'Bob', follow_up_type: '48h', scheduled_at: '2026-02-09T10:00:00.000Z' }),
      row({ id: '3', lead_email: 'amy@example.com', lead_name: 'Amy', follow_up_type: 'instant_ack', scheduled_at: '2026-02-08T10:00:00.000Z' }),
    ];

    const drips = buildActiveDrips(rows);

    expect(drips.map((d) => d.email)).toEqual(['amy@example.com', 'bob@example.com']);

    const bob = drips.find((d) => d.email === 'bob@example.com')!;
    expect(bob.sequence).toBe('nurture');
    expect(bob.pendingCount).toBe(2);
    // soonest pending row drives next{Type,At}
    expect(bob.nextType).toBe('48h');
    expect(bob.nextAt).toBe('2026-02-09T10:00:00.000Z');
    expect(bob.key).toBe('bob@example.com|nurture');
  });

  test('excludes people whose rows are all sent / non-pending', () => {
    const rows: FollowUpRow[] = [
      row({ id: '1', lead_email: 'sent@example.com', status: 'sent' }),
      row({ id: '2', lead_email: 'cancelled@example.com', status: 'cancelled' }),
      row({ id: '3', lead_email: 'live@example.com', status: 'pending' }),
    ];

    const drips = buildActiveDrips(rows);

    expect(drips.map((d) => d.email)).toEqual(['live@example.com']);
  });

  test('keeps nurture and review as separate drips for the same email', () => {
    const rows: FollowUpRow[] = [
      row({ id: '1', lead_email: 'repeat@example.com', follow_up_type: '24h', scheduled_at: '2026-03-02T00:00:00.000Z' }),
      row({ id: '2', lead_email: 'repeat@example.com', follow_up_type: 'feedback_day0', scheduled_at: '2026-03-01T00:00:00.000Z' }),
    ];

    const drips = buildActiveDrips(rows);

    expect(drips.length).toBe(2);
    // review is scheduled sooner, so it sorts first
    expect(drips.map((d) => d.sequence)).toEqual(['review', 'nurture']);
    expect(drips.map((d) => d.key)).toEqual([
      'repeat@example.com|review',
      'repeat@example.com|nurture',
    ]);
  });

  test('groups case-insensitively on email but preserves displayed case', () => {
    const rows: FollowUpRow[] = [
      row({ id: '1', lead_email: 'Casey@Example.com', lead_name: 'Casey', follow_up_type: '48h', scheduled_at: '2026-04-02T00:00:00.000Z' }),
      row({ id: '2', lead_email: 'casey@example.com', lead_name: 'Casey', follow_up_type: '24h', scheduled_at: '2026-04-01T00:00:00.000Z' }),
    ];

    const drips = buildActiveDrips(rows);

    expect(drips.length).toBe(1);
    expect(drips[0].pendingCount).toBe(2);
    // soonest pending row is the lowercase one, so that original case shows
    expect(drips[0].email).toBe('casey@example.com');
    expect(drips[0].nextType).toBe('24h');
  });
});

test.describe('sequenceOf', () => {
  test('maps feedback_* types to review', () => {
    expect(sequenceOf('feedback_day0')).toBe('review');
    expect(sequenceOf('feedback_day3')).toBe('review');
    expect(sequenceOf('feedback_day7')).toBe('review');
  });

  test('maps nurture types and unknowns to nurture', () => {
    expect(sequenceOf('instant_ack')).toBe('nurture');
    expect(sequenceOf('24h')).toBe('nurture');
    expect(sequenceOf('48h')).toBe('nurture');
    expect(sequenceOf('7d')).toBe('nurture');
    expect(sequenceOf('something_new')).toBe('nurture');
  });
});

test.describe('whenRelative', () => {
  const now = new Date('2026-05-01T12:00:00.000Z').getTime();

  test('past or equal time is due now', () => {
    expect(whenRelative('2026-05-01T11:00:00.000Z', now)).toBe('due now');
    expect(whenRelative('2026-05-01T12:00:00.000Z', now)).toBe('due now');
  });

  test('under an hour reports minutes', () => {
    expect(whenRelative('2026-05-01T12:30:00.000Z', now)).toBe('in ~30 min');
  });

  test('under a day reports hours with pluralization', () => {
    expect(whenRelative('2026-05-01T13:00:00.000Z', now)).toBe('in ~1 hr');
    expect(whenRelative('2026-05-01T17:00:00.000Z', now)).toBe('in ~5 hrs');
  });

  test('exactly the next day is tomorrow', () => {
    expect(whenRelative('2026-05-02T12:00:00.000Z', now)).toBe('tomorrow');
  });

  test('further out reports days', () => {
    expect(whenRelative('2026-05-04T12:00:00.000Z', now)).toBe('in ~3 days');
  });

  test('invalid ISO returns empty string', () => {
    expect(whenRelative('not-a-date', now)).toBe('');
  });
});
