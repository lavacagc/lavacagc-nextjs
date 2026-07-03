import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { ArrowRight, Sparkles } from 'lucide-react';

/**
 * Public release page for La Vaca Home Care (SEO surface). Reads the same
 * feature_releases queue that powers the member release email — every entry
 * here is a live, shipped capability. Statically generated and refreshed
 * hourly so new entries appear without a deploy.
 */
export const dynamic = 'force-static';
export const revalidate = 3600;

const BASE = 'https://www.lavacagc.com';
const PAGE_URL = `${BASE}/home-care/whats-new`;
const TITLE = "What's New in La Vaca Home Care | Free NJ Home Maintenance Checklist";
const DESCRIPTION =
  'See the newest features in La Vaca Home Care — the free seasonal home-maintenance checklist for Northern NJ homeowners. Personalized tasks, season progress, reminders, and one-tap booking.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "What's new in La Vaca Home Care",
    description: DESCRIPTION,
    type: 'website',
    url: PAGE_URL,
  },
};

interface ReleaseRow {
  id: string;
  headline: string;
  subhead: string;
  benefit: string;
  screenshot_path: string | null;
  status: 'queued' | 'sent';
  sort_order: number;
  created_at: string;
  sent_at: string | null;
}

async function loadReleases(): Promise<ReleaseRow[]> {
  try {
    const rows = await supabaseRest<ReleaseRow[]>(
      'GET',
      'feature_releases?select=id,headline,subhead,benefit,screenshot_path,status,sort_order,created_at,sent_at&order=sort_order.asc,created_at.asc',
    );
    return rows ?? [];
  } catch {
    // Build environments without Supabase credentials (CI) render the shell;
    // the hourly revalidation fills in real entries in production.
    return [];
  }
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default async function WhatsNewPage() {
  const releases = await loadReleases();

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'La Vaca Home Care',
    url: `${BASE}/home-care`,
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Web',
    description:
      'A free seasonal home-maintenance checklist for Northern NJ homeowners: personalized tasks each season, progress tracking, email reminders, and one-tap booking with La Vaca General Contractors.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    provider: {
      '@type': 'GeneralContractor',
      name: 'La Vaca General Contractors',
      telephone: '(201) 212-4917',
      url: BASE,
    },
  };

  const itemListSchema = releases.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: "What's new in La Vaca Home Care",
    url: PAGE_URL,
    numberOfItems: releases.length,
    itemListElement: releases.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: r.headline,
      description: r.subhead,
    })),
  } : null;

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Home Care', item: `${BASE}/home-care` },
      { '@type': 'ListItem', position: 3, name: "What's New", item: PAGE_URL },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }} />
      {itemListSchema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-secondary text-secondary-foreground py-12 md:py-16">
          <div className="container mx-auto px-4 max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-sunset mb-3">La Vaca Home Care · Release notes</p>
            <h1 className="text-3xl md:text-5xl font-bold mb-4">What&apos;s new in La Vaca Home Care</h1>
            <p className="text-lg text-secondary-foreground/85 leading-relaxed">
              Home Care is the <strong>free seasonal home-maintenance checklist for Northern NJ homeowners</strong> —
              personalized tasks each season, progress you can see, and one-tap booking when you&apos;d rather La Vaca
              handled it. Here&apos;s everything we&apos;ve shipped recently.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/home-care" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent-sunset px-5 py-3 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-px">
                Get your free home plan <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/home-care/checklist" className="inline-flex items-center gap-2 rounded-xl border border-secondary-foreground/25 px-5 py-3 text-sm font-bold text-secondary-foreground transition-colors hover:border-secondary-foreground/50">
                Already a member? Open my checklist
              </Link>
            </div>
          </div>
        </section>

        {/* Release entries */}
        <section className="py-12 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4 max-w-3xl space-y-8">
            {releases.length === 0 ? (
              <p className="text-center text-text-secondary py-8">
                Fresh updates are on the way — meanwhile, <Link href="/home-care" className="text-primary font-bold hover:underline">get your free seasonal plan</Link>.
              </p>
            ) : (
              releases.map((r) => (
                <article key={r.id} className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-card">
                  <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    {r.sent_at ? monthLabel(r.sent_at) : 'Just shipped'}
                  </div>
                  <h2 className="text-2xl font-bold text-text-primary mb-2">{r.headline}</h2>
                  <p className="text-text-secondary leading-relaxed mb-4">{r.subhead}</p>
                  {r.screenshot_path && (
                    <Image
                      src={r.screenshot_path}
                      alt={`${r.headline} — La Vaca Home Care feature screenshot`}
                      width={736}
                      height={460}
                      className="w-full h-auto rounded-xl border border-border mb-4"
                    />
                  )}
                  <p className="rounded-xl bg-primary/5 px-4 py-3 text-sm leading-relaxed text-text-secondary">
                    <span className="font-bold text-primary">Why it matters: </span>
                    {r.benefit}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4 max-w-3xl text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-3">Your home has a to-do list. You don&apos;t have to.</h2>
            <p className="text-text-secondary max-w-xl mx-auto mb-6">
              Join free in 20 seconds — email and ZIP, no account, no spam. Every feature above is included, forever.
            </p>
            <Link href="/home-care" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent-sunset px-6 py-3.5 font-bold text-white shadow-button transition-all hover:-translate-y-px">
              Get my free home plan <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
