import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowDown, ArrowRight, BadgeCheck, MapPin, Phone, ShieldCheck } from 'lucide-react';
import HeaderComponent from '@/components/Header';
import Footer from '@/components/Footer';
import ServicesTrustBar from '@/components/services/ServicesTrustBar';
import ServicesBottomTabs from '@/components/services/ServicesBottomTabs';
import ServiceCatalog from '@/components/home-services/ServiceCatalog';
import AttributionCapture from '@/components/home-services/AttributionCapture';
import LangToggle from '@/components/home-services/LangToggle';
import { s, type StringKey } from '@/lib/home-services/i18n';
import { LANG_COOKIE, resolveLang } from '@/lib/home-services/lang';
import ServiceIcon from '@/components/home-services/ServiceIcon';
import { t, type Lang } from '@/lib/home-services/catalog';
import { getCatalog } from '@/lib/home-services/catalogData';
import Image from 'next/image';
import { withExperiment, type AppliedExperiment } from '@/lib/experiments/withExperiment.server';
import { ExperimentZone } from '@/lib/experiments/ExperimentZone';
import { HOME_SERVICES_SECTIONS, type HomeServicesSection } from '@/lib/experiments/surfaces';
import { brandedTitle, breadcrumbJsonLd, faqJsonLd, jsonLdGraph, languageAlternates, pageUrl, serviceJsonLd } from '@/lib/home-services/seo';
import { jsonLdScript } from '@/lib/jsonLd';

/**
 * /home-services - the seven priced services and the in-page request flow
 * (docs/home-services/acceptance-criteria.md LP1-LP11; audit C1 replaced the
 * nine-tile catalog that used to live here).
 *
 * Rendered per request because the language comes from `?lang=` or the
 * `lv_lang` cookie (LP7). Page copy comes from i18n.ts; service names, prices
 * and descriptions come from the home_services table through getCatalog()
 * (CAT1), and the cards get them as props.
 *
 * Experiments (Phase 2 slice H): the hero copy, the services heading and the
 * order of the sections below the hero come through withExperiment, applied
 * here on the server. Prices never do: they render from the catalog only.
 */

/** Only what the tracker needs on the client: never the payload. */
function zone(exp: AppliedExperiment | null) {
  return exp ? { key: exp.key, variant: exp.variant, track: exp.track } : null;
}

/** The section order a variant names, else the default; any id it does not know is ignored. */
function sectionOrder(exp: AppliedExperiment | null): HomeServicesSection[] {
  const wanted = (exp?.payload.order ?? []).filter((id): id is HomeServicesSection => (HOME_SERVICES_SECTIONS as readonly string[]).includes(id));
  const rest = HOME_SERVICES_SECTIONS.filter((id) => !wanted.includes(id));
  return [...new Set([...wanted, ...rest])];
}

const PHONE_HREF = 'tel:+12012124917';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function pageLang(searchParams: SearchParams): Promise<Lang> {
  const [params, jar] = await Promise.all([searchParams, cookies()]);
  return resolveLang(params.lang, jar.get(LANG_COOKIE)?.value);
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const lang = await pageLang(searchParams);
  const title = brandedTitle(s('metaTitle', lang));
  const description = s('metaDescription', lang);
  const alternates = languageAlternates('/home-services', (await searchParams).lang);
  return {
    title: { absolute: title },
    description,
    alternates,
    openGraph: {
      title,
      description,
      type: 'website',
      url: alternates.canonical,
      locale: lang === 'es' ? 'es_US' : 'en_US',
      images: [{ url: 'https://www.lavacagc.com/logo.png', width: 800, height: 800, alt: 'La Vaca General Contractors' }],
    },
  };
}

const STEPS: Array<[StringKey, StringKey]> = [
  ['step1', 'step1Body'],
  ['step2', 'step2Body'],
  ['step3', 'step3Body'],
  ['step4', 'step4Body'],
];

const FAQ: Array<[StringKey, StringKey]> = [
  ['faqOneStopQ', 'faqOneStopA'],
  ['faqPriceQ', 'faqPriceA'],
  ['faqSpeedQ', 'faqSpeedA'],
  ['faqHomeQ', 'faqHomeA'],
  ['faqPayQ', 'faqPayA'],
];

