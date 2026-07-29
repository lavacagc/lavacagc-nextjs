import { test, expect } from '@playwright/test';
import {
  classifyRecipient,
  createOutcomeTally,
  reconcileWithSend,
  type NewsletterOutcome,
  type RecipientState,
  type SendVerdict,
} from '@/lib/homecare/newsletterRun';

/**
 * The invariant ?dryRun=1 is worth running for:
 *
 *   would_send + suppressed + empty_skipped === eligible, dry or live,
 *
 * and, for the same data, a dry run's buckets are the live run's buckets. It
 * did not hold. The stream opt-out was checked only on a dry run, so a live run
 * counted the same member under would_send on the way in and again under
 * suppressed on the way out: would_send=2 dry, would_send=3 live, from
 * identical data, with the total overshooting eligible by the suppressed count.
 *
 * These drive the real functions the cron drives (src/lib/homecare/newsletterRun),
 * in the same order and with the same rule about who may correct a bucket.
 */

interface Recipient {
  label: string;
  state: RecipientState;
  /** What the sender reports back. Only consulted when a send is actually attempted. */
  verdict: SendVerdict;
}

const SENT: SendVerdict = { status: 'sent' };
const UNSUBSCRIBED: SendVerdict = { status: 'skipped', reason: 'unsubscribed' };

/**
 * One run, mirroring the cron loop exactly: classify once from the recipient's
 * state, hand everyone but an empty list to the sender, let its verdict CORRECT
 * that classification, and record once. The only difference between the two
 * modes is whether the sender is called at all.
 *
 * A recipient the snapshot already flagged is NOT skipped here - it goes to the
 * sender carrying that verdict, which refuses the send itself and writes the
 * email_log row. That row is tracked as `audited` below because it is the only
 * per-recipient evidence an opt-out was honoured.
 */
function runRecipients(recipients: Recipient[], opts: { dryRun: boolean }) {
  const tally = createOutcomeTally();
  const delivered: string[] = [];
  const audited: string[] = [];
  for (const r of recipients) {
    let outcome = classifyRecipient(r.state);
    if (!opts.dryRun && outcome !== 'empty_skipped') {
      const verdict = outcome === 'suppressed' ? UNSUBSCRIBED : r.verdict;
      if (verdict.status === 'sent') delivered.push(r.label);
      if (verdict.status === 'skipped' && verdict.reason === 'unsubscribed') audited.push(r.label);
      outcome = reconcileWithSend(outcome, verdict);
    }
    tally.record(outcome, r.state);
  }
  return { counts: tally.counts(), delivered, audited };
}

const runBuckets = (recipients: Recipient[], opts: { dryRun: boolean }) =>
  runRecipients(recipients, opts).counts;

const total = (c: { would_send: number; suppressed: number; empty_skipped: number }) =>
  c.would_send + c.suppressed + c.empty_skipped;

// Every shape a real recipient can arrive in, with the sender agreeing with the
// run's opt-out snapshot - i.e. "the same fixture data" for both modes.
const FIXTURES: Recipient[] = [
  {
    label: 'a normal member with work left',
    state: { visible: 5, outstanding: 3, caughtUp: false, optedOut: false },
    verdict: SENT,
  },
  {
    label: 'a member who cleared the list by doing the work',
    state: { visible: 4, outstanding: 0, caughtUp: true, optedOut: false },
    verdict: SENT,
  },
  {
    label: 'a member nothing in the catalog applies to',
    state: { visible: 0, outstanding: 0, caughtUp: false, optedOut: false },
    verdict: SENT,
  },
  {
    label: 'a member whose list emptied through dismissals alone',
    state: { visible: 3, outstanding: 0, caughtUp: false, optedOut: false },
    verdict: SENT,
  },
  {
    label: 'a member off the home_care stream',
    state: { visible: 5, outstanding: 2, caughtUp: false, optedOut: true },
    verdict: UNSUBSCRIBED,
  },
  {
    label: 'a caught-up member who is also off the stream',
    state: { visible: 2, outstanding: 0, caughtUp: true, optedOut: true },
    verdict: UNSUBSCRIBED,
  },
  {
    label: 'a member whose send fails outright',
    state: { visible: 6, outstanding: 4, caughtUp: false, optedOut: false },
    verdict: { status: 'failed' },
  },
];

test('a dry run and a live run bucket identical data identically', () => {
  const dry = runBuckets(FIXTURES, { dryRun: true });
  const live = runBuckets(FIXTURES, { dryRun: false });
  expect(dry).toEqual(live);
  // And the shape is the one the response documents: 3 would_send (normal,
  // caught-up, failed send), 2 suppressed, 2 empty_skipped, of which one
  // would_send carries the caught-up note.
  expect(live).toEqual({ would_send: 3, suppressed: 2, empty_skipped: 2, caught_up: 1 });
});

test('the buckets sum to the number of eligible recipients, dry or live', () => {
  for (const dryRun of [true, false]) {
    const counts = runBuckets(FIXTURES, { dryRun });
    expect(total(counts), `${dryRun ? 'dry' : 'live'} run overshot eligible`).toBe(FIXTURES.length);
    // caught_up is a share OF would_send, not a fourth bucket.
    expect(counts.caught_up).toBeLessThanOrEqual(counts.would_send);
  }
});

