import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { ArrowDown, ArrowLeft, Check, Phone, Plus } from 'lucide-react';
import HeaderComponent from '@/components/Header';
import Footer from '@/components/Footer';
import ServicesTrustBar from '@/components/services/ServicesTrustBar';
import ServicesBottomTabs from '@/components/services/ServicesBottomTabs';
import AttributionCapture from '@/components/home-services/AttributionCapture';
import LangToggle from '@/components/home-services/LangToggle';
import RequestServiceButton from '@/components/home-services/RequestServiceButton';
import ServiceIcon from '@/components/home-services/ServiceIcon';
import { getService, SERVICE_SLUGS, t, type Lang } from '@/lib/home-services/catalog';
import { s } from '@/lib/home-services/i18n';
import { LANG_COOKIE, resolveLang } from '@/lib/home-services/lang';
import { brandedTitle, serviceJsonLd, SITE } from '@/lib/home-services/seo';

/**
 * /home-services/<slug> - one page per catalog service (LP8, SEO1, SEO2; audit
 * C8 chose this namespace over /services/<slug>, which is the remodel table).
 * Built for listing links (`?src=craigslist&lid=...`): the request button opens
 * the same in-page flow with this service preselected.
 */

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function generateStaticParams() {
  return SERVICE_SLUGS.map((slug) => ({ slug }));
}

export const dynamicParams = false;

async function pageLang(searchParams: SearchParams): Promise<Lang> {
  const [params, jar] = await Promise.all([searchParams, cookies()]);
  return resolveLang(params.lang, jar.get(LANG_COOKIE)?.value);
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) return {};
  const lang = await pageLang(searchParams);
  const canonical = `${SITE}/home-services/${slug}`;
  const title = brandedTitle(t(service.seo.title, lang));
  const description = t(service.seo.description, lang);
  return {
    title: { absolute: title },
    description,
    keywords: service.seo.keywords,
    alternates: { canonical, languages: { en: canonical, es: `${canonical}?lang=es` } },
    openGraph: { title, description, type: 'website', url: canonical, locale: lang === 'es' ? 'es_US' : 'en_US' },
  };
}

export default async function HomeServicePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) notFound();
  const lang = await pageLang(searchParams);
  const jsonLd = serviceJsonLd(service, lang);
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
      { '@type': 'ListItem', position: 2, name: s('servicesNav', lang), item: `${SITE}/home-services` },
      { '@type': 'ListItem', position: 3, name: t(service.name, lang), item: `${SITE}/home-services/${slug}` },
    ],
  };

  return (
    <div id="top" className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <AttributionCapture />
      <HeaderComponent />
      <ServicesTrustBar />

      <main id="main-content" lang={lang} className="flex-grow pb-28 lg:pb-12">
        <section className="relative overflow-hidden bg-gradient-to-b from-background-soft to-background pb-12 pt-6 md:pb-16 md:pt-10">
          <div className="container relative mx-auto px-4">
            <div className="flex items-center justify-between gap-3">
              <Link
                href="/home-services"
                className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold text-secondary underline-offset-4 hover:underline"
              >
                <ArrowLeft aria-hidden className="h-4 w-4" />
                {s('backToServices', lang)}
              </Link>
              <LangToggle lang={lang} />
            </div>

            <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
              <div>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-secondary">
                  <ServiceIcon icon={service.icon} className="h-7 w-7" />
                </span>
                <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-text-primary sm:text-5xl">
                  {t(service.name, lang)}
                </h1>
                <p className="mt-4 max-w-xl text-lg leading-relaxed text-text-secondary">{t(service.description, lang)}</p>
                <p className="mt-3 text-sm font-semibold text-text-secondary">{s('trustArea', lang)}</p>
              </div>

              <div className="rounded-3xl border border-border bg-card p-6 shadow-elegant md:p-8" data-testid="service-card">
                <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{s('startingAt', lang)}</p>
                <p className="mt-1 text-4xl font-extrabold tracking-tight text-text-primary" data-testid="service-price">
                  {t(service.priceDisplay, lang)}
                </p>
                <p className="mt-1 text-[15px] text-text-secondary">{t(service.priceUnit, lang)}</p>
                {service.priceNote && <p className="mt-1 text-[15px] text-text-secondary">{t(service.priceNote, lang)}</p>}
                <div className="mt-6 flex flex-col gap-3">
                  <RequestServiceButton slug={service.slug} lang={lang} className="w-full" />
                  <a
                    href="tel:+12012124917"
                    className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-2 border-secondary bg-card px-6 py-3 text-[17px] font-bold text-secondary transition-colors hover:bg-secondary hover:text-white"
                  >
                    <Phone aria-hidden className="h-5 w-5" />
                    {s('callUs', lang)}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-background py-12 md:py-16">
          <div className="container mx-auto grid gap-6 px-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <h2 className="text-xl font-extrabold tracking-tight text-text-primary">{s('whatsIncluded', lang)}</h2>
              <ul className="mt-4 space-y-3" data-testid="included-list">
                {service.included.map((item) => (
                  <li key={item.en} className="flex gap-3 text-[15px] leading-snug text-text-secondary">
                    <Check aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent-teal" />
                    {t(item, lang)}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <h2 className="text-xl font-extrabold tracking-tight text-text-primary">{s('raisesPrice', lang)}</h2>
              <ul className="mt-4 space-y-3" data-testid="raises-list">
                {service.raisesPrice.map((item) => (
                  <li key={item.en} className="flex gap-3 text-[15px] leading-snug text-text-secondary">
                    <Plus aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
                    {t(item, lang)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {service.faq.length > 0 && (
          <section aria-labelledby="service-faq" className="bg-background-soft py-12 md:py-16">
            <div className="container mx-auto max-w-3xl px-4">
              <h2 id="service-faq" className="text-2xl font-extrabold tracking-tight text-text-primary md:text-3xl">
                {s('serviceFaqTitle', lang)}
              </h2>
              <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card" data-testid="service-faq-list">
                {service.faq.map((item) => (
                  <details key={item.q.en} className="group p-5">
                    <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-bold text-text-primary">
                      <h3>{t(item.q, lang)}</h3>
                      <ArrowDown aria-hidden className="h-5 w-5 shrink-0 text-secondary transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{t(item.a, lang)}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="bg-background py-12 text-center">
          <div className="container mx-auto px-4">
            <Link
              href="/home-services#services"
              className="inline-flex min-h-[52px] items-center gap-2 rounded-xl border-2 border-secondary px-6 py-3 text-[17px] font-bold text-secondary transition-colors hover:bg-secondary hover:text-white"
            >
              <ArrowLeft aria-hidden className="h-5 w-5" />
              {s('backToServices', lang)}
            </Link>
          </div>
        </section>
      </main>

      <ServicesBottomTabs active="home" quoteHref="#request" />
      <Footer />
    </div>
  );
}
