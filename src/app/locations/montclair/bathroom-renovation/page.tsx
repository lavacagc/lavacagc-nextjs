import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ClipboardCheck, Hammer, Home, MapPin } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BUSINESS_INFO } from "@/components/StructuredData";

const town = "Montclair";
const service = "Bathroom Renovation";
const slug = "montclair/bathroom-renovation";
const canonicalUrl = `${BUSINESS_INFO.url}/locations/${slug}`;
const targetKeyword = "bathroom renovation in Montclair NJ";

export const metadata: Metadata = {
  title: `${service} in ${town}, NJ | La Vaca General Contractors`,
  description:
    "Bathroom renovation in Montclair, NJ for older homes, primary suites, hall baths, and tile showers. Licensed NJ contractor, se habla español, serving Essex County.",
  keywords: [targetKeyword, "Montclair bathroom remodel", "bathroom contractor Montclair NJ"],
  alternates: {
    canonical: canonicalUrl,
  },
  openGraph: {
    title: `${service} in ${town}, NJ | La Vaca General Contractors`,
    description:
      "Plan a cleaner, better-built Montclair bathroom renovation with La Vaca General Contractors.",
    url: canonicalUrl,
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "GeneralContractor",
  "@id": `${canonicalUrl}#localbusiness`,
  name: `${BUSINESS_INFO.name} - ${service} in ${town}`,
  alternateName: BUSINESS_INFO.alternateName,
  description:
    "Licensed bathroom renovation contractor serving Montclair, NJ and nearby Essex County homes.",
  url: canonicalUrl,
  logo: BUSINESS_INFO.logo,
  image: BUSINESS_INFO.logo,
  telephone: BUSINESS_INFO.telephone,
  email: BUSINESS_INFO.email,
  address: {
    "@type": "PostalAddress",
    addressLocality: BUSINESS_INFO.address.addressLocality,
    addressRegion: BUSINESS_INFO.address.addressRegion,
    postalCode: BUSINESS_INFO.address.postalCode,
    addressCountry: BUSINESS_INFO.address.addressCountry,
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: BUSINESS_INFO.geo.latitude,
    longitude: BUSINESS_INFO.geo.longitude,
  },
  areaServed: [
    {
      "@type": "City",
      name: `${town}, NJ`,
    },
    ...BUSINESS_INFO.serviceAreas.map((area) => ({
      "@type": "AdministrativeArea",
      name: `${area.name}, ${area.state}`,
    })),
  ],
  serviceArea: {
    "@type": "GeoCircle",
    geoMidpoint: {
      "@type": "GeoCoordinates",
      latitude: BUSINESS_INFO.geo.latitude,
      longitude: BUSINESS_INFO.geo.longitude,
    },
    geoRadius: "40000",
  },
  hasCredential: {
    "@type": "EducationalOccupationalCredential",
    credentialCategory: "NJ Home Improvement Contractor License",
    name: BUSINESS_INFO.license,
  },
  serviceType: service,
  priceRange: BUSINESS_INFO.priceRange,
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: BUSINESS_INFO.aggregateRating.ratingValue,
    reviewCount: BUSINESS_INFO.aggregateRating.reviewCount,
    bestRating: BUSINESS_INFO.aggregateRating.bestRating,
    worstRating: BUSINESS_INFO.aggregateRating.worstRating,
  },
  sameAs: BUSINESS_INFO.socialProfiles,
};

const reasons = [
  "Licensed, insured bathroom renovation work under BUSINESS_INFO.license with a written scope before construction starts.",
  "Clear communication for busy Montclair homeowners, including se habla español for families who prefer Spanish project updates.",
  "Practical Essex County experience with older homes, tight access, tile details, ventilation, waterproofing, and permit coordination.",
];

