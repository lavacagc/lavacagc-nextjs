/**
 * /proposal/<token> - the client's own proposal (WEB-021 to WEB-025).
 *
 * The only part of the proposal pod a client ever touches. The token IS the
 * authorisation, which is why this page is noindex and why all three proposal
 * tables are RLS-on with no policies: the publishable key ships in the browser
 * bundle, so an unprotected table would hand every token to anyone who opened
 * devtools.
 *
 * THREE STATES, kept distinct (the same posture as the tokenized intake page):
 * a proposal we found, a link that is genuinely not ours - or revoked, which
 * gets the identical answer so nobody can test a token - and a database we
 * could not reach. Telling somebody their link is dead when Supabase merely
 * timed out sends them away for good, and this one is holding prices they were
 * invited to answer.
 *
 * A DRAFT RESOLVES (owner decision, 5 Aug 2026). Copy link is offered on a
 * draft in the admin roster, so the link has to open - it is how the estimate
 * is proof-read from the client's side before Send. Only `revoked` dead-ends.
 */
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cleanEnv } from '@/lib/envClean';
import { checkRateLimit, clientIpFromHeaders } from '@/lib/rateLimit';
import { lookupPublicProposal } from '@/lib/proposals/publicView';
import ProposalView from './ProposalView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // No client name, no project: a browser tab and a history entry are read by
  // whoever is looking over their shoulder.
  title: 'Your proposal | La Vaca General Contractors',
  robots: { index: false, follow: false },
};

/**
 * Generous, and charged only on FAILURE.
 *
 * The token is 32 random bytes, so guessing was never the realistic threat, and
 * whole streets share one carrier NAT: charging successful views would throttle
 * a family opening their own proposal twice onto the very error page this
 * limiter exists to keep them off. Failures are what a scanner produces, and
 * they are what this counts.
 */
const RATE_LIMIT_MAX = 40;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function Shell({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background-soft px-5 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-card">
        <h1 className="text-xl font-extrabold leading-tight text-text-primary">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">{body}</p>
        <a
          href="tel:2012124917"
          className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-[1px]"
        >
          Call us on (201) 212-4917
        </a>
      </div>
    </main>
  );
}

export default async function ProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const bucket = `proposal-view:${clientIpFromHeaders(await headers())}`;
  const peek = await checkRateLimit(bucket, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, { consume: false });
  if (!peek.allowed) {
    return (
      <Shell
        title="Give us a moment"
        body="This page has been asked for a lot in the last few minutes. Wait a minute and refresh, or call the office and we will read it to you."
      />
    );
  }

  const found = await lookupPublicProposal(token);

  if (found.state === 'unreadable') {
    return (
      <Shell
        title="We couldn't load your proposal"
        body="Something went wrong at our end, not yours. Your link is probably fine - refreshing in a minute usually fixes it. If it doesn't, call the office and we will walk you through it."
      />
    );
  }

  if (found.state === 'missing') {
    // Only failures are charged, so a real client's visit never spends the
    // budget that exists to slow a scanner walking the route.
    await checkRateLimit(bucket, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    return (
      <Shell
        title="This link isn't valid"
        body="It may have been mistyped, or it belongs to a different project. If you have already spoken to us, you are in our system and we will be in touch."
      />
    );
  }

  return (
    <ProposalView
      token={token}
      proposal={found.proposal}
      bookingUrl={cleanEnv(process.env.NEXT_PUBLIC_BOOKING_URL) || null}
    />
  );
}
