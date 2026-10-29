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
    offers: {
      '@type': 'Offer',
      price: (service.startingPriceCents / 100).toFixed(2),
      priceCurrency: 'USD',
      description: `${t(service.priceDisplay, lang)} ${t(service.priceUnit, lang)}`,
      url,
    },
  };
}