test('an opt-out the snapshot missed moves a bucket instead of adding one', () => {
  // The live-only case: the member opted out between the run's snapshot and the
  // send, so the sender skips them. This is the exact path that used to count
  // them twice - wouldSend += 1 on the way in, suppressed += 1 on the way out.
  const stale: Recipient[] = [
    ...FIXTURES,
    {
      label: 'opted out since the snapshot was taken',
      state: { visible: 4, outstanding: 2, caughtUp: false, optedOut: false },
      verdict: UNSUBSCRIBED,
    },
    {
      label: 'caught up, and opted out since the snapshot was taken',
      state: { visible: 3, outstanding: 0, caughtUp: true, optedOut: false },
      verdict: UNSUBSCRIBED,
    },
  ];
  const dry = runBuckets(stale, { dryRun: true });
  const live = runBuckets(stale, { dryRun: false });

  // Both still account for everyone exactly once...
  expect(total(dry)).toBe(stale.length);
  expect(total(live)).toBe(stale.length);
  // ...and the live run reclassifies the two rather than double-counting them:
  // would_send drops by exactly what suppressed gains, and the caught-up share
  // follows the member out of would_send.
  expect(live.would_send).toBe(dry.would_send - 2);
  expect(live.suppressed).toBe(dry.suppressed + 2);
  expect(dry.caught_up).toBe(2);
  expect(live.caught_up).toBe(1);
});

test('an honoured opt-out is counted, never delivered, and recorded - live only', () => {
  // The regression this pins: once the opt-out snapshot classified a recipient
  // as suppressed, the route stopped calling the sender for them, so the
  // email_log row sendTrackedEmail writes for an honoured unsubscribe was never
  // written - while last_newsletter_at was still advanced. The member's row
  // then looked identical to one that was mailed, and the admin could not tell
  // "we correctly honoured an opt-out" from "the run never reached them".
  const OFF_STREAM = 'a member off the home_care stream';
  const CAUGHT_UP_OFF_STREAM = 'a caught-up member who is also off the stream';

  const live = runRecipients(FIXTURES, { dryRun: false });
  // (a) counted as suppressed - both of them, and in that bucket only.
  expect(live.counts.suppressed).toBe(2);
  // (b) never delivered to.
  expect(live.delivered).not.toContain(OFF_STREAM);
  expect(live.delivered).not.toContain(CAUGHT_UP_OFF_STREAM);
  // (c) but still on the record, one row each.
  expect(live.audited).toEqual([OFF_STREAM, CAUGHT_UP_OFF_STREAM]);

  // ...and a dry run does none of the three: same bucket, no mail, no row.
  const dry = runRecipients(FIXTURES, { dryRun: true });
  expect(dry.counts).toEqual(live.counts);
  expect(dry.delivered).toEqual([]);
  expect(dry.audited).toEqual([]);
});

test('classifyRecipient is decided by the recipient alone', () => {
  const base: RecipientState = { visible: 3, outstanding: 2, caughtUp: false, optedOut: false };
  expect(classifyRecipient(base)).toBe('would_send');
  // Cleared by doing the work -> still mailed (the caught-up note).
  expect(classifyRecipient({ ...base, outstanding: 0, caughtUp: true })).toBe('would_send');
  // Cleared by hiding it -> nothing honest to say.
  expect(classifyRecipient({ ...base, outstanding: 0 })).toBe('empty_skipped');
  // Nothing applies to the home at all.
  expect(classifyRecipient({ ...base, visible: 0, outstanding: 0 })).toBe('empty_skipped');
  // Off the stream -> suppressed, and that beats the caught-up note...
  expect(classifyRecipient({ ...base, optedOut: true })).toBe('suppressed');
  expect(classifyRecipient({ ...base, outstanding: 0, caughtUp: true, optedOut: true })).toBe('suppressed');
  // ...but not the empty list, which never reaches a send on either path.
  expect(classifyRecipient({ ...base, visible: 0, outstanding: 0, optedOut: true })).toBe('empty_skipped');
});

test('only an unsubscribe verdict may correct a classification', () => {
  expect(reconcileWithSend('would_send', UNSUBSCRIBED)).toBe('suppressed');
  // A failed or errored send is still a member we meant to mail.
  for (const verdict of [SENT, { status: 'failed' }, { status: 'error' }, { status: 'skipped', reason: 'no_api_key' }]) {
    expect(reconcileWithSend('would_send', verdict)).toBe('would_send');
  }
  // An already-suppressed recipient does reach the sender (that is what writes
  // the audit row), but it is handed the verdict rather than asked for one, so
  // the answer that comes back can only confirm the bucket it went in with.
  // empty_skipped never reaches a send on either path.
  for (const outcome of ['suppressed', 'empty_skipped'] as NewsletterOutcome[]) {
    expect(reconcileWithSend(outcome, UNSUBSCRIBED)).toBe(outcome);
  }
});

test('the tally counts each recipient once, whatever order the buckets fill in', () => {
  const tally = createOutcomeTally();
  const caughtUpState: RecipientState = { visible: 2, outstanding: 0, caughtUp: true, optedOut: false };
  const plainState: RecipientState = { visible: 2, outstanding: 1, caughtUp: false, optedOut: false };
  tally.record('would_send', caughtUpState);
  tally.record('would_send', plainState);
  tally.record('suppressed', caughtUpState);
  tally.record('empty_skipped', plainState);
  expect(tally.counts()).toEqual({ would_send: 2, suppressed: 1, empty_skipped: 1, caught_up: 1 });
  // The returned object is a snapshot - a caller cannot reach back into the
  // counters and add a second bucket to somebody.
  const snapshot = tally.counts();
  snapshot.would_send = 99;
  expect(tally.counts().would_send).toBe(2);
});