export default async function HomeServicesPage({ searchParams }: { searchParams: SearchParams }) {
  const [lang, catalog] = await Promise.all([pageLang(searchParams), getCatalog()]);
  const [heroExp, headingExp, sectionsExp] = await Promise.all([
    withExperiment('/home-services', 'hero', lang),
    withExperiment('/home-services', 'services-heading', lang),
    withExperiment('/home-services', 'sections', lang),
  ]);
  const hero = heroExp?.payload.copy ?? {};
  const heading = headingExp?.payload.copy ?? {};
  const langQuery = lang === 'es' ? '?lang=es' : '';
  // The seven Service nodes (same @id as on each service page, provider by the
  // layout's organization @id, no rating), the visible FAQ and the breadcrumb.
  const jsonLd = jsonLdGraph([
    ...catalog.map((service) => serviceJsonLd(service, lang)),
    faqJsonLd(
      FAQ.map(([q, a]) => ({ q: s(q, lang), a: s(a, lang) })),
      pageUrl('/home-services', lang),
    ),
    breadcrumbJsonLd(lang),
  ]);

  const sections: Record<HomeServicesSection, ReactNode> = {
    // The sections below the hero, in their default order (HOME_SERVICES_SECTIONS); a
    // 'sections' experiment may reorder them, never add or drop one.
    'services': (
      <section id="services" aria-labelledby="services-title" className="scroll-mt-20 bg-background-soft py-14 md:py-20">
        <div className="container mx-auto px-4">
          <ExperimentZone experiment={zone(headingExp)} className="mb-8 max-w-2xl">
            <h2 id="services-title" className="text-3xl font-extrabold leading-[1.1] tracking-tight text-text-primary md:text-4xl">
              {heading.heading ?? s('servicesTitle', lang)}
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-text-secondary">{heading.intro ?? s('servicesIntro', lang)}</p>
          </ExperimentZone>
          <ServiceCatalog lang={lang} services={catalog} />
          {/* Phones do not get the hero price list, so each service page is linked here too. */}
          <nav aria-label={s('serviceDetails', lang)} className="mt-8 lg:hidden">
            <p className="text-sm font-bold uppercase tracking-wider text-text-muted">{s('serviceDetails', lang)}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {catalog.map((service) => (
                <li key={service.slug}>
                  <Link
                    href={`/home-services/${service.slug}${langQuery}`}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[15px] font-semibold text-secondary underline-offset-4 hover:underline"
                  >
                    {t(service.name, lang)}
                    <ArrowRight aria-hidden className="h-4 w-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>
    ),
    'how-it-works': (
      <section aria-labelledby="how-title" className="bg-secondary py-14 text-white md:py-20">
        <div className="container mx-auto px-4">
          <h2 id="how-title" className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {s('howItWorks', lang)}
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="rounded-2xl border border-white/15 bg-white/5 p-6">
                <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-base font-extrabold text-secondary">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-extrabold tracking-tight">{s(title, lang)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-white/85">{s(body, lang)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    ),
    'trust': (
      <section aria-labelledby="trust-title" className="bg-background py-14 md:py-16">
        <div className="container mx-auto px-4">
          <h2 id="trust-title" className="text-2xl font-extrabold tracking-tight text-text-primary md:text-3xl">
            {s('trustTitle', lang)}
          </h2>
          <ul className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { Icon: BadgeCheck, key: 'trustHic' as const },
              { Icon: ShieldCheck, key: 'trustInsured' as const },
              { Icon: MapPin, key: 'trustArea' as const },
            ].map(({ Icon, key }) => (
              <li key={key} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-card">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-teal/10 text-accent-teal">
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="text-[15px] font-bold text-text-primary">{s(key, lang)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[15px] leading-relaxed text-text-secondary">{s('areaTowns', lang)}</p>
        </div>
      </section>
    ),
    'faq': (
      <section aria-labelledby="faq-title" className="bg-background-soft py-14 md:py-16">
        <div className="container mx-auto max-w-3xl px-4">
          <h2 id="faq-title" className="text-2xl font-extrabold tracking-tight text-text-primary md:text-3xl">
            {s('faqTitle', lang)}
          </h2>
          <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group p-5">
                <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-bold text-text-primary">
                  <h3>{s(q, lang)}</h3>
                  <ArrowDown aria-hidden className="h-5 w-5 shrink-0 text-secondary transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{s(a, lang)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    ),
    'home-care': (
      <section aria-labelledby="homecare-title" className="bg-background py-14 md:py-20">
        <div className="container mx-auto px-4">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-8 shadow-elegant md:p-12">
            <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine" />
            <p className="text-xs font-bold uppercase tracking-wider text-secondary">{s('homeCareEyebrow', lang)}</p>
            <h2 id="homecare-title" className="mt-3 max-w-2xl text-2xl font-extrabold tracking-tight text-text-primary md:text-3xl">
              {s('homeCareTitle', lang)}
            </h2>
            <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-text-secondary">{s('homeCareBody', lang)}</p>
            <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <span className="rounded-full bg-accent-teal px-4 py-2 text-sm font-extrabold text-white">{s('homeCarePrice', lang)}</span>
              <Link
                href="/home-care"
                className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-secondary px-6 py-3 text-[17px] font-bold text-white transition-transform hover:-translate-y-[1px]"
              >
                {s('homeCareCta', lang)}
                <ArrowRight aria-hidden className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    ),
    'closer': (
      <section aria-labelledby="closer-title" className="bg-background-subtle py-14 text-center md:py-16">
        <div className="container mx-auto px-4">
          <h2 id="closer-title" className="text-2xl font-extrabold tracking-tight text-text-primary md:text-3xl">
            {s('closerTitle', lang)}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[17px] leading-relaxed text-text-secondary">{s('closerBody', lang)}</p>
          <a
            href={PHONE_HREF}
            className="mt-6 inline-flex min-h-[52px] items-center gap-2 rounded-xl border-2 border-secondary bg-card px-6 py-3 text-[17px] font-bold text-secondary transition-colors hover:bg-secondary hover:text-white"
          >
            <Phone aria-hidden className="h-5 w-5" />
            {s('callUs', lang)}
          </a>
        </div>
      </section>
    ),
  };

  return (
    <div id="top" className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <AttributionCapture />
      <HeaderComponent />
      <ServicesTrustBar />

      <main id="main-content" lang={lang} className="flex-grow pb-40 lg:pb-24">
        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-b from-background-soft to-background pb-12 pt-8 md:pb-16 md:pt-12">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-40 h-[440px] w-[440px] rounded-full bg-primary opacity-[0.10] blur-[90px]" />
          <div className="container relative mx-auto px-4">
            <div className="flex justify-end">
              <LangToggle lang={lang} />
            </div>
            <div className="mt-4 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <ExperimentZone experiment={zone(heroExp)} className="max-w-3xl">
              {heroExp?.payload.image && (
                <Image
                  src={heroExp.payload.image}
                  alt={heroExp.payload.copy.imageAlt ?? ''}
                  width={720}
                  height={360}
                  priority
                  className="mb-6 h-auto w-full max-w-xl rounded-2xl object-cover shadow-card"
                />
              )}
              <p className="inline-flex items-center gap-2 rounded-full border border-secondary/20 bg-secondary/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-secondary">
                {hero.eyebrow ?? s('heroEyebrow', lang)}
              </p>
              <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-text-primary sm:text-5xl">
                {hero.title ?? s('heroTitle', lang)}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-text-secondary">{hero.body ?? s('heroBody', lang)}</p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#services"
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-secondary px-6 py-3 text-[17px] font-bold text-white shadow-button transition-transform hover:-translate-y-[1px]"
                >
                  {hero.cta ?? s('heroCta', lang)}
                  <ArrowDown aria-hidden className="h-5 w-5" />
                </a>
                <a
                  href={PHONE_HREF}
                  className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-secondary bg-card px-6 py-3 text-[17px] font-bold text-secondary transition-colors hover:bg-secondary hover:text-white"
                >
                  <Phone aria-hidden className="h-5 w-5" />
                  {s('callUs', lang)}
                </a>
              </div>
            </ExperimentZone>
            {/* Desktop only: the price list at a glance, each linking to its own page. Phones go straight to the cards. */}
            <nav aria-label={s('servicesNav', lang)} className="hidden rounded-3xl border border-border bg-card p-6 shadow-elegant lg:block">
              <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{s('startingAt', lang)}</p>
              <ul className="mt-3 divide-y divide-border">
                {catalog.map((service) => (
                  <li key={service.slug}>
                    <Link
                      href={`/home-services/${service.slug}${langQuery}`}
                      className="flex min-h-[44px] items-center justify-between gap-4 py-2.5 text-[15px] font-semibold text-text-primary hover:text-secondary"
                    >
                      <span className="flex items-center gap-3">
                        <ServiceIcon icon={service.icon} className="h-4 w-4 text-secondary" />
                        {t(service.name, lang)}
                      </span>
                      <span className="font-extrabold">{t(service.priceDisplay, lang)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            </div>
          </div>
        </section>

        <ExperimentZone experiment={zone(sectionsExp)}>
          {sectionOrder(sectionsExp).map((id) => (
            <Fragment key={id}>{sections[id]}</Fragment>
          ))}
        </ExperimentZone>
      </main>

      <ServicesBottomTabs active="home" quoteHref="#services" />
      <Footer />
    </div>
  );
}
