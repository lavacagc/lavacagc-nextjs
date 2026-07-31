import { test, expect } from '@playwright/test';
import {
  escapeLikePattern,
  cancelPendingFollowUps,
  followUpSequenceTypes,
  followUpSequenceOf,
  followUpTypesForSequence,
  FOLLOW_UP_SEQUENCE_TYPES,
  LEAD_NURTURE_FOLLOW_UP_TYPES,
  REVIEW_REQUEST_FOLLOW_UP_TYPES,
  VISIT_REMINDER_FOLLOW_UP_TYPES,
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

interface StubOptions {
  // Rows the SELECT prefilter returns (before the exact-match filter in JS).
  selectData?: unknown;
  selectError?: unknown;
  updateError?: unknown;
  // Rows the UPDATE ... .select() returns. Defaults to one row per id in the
  // update's in('id', ...) filter, i.e. every targeted row was still pending.
  // Set explicitly to model the send-follow-ups race where a candidate flipped
  // pending -> sent and is therefore skipped by the status-guarded UPDATE.
  updateData?: unknown[];
}

// Stub Supabase-like client for the SELECT-then-UPDATE helper. Each `from()`
// starts a fresh recorded query; the builder is thenable so `await`-ing the
// chain resolves to a { data, error }. A chain that called update() resolves
// with the update result, otherwise with the select prefilter result.
function stubClient(opts: StubOptions) {
  const queries: RecordedQuery[] = [];
  const client = {
    from(table: string) {
      const recorded: RecordedQuery = { table, eq: [], in: [], ilike: [] };
      queries.push(recorded);
      let isUpdate = false;
      const builder: Record<string, unknown> = {
        select(columns: string) {
          recorded.select = columns;
          return builder;
        },
        update(patch: unknown) {
          recorded.update = patch;
          isUpdate = true;
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
        then(
          resolve: (value: { data: unknown; error: unknown }) => unknown,
          reject: (reason: unknown) => unknown,
        ) {
          let result: { data: unknown; error: unknown };
          if (isUpdate) {
            const idFilter = recorded.in.find(([column]) => column === 'id');
            const defaultUpdated = (idFilter?.[1] ?? []).map((id) => ({ id }));
            result = { data: opts.updateData ?? defaultUpdated, error: opts.updateError ?? null };
          } else {
            result = { data: opts.selectData ?? [], error: opts.selectError ?? null };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { client, queries };
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
    const { client, queries } = stubClient({
      selectData: [
        { id: 'a', lead_email: 'Jane.Doe@example.com' },
        { id: 'b', lead_email: 'jane.doe@example.com' },
      ],
    });

    const count = await cancelPendingFollowUps(client, 'Jane.Doe@example.com');

    expect(count).toBe(2);

    // First query: the SELECT prefilter that gathers candidate rows.
    const select = queries[0];
    expect(select.table).toBe('follow_up_queue');
    expect(select.select).toBe('id, lead_email');
    // Only still-pending rows are candidates.
    expect(select.eq).toContainEqual(['status', 'pending']);
    // Escaped, case-insensitive email prefilter.
    expect(select.ilike).toContainEqual(['lead_email', 'Jane.Doe@example.com']);
    // The in()-filter on nurture types is what spares pending review requests.
    expect(select.in).toHaveLength(1);
    const [column, types] = select.in[0];
    expect(column).toBe('follow_up_type');
    expect(types).toEqual([...LEAD_NURTURE_FOLLOW_UP_TYPES]);
    for (const feedbackType of ['feedback_day0', 'feedback_day3', 'feedback_day7']) {
      expect(types).not.toContain(feedbackType);
    }

    // Second query: the UPDATE, scoped to the exact-matched ids only.
    const update = queries[1];
    expect(update.table).toBe('follow_up_queue');
    expect(update.update).toEqual({ status: 'cancelled' });
    expect(update.in).toContainEqual(['id', ['a', 'b']]);
    // The UPDATE re-asserts status='pending' so a row the cron sent between the
    // SELECT and UPDATE is skipped rather than clobbered back to 'cancelled'.
    expect(update.eq).toContainEqual(['status', 'pending']);
  });

  test('skips a candidate the cron sent between SELECT and UPDATE, returning the truly-cancelled count', async () => {
    // Both ids are still-pending candidates at SELECT time, but the status-guarded
    // UPDATE only affects 'b' because 'a' flipped pending -> sent in the meantime.
    const { client, queries } = stubClient({
      selectData: [
        { id: 'a', lead_email: 'x@example.com' },
        { id: 'b', lead_email: 'x@example.com' },
      ],
      updateData: [{ id: 'b' }],
    });

    const count = await cancelPendingFollowUps(client, 'x@example.com');

    // Only the row that was still pending at UPDATE time is counted.
    expect(count).toBe(1);
    const update = queries[1];
    expect(update.eq).toContainEqual(['status', 'pending']);
    expect(update.in).toContainEqual(['id', ['a', 'b']]);
  });

  test('cancels only the exact address when a wildcard char makes the prefilter over-match', async () => {
    // PostgREST maps `*` to `%` in ilike, so the prefilter for 'a*@example.com'
    // also returns 'alice@example.com'. The JS exact-match must spare alice.
    const { client, queries } = stubClient({
      selectData: [
        { id: 'star', lead_email: 'a*@example.com' },
        { id: 'alice', lead_email: 'alice@example.com' },
      ],
    });

    const count = await cancelPendingFollowUps(client, 'a*@example.com');

    expect(count).toBe(1);
    // Only the exact 'a*@example.com' row is cancelled; alice@ is untouched.
    const update = queries[1];
    expect(update.update).toEqual({ status: 'cancelled' });
    expect(update.in).toContainEqual(['id', ['star']]);
  });

  test('escapes LIKE wildcards in the email prefilter so an underscore cannot over-match', async () => {
    const { client, queries } = stubClient({ selectData: [] });

    await cancelPendingFollowUps(client, 'a_b%c@example.com');

    expect(queries[0].ilike).toContainEqual(['lead_email', 'a\\_b\\%c@example.com']);
  });

  test('returns 0 and issues no UPDATE when no candidate row matches exactly', async () => {
    const { client, queries } = stubClient({ selectData: [{ id: 'x', lead_email: 'other@example.com' }] });

    const count = await cancelPendingFollowUps(client, 'x@example.com');

    expect(count).toBe(0);
    // Only the SELECT ran; no UPDATE was issued.
    expect(queries).toHaveLength(1);
    expect(queries[0].update).toBeUndefined();
  });

  test('returns the number of cancelled rows from the exact-matched candidates', async () => {
    const { client } = stubClient({
      selectData: [
        { id: '1', lead_email: 'x@example.com' },
        { id: '2', lead_email: 'X@Example.com' },
        { id: '3', lead_email: 'x@example.com' },
      ],
    });
    expect(await cancelPendingFollowUps(client, 'x@example.com')).toBe(3);
  });

  test('returns 0 without issuing a query for an empty or whitespace email', async () => {
    for (const email of ['', '   ']) {
      const { client, queries } = stubClient({ selectData: [{ id: '1', lead_email: 'x@example.com' }] });
      const count = await cancelPendingFollowUps(client, email);
      expect(count).toBe(0);
      // No query was issued.
      expect(queries).toHaveLength(0);
    }
  });

  test('propagates a SELECT error', async () => {
    const boom = new Error('supabase down');
    const { client } = stubClient({ selectError: boom });
    await expect(cancelPendingFollowUps(client, 'x@example.com')).rejects.toThrow('supabase down');
  });

  test('propagates an UPDATE error', async () => {
    const boom = new Error('update failed');
    const { client } = stubClient({
      selectData: [{ id: '1', lead_email: 'x@example.com' }],
      updateError: boom,
    });
    await expect(cancelPendingFollowUps(client, 'x@example.com')).rejects.toThrow('update failed');
  });

  test('scopes to an explicitly-passed type set (review requests) when given one', async () => {
    const { client, queries } = stubClient({ selectData: [{ id: 'r', lead_email: 'x@example.com' }] });

    const count = await cancelPendingFollowUps(client, 'x@example.com', REVIEW_REQUEST_FOLLOW_UP_TYPES);

    expect(count).toBe(1);
    const [column, types] = queries[0].in[0];
    expect(column).toBe('follow_up_type');
    expect(types).toEqual([...REVIEW_REQUEST_FOLLOW_UP_TYPES]);
    // Passing the review set must NOT cancel the nurture drip.
    for (const nurtureType of LEAD_NURTURE_FOLLOW_UP_TYPES) {
      expect(types).not.toContain(nurtureType);
    }
  });
});

test.describe('followUpSequenceTypes', () => {
  test('maps each feedback_* type to the review-request set', () => {
    for (const t of REVIEW_REQUEST_FOLLOW_UP_TYPES) {
      expect(followUpSequenceTypes(t)).toEqual(REVIEW_REQUEST_FOLLOW_UP_TYPES);
    }
  });

  test('maps nurture types (and unknown types) to the nurture set', () => {
    for (const t of [...LEAD_NURTURE_FOLLOW_UP_TYPES, 'something_else']) {
      expect(followUpSequenceTypes(t)).toEqual(LEAD_NURTURE_FOLLOW_UP_TYPES);
    }
  });

  // A third sequence now shares the queue. Falling through to the nurture set
  // made "stop this person's follow-ups" cancel the wrong thing and leave the
  // reminder standing.
  test('maps a visit reminder to its own set, not to nurture', () => {
    for (const t of VISIT_REMINDER_FOLLOW_UP_TYPES) {
      expect(followUpSequenceTypes(t)).toEqual(VISIT_REMINDER_FOLLOW_UP_TYPES);
      expect(followUpSequenceTypes(t)).not.toEqual(LEAD_NURTURE_FOLLOW_UP_TYPES);
    }
  });

  test('every sequence in the registry is reachable by name, and nothing else is', () => {
    for (const [sequence, types] of Object.entries(FOLLOW_UP_SEQUENCE_TYPES)) {
      expect(followUpTypesForSequence(sequence)).toEqual(types);
      for (const t of types) expect(followUpSequenceOf(t)).toBe(sequence);
    }
    expect(followUpTypesForSequence('made_up')).toBe(null);
  });
});
