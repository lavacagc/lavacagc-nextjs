import { test, expect } from '@playwright/test';
import {
  escapeLikePattern,
  cancelPendingFollowUps,
  LEAD_NURTURE_FOLLOW_UP_TYPES,
} from '../src/lib/notify/cancelFollowUps';

/**
 * Unit tests for the "stop the lead drip on Converted" helper. Pure logic — no
 * browser, DB, or network — runs in CI under the Playwright runner.
 *
 * The load-bearing guarantee: `follow_up_queue` is shared between the lead
 * nurture drip (instant_ack/24h/48h/7d) and post-job review requests
 * (feedback_day0/day3/day7) for the SAME email. Cancelling on "Converted" must
 * only touch the nurture drip, so a repeat customer's pending review-request
 * emails survive. We assert that by proving the update is scoped with
 * .in('follow_up_type', <nurture types>) and that the recorded list excludes
 * every feedback_* type.
 */

interface RecordedQuery {
  table?: string;
  update?: unknown;
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  ilike: Array<[string, string]>;
  select?: string;
}

// Stub Supabase-like client: records the query chain and resolves to a
// configurable { data, error }. Every builder method returns `this` so the
// helper can chain, and the builder is awaitable via then().
function stubClient(result: { data: unknown; error: unknown }) {
  const recorded: RecordedQuery = { eq: [], in: [], ilike: [] };
  const builder: Record<string, unknown> = {
    update(patch: unknown) {
      recorded.update = patch;
      return builder;
    },
    eq(column: string, value: unknown) {
      recorded.eq.push([column, value]);
      return builder;
    },
    in(column: string, values: unknown[]) {
      recorded.in.push([column, values]);
      return builder;
    },
    ilike(column: string, pattern: string) {
      recorded.ilike.push([column, pattern]);
      return builder;
    },
    select(columns: string) {
      recorded.select = columns;
      return Promise.resolve(result);
    },
  };
  const client = {
    from(table: string) {
      recorded.table = table;
      return builder;
    },
  };
  return { client, recorded };
}

test.describe('escapeLikePattern', () => {
  test('escapes underscore, percent, and backslash', () => {
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('a%b')).toBe('a\\%b');
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
    expect(escapeLikePattern('john_doe%test\\x')).toBe('john\\_doe\\%test\\\\x');
  });

  test('leaves a plain address unchanged', () => {
    expect(escapeLikePattern('jane.doe@example.com')).toBe('jane.doe@example.com');
  });
});

test.describe('cancelPendingFollowUps', () => {
  test('scopes the cancel to nurture types only, sparing feedback_* review requests', async () => {
    const { client, recorded } = stubClient({ data: [{ id: 'a' }, { id: 'b' }], error: null });

    const count = await cancelPendingFollowUps(client, 'Jane.Doe@example.com');

    expect(count).toBe(2);
    expect(recorded.table).toBe('follow_up_queue');
    expect(recorded.update).toEqual({ status: 'cancelled' });
    // Only still-pending rows are cancelled.
    expect(recorded.eq).toContainEqual(['status', 'pending']);
    // Literal, case-insensitive email match.
    expect(recorded.ilike).toContainEqual(['lead_email', 'Jane.Doe@example.com']);
    expect(recorded.select).toBe('id');

    // The in()-filter on nurture types is what spares pending review requests.
    expect(recorded.in).toHaveLength(1);
    const [column, types] = recorded.in[0];
    expect(column).toBe('follow_up_type');
    expect(types).toEqual([...LEAD_NURTURE_FOLLOW_UP_TYPES]);
    for (const feedbackType of ['feedback_day0', 'feedback_day3', 'feedback_day7']) {
      expect(types).not.toContain(feedbackType);
    }
  });

  test('escapes LIKE wildcards in the email so an underscore cannot over-match', async () => {
    const { client, recorded } = stubClient({ data: [], error: null });

    await cancelPendingFollowUps(client, 'a_b%c@example.com');

    expect(recorded.ilike).toContainEqual(['lead_email', 'a\\_b\\%c@example.com']);
  });

  test('returns the number of cancelled rows from the returned data', async () => {
    const { client } = stubClient({ data: [{ id: '1' }, { id: '2' }, { id: '3' }], error: null });
    expect(await cancelPendingFollowUps(client, 'x@example.com')).toBe(3);
  });

  test('returns 0 without issuing a query for an empty or whitespace email', async () => {
    for (const email of ['', '   ']) {
      const { client, recorded } = stubClient({ data: [{ id: '1' }], error: null });
      const count = await cancelPendingFollowUps(client, email);
      expect(count).toBe(0);
      // No query was issued.
      expect(recorded.table).toBeUndefined();
      expect(recorded.update).toBeUndefined();
      expect(recorded.eq).toHaveLength(0);
      expect(recorded.in).toHaveLength(0);
      expect(recorded.ilike).toHaveLength(0);
    }
  });

  test('propagates a client error', async () => {
    const boom = new Error('supabase down');
    const { client } = stubClient({ data: null, error: boom });
    await expect(cancelPendingFollowUps(client, 'x@example.com')).rejects.toThrow('supabase down');
  });
});
