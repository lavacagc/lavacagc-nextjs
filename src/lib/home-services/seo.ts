/**
 * SEO helpers for /home-services and /home-services/<slug> (SEO1, SEO2).
 * Import-light; used by server pages and by the source-level tests.
 */
import { COUNTIES, t, type HomeService, type Lang } from './catalog';

export const SITE = 'https://www.lavacagc.com';
export const ORG_ID = `${SITE}/#organization`;

/** "<title> | La Vaca" when that still fits under 60 characters (SEO1), else the title alone. */
export function brandedTitle(title: string): string {
  const branded = `${title} | La Vaca`;
  return branded.length < 60 ? branded : title;
}

/**
 * Canonical and hreflang for a home services URL (review D6).
 *
 * The Spanish page is the `?lang=es` URL and is its own canonical, so search
 * engines can index the Spanish pages the Craigslist links point at; every
 * version carries the same three alternates (en, es, x-default). A page that is
 * Spanish only because of the `lv_lang` cookie keeps the English canonical: a
 * crawler has no cookie and sees the English page at that URL.
 */
export function languageAlternates(
  path: string,
  queryLang: string | string[] | undefined,
): { canonical: string; languages: Record<'en' | 'es' | 'x-default', string> } {
  const en = `${SITE}${path}`;
  const es = `${en}?lang=es`;
  const q = Array.isArray(queryLang) ? queryLang[0] : queryLang;
  return { canonical: q === 'es' ? es : en, languages: { en, es, 'x-default': en } };
}

/**
 * `Service` JSON-LD for one catalog entry. `provider` is a bare reference to
 * the organization node the root layout already defines - never a second
 * organization and never a rating (see the history in
 * src/app/projects/[slug]/page.tsx: a second business node and a page-level
 * review each produced a duplicate-rating error in Search Console).
 */
export function serviceJsonLd(service: HomeService, lang: Lang): Record<string, unknown> {
  const url = `${SITE}/home-services/${service.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${url}#service`,
    name: t(service.name, lang),
    description: t(service.description, lang),
    serviceType: t(service.name, 'en'),
    url,
    provider: { '@id': ORG_ID },
    areaServed: COUNTIES.map((county) => ({
      '@type': 'AdministrativeArea',
      name: `${county} County, NJ`,
    })),
    offers: offerFor(service, lang, url),
  };
}

/**
 * A flat starting price is `price`. A per-unit price with a job minimum (today
 * only exterior painting: $2.95 per square foot, $3,500 minimum) is a
 * UnitPriceSpecification instead, so it never reads as a $2.95 job (review D12).
 */
function offerFor(service: HomeService, lang: Lang, url: string): Record<string, unknown> {
  const base = {
    '@type': 'Offer',
    priceCurrency: 'USD',
    description: `${t(service.priceDisplay, lang)} ${t(service.priceUnit, lang)}`,
    url,
  };
  const price = (service.startingPriceCents / 100).toFixed(2);
  if (!service.minimumCents) return { ...base, price };
  return {
    ...base,
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price,
      priceCurrency: 'USD',
      unitText: 'per square foot',
      // The $3,500 job minimum stays in the offer description: inside a
      // per-square-foot UnitPriceSpecification, minPrice reads as the lowest
      // unit price (review D12 re-verification note).
    },
  };
}
