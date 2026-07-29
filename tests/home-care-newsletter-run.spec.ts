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
 * One run's accounting, mirroring the cron loop exactly: classify once from the
 * recipient's state, let a live send's verdict CORRECT that classification, and
 * record once. The only difference between the two modes is whether mail is
 * attempted at all.
 */
function runBuckets(recipients: Recipient[], opts: { dryRun: boolean }) {
  const tally = createOutcomeTally();
  for (const r of recipients) {
    let outcome = classifyRecipient(r.state);
    if (!opts.dryRun && outcome === 'would_send') outcome = reconcileWithSend(outcome, r.verdict);
    tally.record(outcome, r.state);
  }
  return tally.counts();
}

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
  // And a bucket that never involved a send is not reachable from here.
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
