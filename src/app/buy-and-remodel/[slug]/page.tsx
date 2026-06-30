import type { ReactNode } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ListingPhotos from '@/components/listings/ListingPhotos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BedDouble, Bath, Ruler, Calendar, Home as HomeIcon, Phone, Mail, ArrowRight } from 'lucide-react';
import { scopeToEstimateService, sectionLabel } from '@/lib/listings/columns';
import { IS_DEV, SAMPLE_LISTINGS, SAMPLE_PARTNER, SAMPLE_RENDERINGS } from '@/lib/listings/sampleData';
import { resolveBuyRemodelAccess } from '@/lib/listings/published';
import PreviewBanner from '@/components/listings/PreviewBanner';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';

// Dynamic: access depends on the live publish flag + the viewer's admin session
// (and the per-listing email gate runs in middleware).
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
);

const BASE = 'https://www.lavacagc.com/buy-and-remodel';

interface ListingDetail {
  id: string;
  slug: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  county: string | null;
  state: string;
  zip: string | null;
  list_price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_size: string | null;
  year_built: number | null;
  property_type: string | null;
  short_description: string | null;
  est_remodel_budget_low: number | null;
  est_remodel_budget_high: number | null;
  est_arv: number | null;
  area_comp_avg: number | null;
  recommended_scope: string | null;
  highlights: string[] | null;
  photo_urls: string[] | null;
  listing_url: string | null;
  status: string;
}

