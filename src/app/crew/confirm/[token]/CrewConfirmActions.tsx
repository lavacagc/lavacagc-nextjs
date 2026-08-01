'use client';

/**
 * The two buttons on the crew confirm page.
 *
 * Both POST. Nothing here happens on load - see the note in page.tsx about mail
 * scanners fetching every link in an inbox.
 *
 * "Something is wrong" opens a note field rather than submitting immediately.
 * The whole value of that button is what they type into it: "sub cancelled",
 * "customer moved it", "van is in the shop" are three different problems and
 * "flagged" alone tells the office none of them.
 */
import { useState } from 'react';

type Status = 'sent' | 'confirmed' | 'flagged';

/**
 * Whether the office was actually TOLD about the flag on this row.
 *
 * There is no third value, and deliberately so. Anything short of a recorded
 * delivery - Telegram down, no chat configured, a page re-opened on a flag
 * whose alert never landed, an unrecognised answer from an older deploy - means
 * nobody has read it, and the person standing at the house is the only one in a
 * position to close that gap. None of those may render as "the office has it":
 * when a colleague has already confirmed, both the 5pm and 6pm chases stay
 * quiet, so there may be no later message about this visit at all.
 *
 * On load it comes from `notified_at` on the assignment - the stamp the route
 * writes only for a Telegram that genuinely sent - so re-opening the link says
 * the same thing the tap did rather than the opposite.
 */
export type FlagAlert = 'reached' | 'unreached';

export default function CrewConfirmActions({
  token,
  initialStatus,
  initialFlagAlert,
  subName,
}: {
  token: string;
  initialStatus: Status;
  initialFlagAlert: FlagAlert;
  subName: string | null;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [flagAlert, setFlagAlert] = useState<FlagAlert>(initialFlagAlert);
  const [busy, setBusy] = useState<null | 'confirm' | 'flag'>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (action: 'confirm' | 'flag') => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch('/api/crew/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, ...(action === 'flag' ? { note } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save that');
      if (action === 'flag') {
        // 'duplicate' now means a previous alert for this exact note is
        // recorded as DELIVERED - the route checks the stamp, not the flag - so
        // it is the one other answer that earns "the office has it".
        setFlagAlert(data.notified === 'sent' || data.notified === 'duplicate' ? 'reached' : 'unreached');
      }
      setStatus(action === 'confirm' ? 'confirmed' : 'flagged');
      setShowNote(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that. Call the office.');
    } finally {
      setBusy(null);
    }
  };

  if (status === 'confirmed') {
    return (
      <p
        data-testid="crew-confirmed"
        className="mt-6 rounded-xl bg-[#F0FDF4] px-4 py-3 text-sm font-medium text-[#166534]"
      >
        Confirmed. Nothing else to do - you will get a reminder at 7:00am to text the customer
        when you are on the way.
      </p>
    );
  }

  if (status === 'flagged') {
    return flagAlert === 'unreached' ? (
      <p
        data-testid="crew-flag-unreached"
        className="mt-6 rounded-xl bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-[#991B1B]"
      >
        Flagged - but we could NOT get the alert through to the office. What you typed is written
        down, and nobody has been told it. Please call{' '}
        <a className="font-bold underline" href="tel:2012124917">(201) 212-4917</a> now - the
        customer is still told tonight that we are coming.
      </p>
    ) : (
      <p
        data-testid="crew-flagged"
        className="mt-6 rounded-xl bg-[#FFFBEB] px-4 py-3 text-sm font-medium text-[#92400E]"
      >
        Flagged. The office has it. If it is urgent, call (201) 212-4917 as well - the customer is
        still told tonight that we are coming.
      </p>
    );
  }

  return (
    <div className="mt-6">
      {!showNote ? (
        <>
          <button
            type="button"
            data-testid="crew-confirm"
            onClick={() => submit('confirm')}
            disabled={busy !== null}
            className="w-full rounded-xl bg-[#EE9639] px-6 py-4 text-base font-bold text-white disabled:opacity-60"
          >
            {busy === 'confirm' ? 'Saving...' : subName ? 'Confirm - sub is booked' : 'Confirm - I am on this'}
          </button>
          <button
            type="button"
            data-testid="crew-flag-open"
            onClick={() => setShowNote(true)}
            disabled={busy !== null}
            className="mt-2 w-full rounded-xl border border-[#E2E8F0] px-6 py-3.5 text-base font-bold text-[#1A1A1A] disabled:opacity-60"
          >
            Something is wrong
          </button>
        </>
      ) : (
        <>
          <label htmlFor="crew-note" className="text-sm font-bold text-[#1A1A1A]">
            What is wrong?
          </label>
          <textarea
            id="crew-note"
            data-testid="crew-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Sub cancelled, customer wants to move it, ..."
            className="mt-2 w-full rounded-xl border border-[#E2E8F0] p-3 text-sm text-[#1A1A1A]"
          />
          <button
            type="button"
            data-testid="crew-flag"
            onClick={() => submit('flag')}
            disabled={busy !== null}
            className="mt-2 w-full rounded-xl bg-[#002855] px-6 py-4 text-base font-bold text-white disabled:opacity-60"
          >
            {busy === 'flag' ? 'Sending...' : 'Send to the office'}
          </button>
          <button
            type="button"
            onClick={() => setShowNote(false)}
            disabled={busy !== null}
            className="mt-2 w-full px-6 py-2 text-sm font-medium text-[#666] underline"
          >
            Back
          </button>
        </>
      )}
      {error ? <p className="mt-3 text-sm font-medium text-[#B42318]">{error}</p> : null}
    </div>
  );
}
