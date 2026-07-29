/**
 * La Vaca Home Care - monthly newsletter run accounting (pure, testable).
 *
 * Every eligible recipient of a send lands in exactly ONE bucket, and `?dryRun=1`
 * is only worth running if its buckets are the buckets a real send produces.
 * They were not. The stream opt-out was checked only on a dry run, so a live run
 * counted the same member under `would_send` on the way in and again under
 * `suppressed` on the way out: two buckets for one person, and a total that
 * overshot `eligible`. Identical data reported would_send=2 dry and would_send=3
 * live - numbers that look authoritative while disagreeing, at exactly the
 * moment they are used to sanity-check a send that fires once a month.
 *
 * So the classification lives here, once, and both paths read it:
 *
 *  - `classifyRecipient` picks the bucket from the recipient's state alone.
 *    Nothing in it depends on whether mail is actually going out, which is what
 *    makes a dry run's answer the live run's answer.
 *  - `reconcileWithSend` folds in the one thing only a live run learns: the
 *    sender re-reads the preference at send time, so a member who opted out
 *    since the run's snapshot MOVES to `suppressed` rather than being added to
 *    it.
 *  - `createOutcomeTally` owns the counters, so a bucket cannot be incremented
 *    from two places again.
 *
 * The invariant all three exist to hold, dry or live:
 *
 *   would_send + suppressed + empty_skipped === eligible
 */

/** The three ways a run can end for one recipient. Mutually exclusive by construction. */
export type NewsletterOutcome = 'would_send' | 'suppressed' | 'empty_skipped';

/** What a run knows about one recipient before any mail is attempted. */
export interface RecipientState {
  /** Catalog tasks this home + life stage qualifies for this season. */
  visible: number;
  /** Of those, the ones nothing suppresses - what the email would lead with. */
  outstanding: number;
  /** They emptied the list by doing the work, not by hiding it (see isCaughtUp). */
  caughtUp: boolean;
  /** Off the home_care stream, so the sender would skip them. */
  optedOut: boolean;
}

/** A send result, narrowed to what the buckets care about. */
export interface SendVerdict {
  status: string;
  reason?: string;
}

/**
 * The bucket, from the recipient's state alone.
 *
 * An empty list is a skip either way, but for two different reasons: nothing in
 * the catalog applies to this home at all, or the list emptied without a single
 * completion (everything dismissed, booked or snoozed). Neither has an honest
 * email to write - "you've cleared everything, nice work" is untrue of work
 * somebody marked irrelevant - so they are closed out for the month instead.
 */
export function classifyRecipient(state: RecipientState): NewsletterOutcome {
  if (state.visible === 0 || (state.outstanding === 0 && !state.caughtUp)) return 'empty_skipped';
  return state.optedOut ? 'suppressed' : 'would_send';
}

/**
 * Fold a live run's send verdict into the classification.
 *
 * For a recipient the snapshot did NOT flag, the sender re-reads the preference
 * at send time, so it is both newer than the snapshot and the thing that
 * actually decided whether mail went out - it wins. (A recipient the snapshot
 * DID flag is handed to the sender as already-suppressed, so it comes back
 * unsubscribed and this changes nothing; the point of still calling it is the
 * email_log row recording the honored opt-out.)
 *
 * Either way this can only ever MOVE a recipient between buckets: the caller
 * records one outcome per recipient, after this.
 */
export function reconcileWithSend(outcome: NewsletterOutcome, verdict: SendVerdict): NewsletterOutcome {
  if (outcome === 'would_send' && verdict.status === 'skipped' && verdict.reason === 'unsubscribed') {
    return 'suppressed';
  }
  return outcome;
}

export interface OutcomeCounts {
  would_send: number;
  suppressed: number;
  empty_skipped: number;
  /** The share of would_send that gets the no-task "all caught up" note. */
  caught_up: number;
}

/**
 * One recipient in, one bucket incremented. The counters are never reachable
 * directly, which is what stops a second increment creeping back in.
 */
export function createOutcomeTally() {
  const totals: OutcomeCounts = { would_send: 0, suppressed: 0, empty_skipped: 0, caught_up: 0 };
  return {
    record(outcome: NewsletterOutcome, state: RecipientState): void {
      totals[outcome] += 1;
      if (outcome === 'would_send' && state.caughtUp) totals.caught_up += 1;
    },
    /** would_send + suppressed + empty_skipped === the number of recipients recorded. */
    counts(): OutcomeCounts {
      return { ...totals };
    },
  };
}
