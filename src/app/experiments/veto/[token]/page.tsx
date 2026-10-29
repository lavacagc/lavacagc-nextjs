/**
 * /experiments/veto/<token> - the page the Telegram veto link opens.
 *
 * READ ONLY on GET: link previews (Telegram's own included) fetch every URL in
 * a message, so loading this page never vetoes anything. It names the
 * experiment, the winner waiting to be promoted and when, and has one button
 * that POSTs to /api/experiments/veto. noindex, no referrer, and excluded from
 * analytics (the token is the credential).
 */
import type { Metadata } from 'next';
import { lookupVeto } from '@/lib/experiments/vetoLookup.server';
import { runLabel } from '@/lib/experiments/schedule';
import VetoButton from './VetoButton';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Veto experiment promotion',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

type PageProps = { params: Promise<{ token: string }> };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="min-h-screen bg-[#EFEBE6] px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-md rounded-xl bg-white p-5 shadow-sm sm:p-8">
        <p className="mb-4 text-sm font-bold text-[#1A1A1A]">
          La Vaca <span className="font-normal text-[#666]">Experiments</span>
        </p>
        {children}
      </div>
    </main>
  );
}

export default async function VetoPage({ params }: PageProps) {
  const { token } = await params;
  const found = await lookupVeto(token).catch(() => ({ ok: false as const, reason: 'invalid' as const }));

  if (found.ok === false) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-[#1A1A1A]" data-testid="veto-dead">
          {found.reason === 'not_pending' ? 'Nothing to veto' : 'This link is not valid'}
        </h1>
        <p className="mt-2 text-sm text-[#555]">
          {found.reason === 'not_pending'
            ? 'This promotion is no longer waiting: it was already promoted, vetoed or concluded. The admin Experiments tab shows what happened.'
            : 'The link is wrong or has expired. The admin Experiments tab can veto or retire any experiment.'}
        </p>
      </Shell>
    );
  }

  const { row, winnerKey, promoteAt } = found;
  const label = (key: string) => row.variants.find((v) => v.key === key)?.label ?? key;
  return (
    <Shell>
      <h1 className="text-xl font-bold text-[#1A1A1A]">Veto this promotion?</h1>
      <dl className="mt-4 divide-y divide-[#eee] text-sm text-[#333]" data-testid="veto-summary">
        <div className="flex gap-3 py-2.5"><dt className="w-28 shrink-0 font-bold text-[#666]">Experiment</dt><dd>{row.key}</dd></div>
        <div className="flex gap-3 py-2.5"><dt className="w-28 shrink-0 font-bold text-[#666]">Page</dt><dd>{row.page} ({row.element})</dd></div>
        <div className="flex gap-3 py-2.5"><dt className="w-28 shrink-0 font-bold text-[#666]">Winner</dt><dd>{winnerKey}: {label(winnerKey)}</dd></div>
        <div className="flex gap-3 py-2.5"><dt className="w-28 shrink-0 font-bold text-[#666]">Control</dt><dd>{row.control_key}: {label(row.control_key)}</dd></div>
        <div className="flex gap-3 py-2.5"><dt className="w-28 shrink-0 font-bold text-[#666]">Promotes</dt><dd>{promoteAt ? `the daily run on ${runLabel(promoteAt)}` : 'not scheduled: the veto message has not been delivered yet'}</dd></div>
      </dl>
      <p className="mt-4 text-sm text-[#555]">Vetoing keeps the control on the page and ends the experiment.</p>
      <VetoButton token={token} />
    </Shell>
  );
}
