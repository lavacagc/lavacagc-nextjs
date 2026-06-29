import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Sparkles, Images, Calculator } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ListingsUnlockForm from '@/components/listings/ListingsUnlockForm';
import PreviewBanner from '@/components/listings/PreviewBanner';
import { resolveBuyRemodelAccess } from '@/lib/listings/published';

// Dynamic: hidden from the public until the feature is published (admins preview).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Unlock Northern NJ Buy + Remodel Homes | La Vaca General Contractors',
  description:
    'Verify your email to unlock full home details, remodel budgets, and AI before/after visualizations for curated Northern New Jersey homes worth buying and renovating.',
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://www.lavacagc.com/buy-and-remodel/unlock' },
};

function sanitizeNext(next: string | undefined): string | undefined {
  if (next && next.startsWith('/buy-and-remodel/') && !next.startsWith('/buy-and-remodel/unlock')) {
    return next;
  }
  return undefined;
}

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { canView, isPreview } = await resolveBuyRemodelAccess();
  if (!canView) notFound();

  const params = await searchParams;
  const next = sanitizeNext(params.next);
  const expired = params.error === 'expired';
  const otherError = params.error && params.error !== 'expired';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {isPreview && <PreviewBanner />}

      <main className="flex-1 bg-gradient-subtle">
        <section className="py-10 md:py-16">
          <div className="container mx-auto px-4">
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center max-w-6xl mx-auto">
              {/* Value prop */}
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-primary mb-3">
                  Free · Northern New Jersey
                </p>
                <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-5">
                  Verify your email to see{' '}
                  <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                    the full details
                  </span>
                </h1>
                <p className="text-lg text-text-secondary leading-relaxed mb-8">
                  You&apos;re browsing the gallery — confirm your email to unlock each home&apos;s complete remodel
                  scope, budget range, and AI before/after visualizations. It&apos;s free, and it signs you up for our
                  Buy&nbsp;+&nbsp;Remodel newsletter.
                </p>

                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Images className="h-5 w-5" />
                    </span>
                    <span className="text-text-secondary">
                      <strong className="text-text-primary">Full photo galleries</strong> and every detail on each home.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <span className="text-text-secondary">
                      <strong className="text-text-primary">AI before/after</strong> visualizations, room by room.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Calculator className="h-5 w-5" />
                    </span>
                    <span className="text-text-secondary">
                      <strong className="text-text-primary">Remodel budgets</strong> and projected after-remodel value.
                    </span>
                  </li>
                </ul>
              </div>

              {/* Form */}
              <div>
                {expired && (
                  <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    That link has expired. Enter your details below and we&apos;ll send a fresh one.
                  </div>
                )}
                {otherError && (
                  <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    That link was invalid. Enter your details below to get a new access link.
                  </div>
                )}
                <ListingsUnlockForm next={next} />
                <p className="mt-4 text-center text-sm text-text-muted">
                  Just want to look first?{' '}
                  <Link href="/buy-and-remodel" className="font-semibold text-primary underline underline-offset-2">
                    Back to the gallery
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
