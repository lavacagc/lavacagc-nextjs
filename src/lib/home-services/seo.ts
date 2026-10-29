/**
 * SEO helpers for /home-services and /home-services/<slug> (SEO1, SEO2).
 * Import-light; used by server pages and by the source-level tests.
 */
import { COUNTIES, t, type HomeService, type Lang } from './catalog';
import { s } from './i18n';

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
/** The absolute URL of a home services page in a language: Spanish is `?lang=es`. */
export function pageUrl(path: string, lang: Lang): string {
  return `${SITE}${path}${lang === 'es' ? '?lang=es' : ''}`;
}

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
  const url = pageUrl(`/home-services/${service.slug}`, lang);
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    // One entity per service across both languages; `url` is the page in this language.
    '@id': `${SITE}/home-services/${service.slug}#service`,
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
 * only exterior painting, priced per square foot with a job minimum) is a
 * UnitPriceSpecification instead, so the unit price never reads as the job price (review D12).
 * The unit is the UN/CEFACT code FTK (square foot) per one unit, and the job
 * minimum is `eligibleTransactionVolume`, schema.org's "minimal purchasing
 * volume"; `minPrice` would instead claim the unit price itself starts at the minimum.
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
      unitCode: 'FTK',
      unitText: 'per square foot',
      referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'FTK' },
      eligibleTransactionVolume: {
        '@type': 'PriceSpecification',
        minPrice: (service.minimumCents / 100).toFixed(2),
        priceCurrency: 'USD',
      },
    },
  };
}

/**
 * `FAQPage` JSON-LD for questions that are visible on the page. Google shows
 * FAQ rich results only for government and health sites since 2023, so this is
 * for search and answer engines that read the markup, not for a SERP feature.
 */
export function faqJsonLd(items: Array<{ q: string; a: string }>, url: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

/** Home > Home services [> service], with every URL in the page's language. */
export function breadcrumbJsonLd(lang: Lang, service?: HomeService): Record<string, unknown> {
  const items = [
    { name: lang === 'es' ? 'Inicio' : 'Home', item: SITE },
    { name: s('servicesNav', lang), item: pageUrl('/home-services', lang) },
    ...(service ? [{ name: t(service.name, lang), item: pageUrl(`/home-services/${service.slug}`, lang) }] : []),
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((entry, i) => ({ '@type': 'ListItem', position: i + 1, ...entry })),
  };
}

/** Several nodes in one script: one `@context` on the wrapper, none on the nodes. */
export function jsonLdGraph(nodes: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes.map((node) => Object.fromEntries(Object.entries(node).filter(([key]) => key !== '@context'))),
  };
}
