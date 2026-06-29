import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BedDouble, Bath, Ruler, Calendar, Home as HomeIcon, Phone, Mail, ArrowRight } from 'lucide-react';
import { scopeToEstimateService } from '@/lib/listings/columns';

export const revalidate = 60;

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
  if (error || !data) return null;
  return data as unknown as ListingDetail;
}

async function getPartnerAgent(): Promise<PartnerAgent | null> {
  const { data } = await supabase.from('partner_realtor').select('name,brokerage,phone,email,photo_url,bio').eq('id', 1).maybeSingle();
  return (data as PartnerAgent) ?? null;
}

export async function generateStaticParams() {
  try {
    const { data } = await supabase.from('listings').select('slug').in('status', ['available', 'pending', 'sold']);
    return (data ?? []).map((l: { slug: string }) => ({ slug: l.slug }));
  } catch {
    return [];
  }
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
  const [l, agent] = await Promise.all([getListing(slug), getPartnerAgent()]);
  if (!l) notFound();

  const photos = l.photo_urls ?? [];
  const estimateHref = `/free-estimate?service=${scopeToEstimateService(l.recommended_scope)}&utm_content=listing-${l.slug}`;
  const hasAgent = !!agent?.name;

  const totalLow = l.list_price != null && l.est_remodel_budget_low != null ? l.list_price + l.est_remodel_budget_low : null;
  const totalHigh = l.list_price != null && l.est_remodel_budget_high != null ? l.list_price + l.est_remodel_budget_high : null;
  const upside = l.est_arv != null && totalHigh != null ? l.est_arv - totalHigh : null;

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
              <h1 className="text-3xl md:text-4xl font-bold text-text-primary">{l.address_line1}</h1>
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

          {/* Photos */}
          {photos.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
              <div className="md:col-span-2 relative aspect-[4/3] rounded-lg overflow-hidden bg-muted">
                <Image src={photos[0]} alt={`${l.address_line1}, ${l.city}`} fill unoptimized className="object-cover" sizes="(max-width: 768px) 100vw, 66vw" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
                {photos.slice(1, 3).map((p, i) => (
                  <div key={i} className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted">
                    <Image src={p} alt={`${l.address_line1} photo ${i + 2}`} fill unoptimized className="object-cover" sizes="33vw" />
                  </div>
                ))}
              </div>
              {photos.length > 3 && (
                <div className="md:col-span-3 grid grid-cols-3 md:grid-cols-6 gap-3">
                  {photos.slice(3).map((p, i) => (
                    <div key={i} className="relative aspect-[4/3] rounded-lg overflow-hidden bg-muted">
                      <Image src={p} alt={`${l.address_line1} photo ${i + 4}`} fill unoptimized className="object-cover" sizes="16vw" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-[16/6] rounded-lg bg-muted flex items-center justify-center text-text-muted mb-8">
              No photos available
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: details */}
            <div className="lg:col-span-2 space-y-8">
              {/* Specs */}
              <div className="flex flex-wrap gap-6 text-text-secondary">
                {l.beds != null && (
                  <span className="flex items-center gap-2">
                    <BedDouble className="w-5 h-5 text-primary" /> {l.beds} beds
                  </span>
                )}
                {l.baths != null && (
                  <span className="flex items-center gap-2">
                    <Bath className="w-5 h-5 text-primary" /> {l.baths} baths
                  </span>
                )}
                {l.sqft != null && (
                  <span className="flex items-center gap-2">
                    <Ruler className="w-5 h-5 text-primary" /> {l.sqft.toLocaleString()} sqft
                  </span>
                )}
                {l.year_built != null && (
                  <span className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" /> Built {l.year_built}
                  </span>
                )}
                {l.property_type && (
                  <span className="flex items-center gap-2 capitalize">
                    <HomeIcon className="w-5 h-5 text-primary" /> {l.property_type.replace(/-/g, ' ')}
                  </span>
                )}
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
            <div className="space-y-6">
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
                </dl>
                <p className="text-xs text-text-muted mt-4">
                  Estimates are illustrative, not an appraisal or guarantee of value. Final remodel cost depends on
                  scope and selections.
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
              <div className="rounded-lg border-2 border-primary bg-primary/5 p-6 text-center">
                <h2 className="text-lg font-bold text-text-primary mb-2">Remodel it with La Vaca</h2>
                <p className="text-sm text-text-secondary mb-4">Get a full estimate tailored to this home.</p>
                <Button asChild className="w-full">
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

function Row({ label, value, strong, accent }: { label: string; value: string | null; strong?: boolean; accent?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className={accent ? 'font-bold text-accent-teal' : strong ? 'font-bold text-text-primary' : 'text-text-secondary'}>{value}</dd>
    </div>
  );
}