const processSteps = [
  {
    title: "Measure the space and define the scope",
    text: "We walk the bathroom, inspect the existing plumbing and electrical conditions, document access constraints, and separate must-have repairs from design upgrades.",
  },
  {
    title: "Plan selections before demolition",
    text: "Tile, fixtures, vanities, lighting, mirrors, glass, and hardware are clarified early so the project is not held up by missing materials.",
  },
  {
    title: "Protect the home and build in sequence",
    text: "Dust control, demolition, rough work, waterproofing, tile, trim, paint, and final fixtures are coordinated so the job moves cleanly and predictably.",
  },
  {
    title: "Review details before closeout",
    text: "We review grout lines, caulk, hardware alignment, ventilation, glass fit, drains, and final punch items before calling the bathroom complete.",
  },
];

const faqs = [
  {
    question: "How long does a bathroom renovation in Montclair usually take?",
    answer:
      "A straightforward hall bathroom often takes a few weeks once materials are ready. Primary bathrooms, custom tile, structural surprises, or layout changes can take longer. The biggest schedule driver is usually selection readiness, not demolition speed.",
  },
  {
    question: "Do Montclair bathroom remodels need permits?",
    answer:
      "Many bathroom projects need permits when plumbing, electrical, ventilation, or layout changes are involved. Cosmetic updates are different. La Vaca helps identify the permit path during planning so the scope is handled correctly.",
  },
  {
    question: "Can you renovate bathrooms in older Montclair homes?",
    answer:
      "Yes. Montclair has many older homes with framing, plaster, plumbing, subfloor, and ventilation conditions that need careful sequencing. We plan for those realities instead of treating every bathroom like new construction.",
  },
  {
    question: "Can we keep the same bathroom layout to control cost?",
    answer:
      "Usually, yes. Keeping the toilet, shower, and vanity in the same general locations often reduces plumbing and framing work. We can still improve storage, lighting, waterproofing, tile, and fixtures without moving every wall or drain.",
  },
  {
    question: "Does La Vaca serve only Montclair?",
    answer:
      "No. La Vaca is a service-area contractor serving Montclair and nearby communities across Essex, Morris, and Bergen Counties. Montclair pages help homeowners find local information, but the team works throughout Northern New Jersey.",
  },
];

export default function MontclairBathroomRenovationPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950">
      <Header />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
      />

      <main>
        <section className="relative overflow-hidden bg-slate-950 text-white">
          {/* TODO: Replace gradient with town-specific photo path for a completed Montclair bathroom renovation. */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.35),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(15,23,42,0.88))]" />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-[1.2fr_0.8fr] md:px-6 md:py-28">
            <div>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-orange-100">
                <MapPin className="h-4 w-4" /> Essex County bathroom contractor
              </p>
              <h1 className="max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">
                {service} in {town}, NJ | La Vaca General Contractors
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-200 md:text-xl">
                Bathroom renovation in Montclair should respect the home you already love while fixing the parts that no longer work. La Vaca plans tile, waterproofing, fixtures, storage, ventilation, and finish details with the practical care older Essex County homes deserve.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/free-estimate?utm_source=town-page&utm_medium=seo&utm_campaign=montclair-bathroom-renovation"
                  className="rounded-full bg-orange-500 px-6 py-3 text-center font-semibold text-white shadow-lg shadow-orange-950/30 transition hover:bg-orange-600"
                >
                  Request a Free Estimate
                </Link>
                <Link
                  href="/portfolio"
                  className="rounded-full border border-white/25 px-6 py-3 text-center font-semibold text-white transition hover:bg-white/10"
                >
                  View Recent Work
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur">
              <h2 className="text-2xl font-semibold">Built for Montclair bathrooms</h2>
              <ul className="mt-6 space-y-4 text-slate-100">
                <li className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-orange-300" /> Waterproofing and tile sequencing for showers, tubs, and floors</li>
                <li className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-orange-300" /> Fixture, vanity, glass, lighting, and ventilation coordination</li>
                <li className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-orange-300" /> Licensed NJ contractor: {BUSINESS_INFO.license}</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">Why Montclair homeowners choose La Vaca</p>
            <h2 className="mt-3 text-3xl font-bold md:text-4xl">A cleaner process for a room that gets used every day</h2>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {reasons.map((reason) => (
              <div key={reason} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <CheckCircle2 className="h-6 w-6 text-orange-500" />
                <p className="mt-4 leading-7 text-slate-700">{reason.replace("BUSINESS_INFO.license", BUSINESS_INFO.license)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-slate-50 py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">{service} in {town}: what to expect</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold md:text-4xl">Four steps from dated bathroom to a finished, usable space</h2>
            <div className="mt-10 grid gap-6 md:grid-cols-4">
              {processSteps.map((step, index) => (
                <div key={step.title} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 font-bold text-orange-700">{index + 1}</div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-3xl bg-orange-50 p-8 ring-1 ring-orange-100">
              <Home className="h-10 w-10 text-orange-600" />
              <h2 className="mt-4 text-2xl font-bold">Local context matters</h2>
              <p className="mt-4 leading-7 text-slate-700">
                Montclair homes range from historic colonials and tudors to renovated multifamily properties, condos, and larger single-family homes near Upper Montclair, Watchung Plaza, Walnut Street, and South End. Bathrooms in these homes often need more than surface updates: subfloors may need correction, old plumbing may need thoughtful access, and ventilation can be limited by original layouts.
              </p>
            </div>
            <div className="space-y-5 text-lg leading-8 text-slate-700">
              <p>
                A strong Montclair bathroom renovation starts by respecting those constraints. Moving a drain, opening a wall, or switching from a tub to a walk-in shower can be the right choice, but only after the existing conditions are understood. That is why La Vaca focuses on planning, waterproofing, material readiness, and clear sequencing before the room is torn apart.
              </p>
              <p>
                For homeowners preparing a primary suite, updating a hall bath before resale, or making a small bathroom feel brighter and easier to clean, the goal is the same: durable work, clean finishes, and a process that does not turn the rest of the house into a job site. Our team serves Montclair and surrounding Essex County communities, and se habla español.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-slate-950 py-16 text-white md:py-20">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <ClipboardCheck className="h-7 w-7 text-orange-300" />
                <h3 className="mt-4 text-xl font-semibold">Plan before demo</h3>
                <p className="mt-3 text-slate-300">Selections, lead times, and scope are clarified early so the project is not guessing its way forward.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <Hammer className="h-7 w-7 text-orange-300" />
                <h3 className="mt-4 text-xl font-semibold">Build the hidden layers right</h3>
                <p className="mt-3 text-slate-300">Waterproofing, substrate prep, rough plumbing, electrical, and ventilation matter as much as the tile you see.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <CheckCircle2 className="h-7 w-7 text-orange-300" />
                <h3 className="mt-4 text-xl font-semibold">Finish with accountability</h3>
                <p className="mt-3 text-slate-300">Punch-list details are reviewed before closeout so the finished bathroom feels complete.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 md:px-6 md:py-20">
          <h2 className="text-3xl font-bold md:text-4xl">Bathroom renovation FAQs for Montclair homeowners</h2>
          <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {faqs.map((faq) => (
              <div key={faq.question} className="p-6">
                <h3 className="text-lg font-semibold">{faq.question}</h3>
                <p className="mt-3 leading-7 text-slate-700">{faq.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-orange-50 py-16 md:py-20">
          <div className="mx-auto max-w-4xl px-4 text-center md:px-6">
            <h2 className="text-3xl font-bold md:text-4xl">Ready to plan your Montclair bathroom renovation?</h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-slate-700">
              Tell us what is working, what is frustrating, and what you want the finished bathroom to feel like. We will help you turn that into a clear scope.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/free-estimate?utm_source=town-page&utm_medium=seo&utm_campaign=montclair-bathroom-renovation"
                className="rounded-full bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600"
              >
                Start Your Free Estimate
              </Link>
              <Link href="/locations/montclair" className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-50">
                Montclair Service Area
              </Link>
              <Link href="/reviews" className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-50">
                Read Reviews
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
