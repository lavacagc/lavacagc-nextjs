import { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import HomeCareOptInForm from '@/components/homecare/HomeCareOptInForm';
import ChecklistPreview from '@/components/homecare/ChecklistPreview';
import { CalendarCheck, ChevronDown, ListChecks, Wrench } from 'lucide-react';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { findHomeownerById } from '@/lib/homecare/homeowners';

export const metadata: Metadata = {
  title: 'Free Seasonal Home Maintenance Plan | La Vaca Home Care',
  description:
    'Get a free, personalized seasonal home-maintenance checklist for your Northern NJ home — what to do each season, with one-tap booking when you want La Vaca to handle it. No account, no spam.',
  alternates: { canonical: 'https://www.lavacagc.com/home-care' },
  openGraph: {
    title: 'La Vaca Home Care — your free seasonal home plan',
    description: 'A simple seasonal maintenance checklist for your Northern NJ home, plus one-tap booking.',
    type: 'website',
    url: 'https://www.lavacagc.com/home-care',
  },
};

// Reading the access cookie makes this route dynamic (matches the sibling
// /home-care/setup and avoids caching the returning-member block).
export const dynamic = 'force-dynamic';

// Punchy avoidance framing under the H1 — what the checklist saves you from.
const NO_LINES = [
  'guesswork.',
  'forgotten maintenance.',
  'surprise repair bills.',
];

const STEPS = [
  { icon: ListChecks, title: 'Tell us about your home', body: 'Just your email + ZIP (and your home type, if you like). 20 seconds, no account.' },
  { icon: CalendarCheck, title: 'Get your seasonal checklist', body: 'See exactly what your house needs this season — with a quick why for each task.' },
  { icon: Wrench, title: 'DIY it — or book us', body: 'Knock out the easy ones yourself, and tap “Book La Vaca” on anything you’d rather hand off.' },
];

/**
 * What each `?error=` code tells the visitor.
 *
 * They are separated because the advice differs. Telling someone to request a
 * fresh link is actively wrong for `unavailable` - that is our signing secret or
 * our database, and a fresh link fails in exactly the same way - and wrong again
 * for `unsubscribed`, where the link worked and the account is the problem.
 */
const ACCESS_ERRORS: Record<string, string> = {
  invalid: "That link was invalid or expired. Enter your email below and we'll send a fresh one.",
  expired: "That link was invalid or expired. Enter your email below and we'll send a fresh one.",
  unavailable: "We couldn't open your plan just now - that one is on us, not your link. Please try the same link again in a few minutes.",
  error: "We couldn't open your plan just now - that one is on us, not your link. Please try the same link again in a few minutes.",
  unsubscribed: "That plan is unsubscribed, so the link no longer opens it. Re-join below and your checklist comes straight back.",
  busy: "We're seeing a lot of requests from your network right now. Please try the same link again in a few minutes.",
};
const ACCESS_ERROR_FALLBACK = ACCESS_ERRORS.invalid;

/**
 * `?error=` is whatever the visitor typed, so it is matched against the codes we
 * actually defined rather than indexed straight into the map. A plain lookup
 * resolves inherited keys - `?error=toString` returns a function and
 * `?error=__proto__` an object, neither of which `??` rejects and neither of
 * which React can render - so a crafted URL took the public signup page down.
 */
function accessErrorCopy(code: string | undefined): string {
  if (!code || !Object.prototype.hasOwnProperty.call(ACCESS_ERRORS, code)) return ACCESS_ERROR_FALLBACK;
  return ACCESS_ERRORS[code];
}

export default async function HomeCarePage({ searchParams }: { searchParams: Promise<{ error?: string; unsub?: string }> }) {
  const sp = await searchParams;

  // Returning member? Read the signed access cookie and greet them with a direct
  // link into their portal. Real gating still happens on /home-care/checklist.
  const cookieStore = await cookies();
  const access = await verifyHomeAccess(cookieStore.get(HC_ACCESS_COOKIE)?.value);
  const homeowner = access ? await findHomeownerById(access.homeownerId) : null;
  const returning = homeowner && homeowner.status === 'active' ? homeowner : null;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {returning && (
          <section className="border-b border-primary/10 bg-primary/5">
            <div className="container mx-auto px-4 py-5">
              <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-text-primary">
                  <span className="font-bold">Welcome back{returning.first_name ? `, ${returning.first_name}` : ''}.</span>{' '}
                  <span className="text-text-secondary">Your seasonal home checklist is ready.</span>
                </p>
                <Link href="/home-care/checklist" className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent-sunset px-5 py-3 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-px">
                  Open my checklist →
                </Link>
              </div>
            </div>
          </section>
        )}
        {sp?.unsub === 'ok' && (
          <div className="bg-secondary/10 text-center text-sm py-3 px-4 text-text-secondary">You&apos;ve been unsubscribed from La Vaca Home Care. You can re-join anytime below.</div>
        )}
        {sp?.error && (
          <div className="bg-destructive/10 text-center text-sm py-3 px-4 text-destructive">{accessErrorCopy(sp.error)}</div>
        )}

        <section className="py-10 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-10 items-center max-w-6xl mx-auto">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-primary mb-3">La Vaca Home Care · Northern NJ</p>
                <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-5">
                  Never wonder what your home needs this{' '}
                  <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">season</span>
                </h1>
                <ul className="mb-6 space-y-1.5">
                  {NO_LINES.map((line) => (
                    <li key={line} className="text-2xl md:text-[1.7rem] font-extrabold leading-snug text-text-primary">
                      <span className="text-primary">No</span> {line}
                    </li>
                  ))}
                </ul>
                <p className="text-xl text-text-secondary leading-relaxed">
                  A free, personalized maintenance checklist for your Northern NJ home — gutters, furnace, sump pump, the works — delivered each season. Do it yourself, or book La Vaca to handle it. No account required.
                </p>
                <p className="mt-4">
                  <Link href="/home-care/whats-new" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
                    See what&apos;s new in Home Care →
                  </Link>
                </p>
              </div>
              <div id="get-started" className="scroll-mt-28">
                <HomeCareOptInForm />
              </div>
            </div>
            {/* Scroll cue so visitors know a live preview of their plan is just below. */}
            <div className="mt-10 flex justify-center lg:mt-12">
              <a
                href="#plan-preview"
                className="group inline-flex flex-col items-center gap-1.5 text-sm font-semibold text-text-secondary transition-colors hover:text-primary"
              >
                <span>See a sample of your plan</span>
                <ChevronDown className="h-5 w-5 animate-bounce text-primary" aria-hidden />
              </a>
            </div>
          </div>
        </section>

        {/* Animated checklist preview: show visitors the kind of content
            (and the satisfying done-state) their real seasonal plan gives them.
            Placed right below the signup so a visitor can immediately preview
            what they'll get; the hero's scroll cue points here. */}
        <section id="plan-preview" className="scroll-mt-24 py-14 md:py-20 bg-gradient-subtle border-t border-border/60">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center max-w-6xl mx-auto">
              <div className="order-2 lg:order-1">
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-primary mb-3">A peek at your plan</p>
                <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
                  Watch your to-do list{' '}
                  <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">take care of itself</span>
                </h2>
                <p className="text-lg text-text-secondary leading-relaxed mb-5">
                  Each season we hand you a short, personalized list of what your home actually needs, with a quick why, a rough cost, and a one-tap way to book La Vaca on anything you&apos;d rather not do yourself. Check things off as you go; your progress is always saved.
                </p>
                <ul className="space-y-2.5 mb-2">
                  {[
                    'Tailored to your home: HVAC, deck, driveway, and more',
                    'Clear DIY vs. pro guidance on every task',
                    'Book the hard ones with one tap',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2.5 text-text-secondary">
                      <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent-teal" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-7 flex flex-wrap items-center gap-4">
                  <Link
                    href="#get-started"
                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-accent-sunset px-6 py-3.5 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-px"
                  >
                    Get my free seasonal plan →
                  </Link>
                  <span className="text-sm text-text-muted">20-second setup · No account · Free</span>
                </div>
              </div>
              <div className="order-1 lg:order-2 flex justify-center">
                <div>
                  <ChecklistPreview seasonLabel="Summer" />
                  <p className="mt-3 text-center text-xs text-text-muted">
                    Sample plan for illustration. Your real checklist is personalized to your home.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8">
              {STEPS.map((s) => (
                <div key={s.title} className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                    <s.icon className="h-7 w-7" />
                  </div>
                  <h3 className="text-lg font-bold text-text-primary mb-2">{s.title}</h3>
                  <p className="text-text-secondary leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
