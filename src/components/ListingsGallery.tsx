'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BedDouble, Bath, Ruler, MapPin } from 'lucide-react';
import { scopeToEstimateService } from '@/lib/listings/columns';

export interface PublicListing {
  id: string;
  slug: string;
  address_line1: string;
  city: string;
  county: string | null;
  state: string;
  zip: string | null;
  list_price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  property_type: string | null;
  recommended_scope: string | null;
  est_remodel_budget_low: number | null;
  est_remodel_budget_high: number | null;
  est_arv: number | null;
  photo_urls: string[] | null;
  short_description: string | null;
  status: string;
  featured: boolean | null;
}

const money = (n: number | null | undefined) =>
  n == null ? null : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const ALL = '__all__';

const PRICE_BUCKETS: { label: string; max: number }[] = [
  { label: 'Under $400k', max: 400_000 },
  { label: 'Under $600k', max: 600_000 },
  { label: 'Under $800k', max: 800_000 },
  { label: 'Under $1M', max: 1_000_000 },
];

const titleCase = (s: string) => s.replace(/(^|[-\s])\w/g, (m) => m.toUpperCase()).replace(/-/g, ' ');

export default function ListingsGallery({ listings }: { listings: PublicListing[] }) {
  const [city, setCity] = useState<string>(ALL);
  const [propertyType, setPropertyType] = useState<string>(ALL);
  const [scope, setScope] = useState<string>(ALL);
  const [priceMax, setPriceMax] = useState<string>(ALL);

  const cities = useMemo(
    () => Array.from(new Set(listings.map((l) => l.city).filter(Boolean))).sort(),
    [listings],
  );
  const propertyTypes = useMemo(
    () => Array.from(new Set(listings.map((l) => l.property_type).filter((v): v is string => !!v))).sort(),
    [listings],
  );
  const scopes = useMemo(
    () => Array.from(new Set(listings.map((l) => l.recommended_scope).filter((v): v is string => !!v))).sort(),
    [listings],
  );

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      if (city !== ALL && l.city !== city) return false;
      if (propertyType !== ALL && l.property_type !== propertyType) return false;
      if (scope !== ALL && l.recommended_scope !== scope) return false;
      if (priceMax !== ALL && (l.list_price ?? Infinity) > Number(priceMax)) return false;
      return true;
    });
  }, [listings, city, propertyType, scope, priceMax]);

  const resetFilters = () => {
    setCity(ALL);
    setPropertyType(ALL);
    setScope(ALL);
    setPriceMax(ALL);
  };

  return (
    <section className="py-8 md:py-12">
      <div className="container mx-auto px-4">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 mb-8">
          <FilterSelect label="City" value={city} onChange={setCity} options={cities.map((c) => ({ value: c, label: c }))} />
          <FilterSelect
            label="Type"
            value={propertyType}
            onChange={setPropertyType}
            options={propertyTypes.map((t) => ({ value: t, label: titleCase(t) }))}
          />
          <FilterSelect
            label="Best for"
            value={scope}
            onChange={setScope}
            options={scopes.map((s) => ({ value: s, label: titleCase(s) }))}
          />
          <FilterSelect
            label="Max price"
            value={priceMax}
            onChange={setPriceMax}
            options={PRICE_BUCKETS.map((b) => ({ value: String(b.max), label: b.label }))}
          />
          <Button variant="ghost" onClick={resetFilters} className="text-text-muted">
            Reset
          </Button>
        </div>

        {filtered.length === 0 ? (
          <div data-testid="listings-empty" className="text-center py-16">
            <p className="text-xl font-semibold text-text-primary mb-2">No homes match your filters yet</p>
            <p className="text-text-muted">
              Check back soon — we add new buy-and-remodel opportunities regularly. Or{' '}
              <Link href="/free-estimate" className="text-primary underline">
                request a custom estimate
              </Link>
              .
            </p>
          </div>
        ) : (
          <div data-testid="listings-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder={`All`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ListingCard({ listing: l }: { listing: PublicListing }) {
  const photo = l.photo_urls?.[0];
  const estimateHref = `/free-estimate?service=${scopeToEstimateService(l.recommended_scope)}&utm_content=listing-${l.slug}`;
  const detailHref = `/buy-and-remodel/${l.slug}`;

  return (
    <Card className="group overflow-hidden rounded-2xl shadow-card hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 flex flex-col">
      <Link href={detailHref} className="block relative aspect-[4/3] overflow-hidden bg-muted">
        {photo ? (
          <Image
            src={photo}
            alt={`${l.address_line1}, ${l.city}`}
            fill
            unoptimized
            loading="lazy"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-muted">No photo</div>
        )}
        {l.status !== 'available' && (
          <Badge variant="secondary" className="absolute top-3 left-3 capitalize">
            {l.status}
          </Badge>
        )}
        {l.list_price != null && (
          <Badge className="absolute bottom-3 left-3 bg-primary text-primary-foreground text-base px-3 py-1">
            {money(l.list_price)}
          </Badge>
        )}
      </Link>

      <CardContent className="p-5 flex flex-col flex-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">
          {l.property_type ? titleCase(l.property_type) : 'Home'}
          {l.recommended_scope ? ` · best for ${titleCase(l.recommended_scope)}` : ''}
        </div>
        <Link href={detailHref}>
          <h3 className="font-bold text-text-primary text-lg leading-snug hover:text-primary transition-colors">
            {l.address_line1}
          </h3>
        </Link>
        <div className="flex items-center gap-1 text-text-muted text-sm mt-1">
          <MapPin className="w-4 h-4" />
          {l.city}
          {l.county ? `, ${l.county} County` : ''}
        </div>

        {/* Specs */}
        <div className="flex flex-wrap gap-4 text-sm text-text-secondary mt-3">
          {l.beds != null && (
            <span className="flex items-center gap-1">
              <BedDouble className="w-4 h-4 text-primary" /> {l.beds} bd
            </span>
          )}
          {l.baths != null && (
            <span className="flex items-center gap-1">
              <Bath className="w-4 h-4 text-primary" /> {l.baths} ba
            </span>
          )}
          {l.sqft != null && (
            <span className="flex items-center gap-1">
              <Ruler className="w-4 h-4 text-primary" /> {l.sqft.toLocaleString()} sqft
            </span>
          )}
        </div>

        {/* Remodel + ARV */}
        <div className="mt-4 space-y-1">
          {(l.est_remodel_budget_low != null || l.est_remodel_budget_high != null) && (
            <Badge variant="outline" className="border-accent-teal text-accent-teal">
              Est. remodel {money(l.est_remodel_budget_low)}–{money(l.est_remodel_budget_high)}
            </Badge>
          )}
          {l.est_arv != null && (
            <p className="text-sm text-text-muted">
              After remodel: <span className="font-semibold text-text-primary">{money(l.est_arv)}</span>
            </p>
          )}
        </div>

        {/* CTAs */}
        <div className="mt-5 flex gap-2 pt-2">
          <Button asChild variant="outline" className="flex-1">
            <Link href={detailHref}>View details</Link>
          </Button>
          <Button asChild className="flex-1">
            <Link href={estimateHref}>Get estimate</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
