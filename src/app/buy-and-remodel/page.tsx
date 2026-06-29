import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ListingsGallery, { type PublicListing } from '@/components/ListingsGallery';
import PreviewBanner from '@/components/listings/PreviewBanner';
import { resolveBuyRemodelAccess } from '@/lib/listings/published';
import { IS_DEV, SAMPLE_LISTINGS } from '@/lib/listings/sampleData';

// Dynamic: access depends on the live publish flag + the viewer's admin session.
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
);

const PAGE_URL = 'https://www.lavacagc.com/buy-and-remodel';

export const metadata: Metadata = {
  title: 'Northern NJ Homes to Buy + Remodel | La Vaca General Contractors',
  description:
    'Browse curated Northern New Jersey homes that are great value to buy and renovate. See the asking price, our estimated remodel budget, and projected after-remodel value — then get a full estimate from La Vaca General Contractors.',
  keywords:
    'NJ homes to remodel, fixer upper New Jersey, buy and renovate Northern NJ, investment property remodel, after remodel value, Bergen County renovation homes',
  openGraph: {
    title: 'Northern NJ Homes to Buy + Remodel | La Vaca GC',
    description:
      'Curated homes to buy and renovate in Northern NJ, each with an estimated remodel budget and after-remodel value.',
    type: 'website',
    url: PAGE_URL,
    images: [{ url: 'https://www.lavacagc.com/og-portfolio.jpg', width: 1200, height: 630, alt: 'Homes to Buy and Remodel in Northern NJ' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Northern NJ Homes to Buy + Remodel | La Vaca GC',
    description: 'Curated homes to buy and renovate in Northern NJ.',
  },
  alternates: { canonical: PAGE_URL },
};

const SELECT_COLS =
  'id,slug,address_line1,city,county,state,zip,list_price,beds,baths,sqft,property_type,recommended_scope,est_remodel_budget_low,est_remodel_budget_high,est_arv,photo_urls,short_description,status,featured';

async function getListings(): Promise<PublicListing[]> {
  try {
    const { data, error } = await supabase
      .from('listings')
      .select(SELECT_COLS)
      .in('status', ['available', 'pending'])
      .order('featured', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error loading listings:', error.message);
      return [];
    }
    return (data ?? []) as unknown as PublicListing[];
  } catch (err) {
    console.error('Failed to fetch listings:', err);
    return [];
  }
}

export default async function BuyAndRemodelPage() {
  const { canView, isPreview } = await resolveBuyRemodelAccess();
  if (!canView) notFound();

  const fetched = await getListings();
  // DEV-only: show sample homes locally before the migration is applied.
  const listings = fetched.length ? fetched : IS_DEV ? (SAMPLE_LISTINGS as unknown as PublicListing[]) : [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Northern NJ Homes to Buy + Remodel',
    description:
      'Curated Northern New Jersey homes that are great value to buy and renovate, each with an estimated remodel budget and projected after-remodel value.',
    url: PAGE_URL,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: listings.length,
      itemListElement: listings.slice(0, 25).map((l, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'RealEstateListing',
          name: `${l.address_line1}, ${l.city}, ${l.state}`,
          url: `${PAGE_URL}/${l.slug}`,
          image: l.photo_urls?.[0],
          ...(l.list_price != null
            ? { offers: { '@type': 'Offer', price: l.list_price, priceCurrency: 'USD' } }
            : {}),
        },
      })),
    },
    provider: {
      '@type': 'LocalBusiness',
      name: 'La Vaca General Contractors',
      url: 'https://www.lavacagc.com',
      telephone: '(201) 212-4917',
      address: { '@type': 'PostalAddress', addressRegion: 'NJ', addressCountry: 'US' },
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {isPreview && <PreviewBanner />}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-8 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-primary mb-3">
                Curated · Northern New Jersey
              </p>
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
                Northern NJ Homes to{' '}
                <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
                  Buy + Remodel
                </span>
              </h1>
              <p className="text-xl text-text-secondary leading-relaxed mb-8">
                Hand-picked homes with great bones and real upside. For each one we show the asking price, our
                estimated remodel budget, and the projected value after renovation — so you can buy smart and build the
                home you actually want. Connect with our partner agent to purchase, then let us handle the remodel.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/free-estimate"
                  className="inline-flex items-center justify-center rounded-md text-sm font-semibold bg-gradient-to-r from-primary to-accent-tangerine text-primary-foreground hover:shadow-button transition-all duration-300 h-12 px-8"
                >
                  Get a Remodel Estimate
                </Link>
                <Link
                  href="#listings"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium border-2 border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground h-12 px-8"
                >
                  Browse Homes
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div id="listings" className="scroll-mt-20" />
        <ListingsGallery listings={listings} />

        {/* CTA */}
        <section className="py-8 md:py-16 bg-primary">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl font-bold mb-6 text-primary-foreground">Found a home with potential?</h2>
              <p className="text-xl mb-8 text-primary-foreground/90">
                Tell us about the property and we&apos;ll put together a full remodel estimate — scope, budget, and
                timeline.
              </p>
              <Link
                href="/free-estimate"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-background text-text-primary hover:bg-background/90 h-11 px-8"
              >
                Get Your Free Estimate
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