interface PartnerAgent {
  name: string | null;
  brokerage: string | null;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  bio: string | null;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

const money = (n: number | null | undefined) =>
  n == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

async function getListing(slug: string): Promise<ListingDetail | null> {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('slug', slug)
    .in('status', ['available', 'pending', 'sold'])
    .maybeSingle();
  if (error || !data) {
    // DEV-only: serve a sample home locally before the migration is applied.
    if (IS_DEV) return (SAMPLE_LISTINGS.find((s) => s.slug === slug) as unknown as ListingDetail) ?? null;
    return null;
  }
  return data as unknown as ListingDetail;
}

interface Rendering {
  section: string;
  before_url: string;
  after_url: string;
}

async function getRenderings(listingId: string, slug: string): Promise<Rendering[]> {
  const { data, error } = await supabase
    .from('listing_renderings')
    .select('section,before_url,after_url,sort_order')
    .eq('listing_id', listingId)
    .eq('status', 'ready')
    .order('sort_order', { ascending: true });
  if (error || !data || data.length === 0) {
    if (IS_DEV) return (SAMPLE_RENDERINGS[slug] ?? []) as Rendering[];
    return [];
  }
  return data
    .filter((r) => !!r.before_url && !!r.after_url)
    .map((r) => ({ section: r.section, before_url: r.before_url as string, after_url: r.after_url as string }));
}

async function getPartnerAgent(): Promise<PartnerAgent | null> {
  const { data } = await supabase.from('partner_realtor').select('name,brokerage,phone,email,photo_url,bio').eq('id', 1).maybeSingle();
  if (!data && IS_DEV) return SAMPLE_PARTNER as PartnerAgent;
  return (data as PartnerAgent) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const l = await getListing(slug);
  if (!l) return { title: 'Home Not Found | La Vaca GC' };
  const title = `${l.address_line1}, ${l.city} ${l.state} — Buy + Remodel | La Vaca GC`;
  const description =
    l.short_description ||
    `${l.address_line1} in ${l.city}, ${l.state}: asking ${money(l.list_price) ?? 'price on request'} with an estimated remodel budget of ${money(l.est_remodel_budget_low)}–${money(l.est_remodel_budget_high)}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', url: `${BASE}/${l.slug}`, images: l.photo_urls?.[0] ? [{ url: l.photo_urls[0] }] : [] },
    alternates: { canonical: `${BASE}/${l.slug}` },
  };
}

export default async function ListingDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const { canView, isPreview } = await resolveBuyRemodelAccess();
  if (!canView) notFound();
  const l = await getListing(slug);
  if (!l) notFound();
  const [agent, renderings] = await Promise.all([getPartnerAgent(), getRenderings(l.id, l.slug)]);

  const photos = l.photo_urls ?? [];
  const estimateHref = `/free-estimate?service=${scopeToEstimateService(l.recommended_scope)}&utm_content=listing-${l.slug}`;
  const hasAgent = !!agent?.name;

  const totalLow = l.list_price != null && l.est_remodel_budget_low != null ? l.list_price + l.est_remodel_budget_low : null;
  const totalHigh = l.list_price != null && l.est_remodel_budget_high != null ? l.list_price + l.est_remodel_budget_high : null;
  const upside = l.est_arv != null && totalHigh != null ? l.est_arv - totalHigh : null;
  // Market check: how comparable, already-remodeled homes nearby are pricing,
  // vs. the all-in cost to own this one renovated — i.e. equity after the remodel.
  const compEquity = l.area_comp_avg != null && totalHigh != null ? l.area_comp_avg - totalHigh : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: `${l.address_line1}, ${l.city}, ${l.state}`,
    url: `${BASE}/${l.slug}`,
    image: photos,
    ...(l.short_description ? { description: l.short_description } : {}),
    ...(l.list_price != null ? { offers: { '@type': 'Offer', price: l.list_price, priceCurrency: 'USD' } } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: l.address_line1,
      addressLocality: l.city,
      addressRegion: l.state,
      postalCode: l.zip ?? undefined,
      addressCountry: 'US',
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {isPreview && <PreviewBanner />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-text-muted mb-4">
            <Link href="/buy-and-remodel" className="hover:text-primary">
              Buy + Remodel
            </Link>
            <span className="mx-2">/</span>
            <span className="text-text-secondary">{l.address_line1}</span>
          </nav>

          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-primary mb-2">
                {[l.property_type ? l.property_type.replace(/-/g, ' ') : 'Home', `${l.city}, ${l.state}`].join(' · ')}
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-text-primary capitalize">{l.address_line1}</h1>
              <p className="text-lg text-text-secondary">
                {[l.city, l.county ? `${l.county} County` : null, l.state, l.zip].filter(Boolean).join(', ')}
              </p>
            </div>
            {l.list_price != null && (
              <div className="text-right">
                <div className="text-3xl font-bold text-primary">{money(l.list_price)}</div>
                <Badge variant="secondary" className="capitalize">
                  {l.status}
                </Badge>
              </div>
            )}
          </div>

          {/* Photos — click any to open the lightbox carousel */}
          {photos.length > 0 ? (
            <ListingPhotos photos={photos} alt={`${l.address_line1}, ${l.city}`} />
          ) : (
            <div className="aspect-[16/6] rounded-lg bg-muted flex items-center justify-center text-text-muted mb-8">
              No photos available
            </div>
          )}

          {/* Before / after AI renderings */}
          {renderings.length > 0 && (
            <section className="mb-10">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-primary mb-1">See the potential</p>
              <h2 className="text-2xl font-bold text-text-primary mb-1">Before &amp; after — what this home could become</h2>
              <p className="text-sm text-text-muted mb-5">
                Drag each slider to compare today&apos;s space with an AI-generated remodel at the same angle.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {renderings.map((r) => (
                  <div key={r.section}>
                    <h3 className="font-semibold text-text-primary mb-2">{sectionLabel(r.section)}</h3>
                    <BeforeAfterSlider beforeImage={r.before_url} afterImage={r.after_url} />
                    <p className="mt-2 text-xs text-text-muted">
                      <span className="font-medium">AI-generated visualization</span> — illustrative only, not the actual finished space.
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: details */}
            <div className="lg:col-span-2 space-y-8">
              {/* Stat bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat icon={<BedDouble className="w-4 h-4 text-primary" />} label="Beds" value={l.beds != null ? String(l.beds) : null} />
                <Stat icon={<Bath className="w-4 h-4 text-primary" />} label="Baths" value={l.baths != null ? String(l.baths) : null} />
                <Stat icon={<Ruler className="w-4 h-4 text-primary" />} label="Sq Ft" value={l.sqft != null ? l.sqft.toLocaleString() : null} />
                <Stat icon={<Calendar className="w-4 h-4 text-primary" />} label="Year Built" value={l.year_built != null ? String(l.year_built) : null} />
                <Stat icon={<HomeIcon className="w-4 h-4 text-primary" />} label="Type" value={l.property_type ? l.property_type.replace(/-/g, ' ') : null} />
                <Stat icon={<Ruler className="w-4 h-4 text-primary" />} label="Lot" value={l.lot_size} />
              </div>

              {l.short_description && (
                <div>
                  <h2 className="text-xl font-bold text-text-primary mb-2">About this home</h2>
                  <p className="text-text-secondary leading-relaxed">{l.short_description}</p>
                </div>
              )}

              {l.highlights && l.highlights.length > 0 && (
                <div>
                  <h2 className="text-xl font-bold text-text-primary mb-2">Highlights</h2>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {l.highlights.map((h, i) => (
                      <li key={i} className="flex items-center gap-2 text-text-secondary">
                        <ArrowRight className="w-4 h-4 text-accent-teal flex-shrink-0" /> {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {l.listing_url && (
                <a href={l.listing_url} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm">
                  View the full MLS / agent listing →
                </a>
              )}
            </div>

            {/* Right: value + agent + CTA */}
            <div className="space-y-6 lg:sticky lg:top-24 self-start">
              {/* Value breakdown */}
              <div className="rounded-lg border bg-card shadow-card p-6">
                <h2 className="text-lg font-bold text-text-primary mb-4">The buy + remodel math</h2>
                <dl className="space-y-3 text-sm">
                  <Row label="Asking price" value={money(l.list_price)} />
                  <Row
                    label="Est. remodel budget"
                    value={
                      l.est_remodel_budget_low != null || l.est_remodel_budget_high != null
                        ? `${money(l.est_remodel_budget_low)}–${money(l.est_remodel_budget_high)}`
                        : null
                    }
                  />
                  {(totalLow != null || totalHigh != null) && (
                    <div className="border-t pt-3">
                      <Row label="Total to own, renovated" value={`${money(totalLow)}–${money(totalHigh)}`} strong />
                    </div>
                  )}
                  {l.est_arv != null && <Row label="Projected value after remodel" value={money(l.est_arv)} strong />}
                  {upside != null && upside > 0 && (
                    <div className="border-t pt-3">
                      <Row label="Potential upside" value={`+${money(upside)}`} accent />
                    </div>
                  )}
                  {l.area_comp_avg != null && (
                    <div className="border-t pt-3">
                      <Row label="Comparable remodeled homes nearby" value={money(l.area_comp_avg)} />
                      {compEquity != null && (
                        <Row
                          label="Equity vs. comparable homes"
                          value={`${compEquity >= 0 ? '+' : '−'}${money(Math.abs(compEquity))}`}
                          accent={compEquity > 0}
                        />
                      )}
                    </div>
                  )}
                </dl>
                {l.area_comp_avg != null && compEquity != null && compEquity > 0 && (
                  <p className="text-xs text-text-secondary mt-4 rounded-md bg-accent-teal/10 border border-accent-teal/30 p-3">
                    Comparable, already-remodeled homes in this area are selling around{' '}
                    <span className="font-semibold text-text-primary">{money(l.area_comp_avg)}</span>. With an all-in cost
                    near <span className="font-semibold text-text-primary">{money(totalHigh)}</span>, that&apos;s roughly{' '}
                    <span className="font-semibold text-accent-teal">{money(compEquity)}</span> of built-in equity once the
                    remodel is done — a sign the home is worth renovating in this market.
                  </p>
                )}
                <p className="text-xs text-text-muted mt-4">
                  Estimates are illustrative, not an appraisal or guarantee of value. Comparable-home figures are based on
                  recent nearby sales and will vary. Final remodel cost depends on scope and selections.
                </p>
              </div>

              {/* Partner agent */}
              {hasAgent && (
                <div className="rounded-lg border bg-card shadow-card p-6">
                  <h2 className="text-lg font-bold text-text-primary mb-3">Buy this home</h2>
                  <div className="flex items-center gap-3 mb-3">
                    {agent!.photo_url && (
                      <Image src={agent!.photo_url} alt={agent!.name ?? 'Partner agent'} width={56} height={56} unoptimized className="rounded-full object-cover w-14 h-14" />
                    )}
                    <div>
                      <p className="font-semibold text-text-primary">{agent!.name}</p>
                      {agent!.brokerage && <p className="text-sm text-text-muted">{agent!.brokerage}</p>}
                    </div>
                  </div>
                  {agent!.bio && <p className="text-sm text-text-secondary mb-3">{agent!.bio}</p>}
                  <div className="flex flex-col gap-2">
                    {agent!.phone && (
                      <Button asChild variant="outline" className="w-full justify-start">
                        <a href={`tel:${agent!.phone.replace(/[^\d+]/g, '')}`}>
                          <Phone className="w-4 h-4 mr-2" /> {agent!.phone}
                        </a>
                      </Button>
                    )}
                    {agent!.email && (
                      <Button asChild variant="outline" className="w-full justify-start">
                        <a href={`mailto:${agent!.email}`}>
                          <Mail className="w-4 h-4 mr-2" /> Email agent
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Estimate CTA */}
              <div className="rounded-2xl border-2 border-primary bg-primary/5 p-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary mb-1">Next step</p>
                <h2 className="text-lg font-bold text-text-primary mb-2">Remodel it with La Vaca</h2>
                <p className="text-sm text-text-secondary mb-4">Get a full estimate tailored to this home — scope, budget, and timeline.</p>
                <Button asChild className="w-full bg-gradient-to-r from-primary to-accent-tangerine text-primary-foreground hover:shadow-button">
                  <Link href={estimateHref}>Get my remodel estimate</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border bg-card shadow-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">
        {icon}
        {label}
      </div>
      <div className="text-lg font-bold text-text-primary capitalize">{value}</div>
    </div>
  );
}

function Row({ label, value, strong, accent }: { label: string; value: string | null; strong?: boolean; accent?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className={accent ? 'font-bold text-accent-teal' : strong ? 'font-bold text-text-primary' : 'text-text-secondary'}>{value}</dd>
    </div>
  );
}
