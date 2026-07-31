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
  const found = await lookupByToken(token).catch(() => null);

  if (!found) {
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

  const { assignment, dispatch, visit } = found;

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

  // The visit itself is gone - cancelled, or closed out - even though the
  // dispatch email is still sitting in their inbox. Say so rather than let
  // someone confirm a job nobody is attending.
  if (!visit?.stillBooked) {
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
