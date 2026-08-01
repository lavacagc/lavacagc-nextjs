/**
 * /crew/confirm/<token> - the page a crew member lands on from the dispatch
 * email.
 *
 * READ ONLY on GET. The link sits in an inbox, and mail scanners, link-preview
 * bots and security appliances fetch every URL they find there. A page that
 * confirmed on load would mark visits confirmed that nobody has looked at, and
 * the 5pm escalation would then stay silent for exactly the visits it exists to
 * catch. The buttons POST to /api/crew/confirm.
 *
 * Public, and deliberately noindex: the token is the only credential and it
 * must not end up in a search index.
 */
import type { Metadata } from 'next';
import { lookupByToken } from '@/lib/homecare/dispatch';
import { visitDateLabel, visitTimeWindow } from '@/lib/homecare/visitSchedule';
import CrewConfirmActions from './CrewConfirmActions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Confirm visit - La Vaca',
  robots: { index: false, follow: false },
};

export default async function CrewConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = await lookupByToken(token);

  // The LINK could not be read. Kept apart from the answer below, which states
  // flatly that the link is dead: a 5xx or a lost grant is not a verdict about
  // anybody's token, and telling somebody holding a good one that it is not
  // valid sends them looking through their inbox for a newer email that does
  // not exist.
  if (lookup.status === 'unavailable') {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-[#1A1A1A]">We could not check your link</h1>
        <p className="mt-2 text-sm text-[#666]">
          Something on our end is not answering, so this page cannot tell you anything about the
          visit. <strong>Your link is probably fine.</strong> Try again in a minute, or call the
          office on (201) 212-4917.
        </p>
      </Shell>
    );
  }

  // Deliberately generic, and reserved for a token that really is unknown: this
  // page is public, and an answer that told a live token from a dead one would
  // let anyone enumerate them.
  if (lookup.status === 'not_found') {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-[#1A1A1A]">This link is not valid</h1>
        <p className="mt-2 text-sm text-[#666]">
          It may have been replaced by a newer dispatch for the same visit. Check your inbox for
          the most recent one, or call the office on (201) 212-4917.
        </p>
      </Shell>
    );
  }

  const { assignment, dispatch, visit, visitRead } = lookup.found;

  // Taken off this visit - un-ticked on the picker and the window re-dispatched
  // to somebody else. Deliberately NOT the generic answer above: their calendar
  // still holds the event and its 7:00am "text the customer when the crew is on
  // the way" alarm, which is not retracted (owner decision), so this page is
  // where somebody acting on that alarm finds out the visit is not theirs -
  // before they text a customer about a job they are not going to. An unknown
  // token still gets the generic answer, so live tokens cannot be enumerated.
  if (assignment.status === 'retired') {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-[#1A1A1A]">You are no longer on this visit</h1>
        <p className="mt-2 text-sm text-[#666]">
          Somebody else has been assigned to it, so there is nothing for you to confirm and
          nothing to do - please don&apos;t text the customer about it. If it is still on your
          calendar you can delete it. Call the office on (201) 212-4917 if that is a surprise.
        </p>
      </Shell>
    );
  }

  // The visit could not be READ. Checked before the answer below and kept
  // apart from it, because a failed read is not a verdict: told "this visit is
  // off" the person who is supposed to drive to the house neither goes nor
  // confirms, and the 5pm chase then reports "nobody has confirmed" rather than
  // "we told them it was cancelled". The one honest thing to say is that we
  // could not check.
  if (visitRead === 'unavailable' || !visit) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-[#1A1A1A]">We could not check this visit</h1>
        <p className="mt-2 text-sm text-[#666]">
          Your link is fine - we just could not read the visit right now, so this page cannot tell
          you whether it is still on. <strong>Do not assume it is cancelled.</strong> Try again in a
          minute, or call the office on (201) 212-4917.
        </p>
      </Shell>
    );
  }

  // The visit itself is gone - cancelled, or closed out - even though the
  // dispatch email is still sitting in their inbox. Say so rather than let
  // someone confirm a job nobody is attending.
  if (!visit.stillBooked) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-[#1A1A1A]">This visit is no longer on the books</h1>
        <p className="mt-2 text-sm text-[#666]">
          It was cancelled or already closed out, so there is nothing to confirm. Call the office
          on (201) 212-4917 if that is a surprise.
        </p>
      </Shell>
    );
  }

  const dateLabel = visitDateLabel(visit.start);
  const window = visitTimeWindow(visit.start, visit.end);

  return (
    <Shell>
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#991B1B]">
        {assignment.status === 'sent' ? 'Action required' : 'Already answered'}
      </div>
      <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-[#1A1A1A]">
        {dateLabel}
        <br />
        <span className="text-[#EE9639]">{window}</span>
      </h1>

      <dl className="mt-5 divide-y divide-[#E2E8F0] border-y border-[#E2E8F0]">
        <Row label="Customer">
          {visit.customerName}
          {visit.customerPhone ? (
            <>
              {' · '}
              <a className="text-[#D97D1A] underline" href={`tel:${visit.customerPhone.replace(/[^\d+]/g, '')}`}>
                {visit.customerPhone}
              </a>
            </>
          ) : null}
        </Row>
        <Row label="Address">{visit.address || '-'}</Row>
        <Row label="Work">{visit.services.join(', ') || '-'}</Row>
        {dispatch.sub_name ? <Row label="Sub">{dispatch.sub_name}</Row> : null}
      </dl>

      <CrewConfirmActions
        token={token}
        initialStatus={assignment.status}
        // What the ROW says about the flag it carries, so a link re-opened
        // after a flag repeats what the tap was told rather than contradicting
        // it. Only a recorded delivery counts as reached; no stamp means
        // nobody has read it, whether it was never attempted or never landed.
        initialFlagAlert={assignment.notified_at ? 'reached' : 'unreached'}
        subName={dispatch.sub_name}
      />

      <p className="mt-6 text-xs leading-relaxed text-[#8A8A8A]">
        The customer is told at 7:30pm tonight that we are coming, whether or not this is
        confirmed. If something is wrong, flag it now.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#EFEBE6] px-4 py-10">
      <div className="mx-auto w-full max-w-md rounded-xl bg-white p-6 shadow-sm sm:p-8">{children}</div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <dt className="w-20 shrink-0 text-xs font-bold text-[#666]">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-[#1A1A1A]">{children}</dd>
    </div>
  );
}
