/**
 * The tokenized intake page (WEB-013).
 *
 * One token, one lead. The token IS the authorisation, which is why the page is
 * noindex and why `lead_intake_sessions` has RLS with no policies - the
 * publishable key ships in the browser bundle, so an unprotected table would
 * hand every token to anyone who opened devtools.
 *
 * Three distinct states, and they must stay distinct: a session we found, a
 * token that is genuinely not ours, and a database we could not reach. Telling
 * somebody their link is invalid when Supabase merely timed out sends them away
 * for good.
 */
import type { Metadata } from 'next';
import { buildStep, isTerminal } from '@/lib/intake/flow';
import { lookupByToken, markOpened } from '@/lib/intake/session';
import IntakeThread from './IntakeThread';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'A few quick details | La Vaca General Contractors',
  robots: { index: false, follow: false },
};

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

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await lookupByToken(token);

  if (found.state === 'unreadable') {
    return (
      <Shell
        title="We couldn't load your details"
        body="Something went wrong at our end, not yours. Refreshing in a minute usually fixes it - and either way, Alex or Veronica will still call you within 24 hours."
      />
    );
  }

  if (found.state === 'missing') {
    return (
      <Shell
        title="This link isn't valid"
        body="It may have been mistyped, or it belongs to a different request. If you've already reached out to us, you're in the system and we'll call you."
      />
    );
  }

  const session = found.session;
  await markOpened(session);

  const ctx = {
    firstName: session.first_name ?? '',
    projectType: session.project_type,
    town: session.answers.city ?? null,
    scope: session.answers.scope_tier ?? null,
    contactTime: session.answers.contact_time_preference ?? null,
  };

  const step = buildStep(session.current_step, ctx);

  return (
    <IntakeThread
      token={token}
      initialStep={step}
      finished={isTerminal(session.current_step)}
      firstName={session.first_name ?? ''}
    />
  );
}
