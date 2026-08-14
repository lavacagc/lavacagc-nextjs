import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Route,
  Home,
  Building2,
  ClipboardList,
  ShieldCheck,
  ArrowRight,
  Phone,
  Check,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ServicesTrustBar from "@/components/services/ServicesTrustBar";
import ServicesBottomTabs from "@/components/services/ServicesBottomTabs";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Services Hub | Home & Commercial Property Care",
  description:
    "One place to start. Homeowners and property managers in Northern NJ pick the right track — residential repairs + property care or commercial turnovers, storefronts, and walkthroughs. Both meet the same licensed GC team.",
  openGraph: {
    title: "Services Hub | La Vaca General Contractors",
    description:
      "Home services and commercial property care, routed clearly. Licensed, bonded & insured Northern NJ general contractor.",
    type: "website",
    url: "https://www.lavacagc.com/services",
    images: [
      {
        url: "https://www.lavacagc.com/logo.png",
        width: 800,
        height: 800,
        alt: "La Vaca General Contractors — Services Hub",
      },
    ],
  },
  alternates: { canonical: "https://www.lavacagc.com/services" },
};

const ROUTING_CARDS = [
  {
    Icon: Home,
    title: "Home",
    body:
      "Punch lists, repairs, prep work, safety checks, and seasonal property-care details.",
    tone: "home" as const,
  },
  {
    Icon: Building2,
    title: "Business",
    body:
      "Tenant make-ready, storefront refreshes, CCO prep, documentation, walkthroughs.",
    tone: "biz" as const,
  },
  {
    Icon: ClipboardList,
    title: "Quote",
    body: "One request flow routes the lead based on property type and service interest.",
    tone: "home" as const,
  },
  {
    Icon: ShieldCheck,
    title: "GC discipline",
    body: "Limited weekly service openings, scope review, and clear next steps.",
    tone: "biz" as const,
  },
];

export default function ServicesHubPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <ServicesTrustBar />

      <main id="top" className="flex-grow pb-24 lg:pb-0">
        {/* HERO IMAGE BAND */}
        <section
          aria-hidden="true"
          className="relative w-full overflow-hidden"
        >
          <div className="relative aspect-[16/9] w-full sm:aspect-[16/7] lg:aspect-[1832/859]">
            <Image
              src="/images/hub-hero.png"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/95" />
          </div>
        </section>

        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-b from-background-soft via-background to-background-subtle py-16 md:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 -right-20 h-[520px] w-[520px] rounded-full bg-primary opacity-[0.10] blur-[90px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-24 h-[380px] w-[380px] rounded-full bg-accent-sunset opacity-[0.07] blur-[90px]"
          />
          <div className="container relative mx-auto px-4">
            <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                  <Route className="h-3.5 w-3.5" /> Services Hub
                </span>
                <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-text-primary sm:text-5xl md:text-6xl">
                  Home services and commercial property care,{" "}
                  <span className="bg-gradient-to-r from-primary to-accent-sunset bg-clip-text text-transparent">
                    routed clearly.
                  </span>
                </h1>
                <p className="mt-5 max-w-xl text-lg leading-relaxed text-text-secondary">
                  One place to start. Homeowners who need practical property
                  support go one way; landlords and property managers who need
                  documented commercial work go the other. Both meet the same
                  licensed GC team.
                </p>

                <div className="mt-8 flex max-w-md flex-col gap-3.5">
                  <Link
                    href="/home-services"
                    className="group flex items-center justify-between gap-4 rounded-xl bg-gradient-to-br from-primary to-accent-tangerine px-6 py-4 font-bold text-white shadow-button transition-all hover:-translate-y-[2px] hover:shadow-elegant"
                  >
                    <span className="flex flex-col items-start text-left">
                      <span className="text-[17px] leading-tight">Home Services</span>
                      <span className="text-sm font-semibold opacity-85">Residential repairs + property care</span>
                    </span>
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href="/commercial-services"
                    className="group flex items-center justify-between gap-4 rounded-xl border-2 border-secondary bg-card px-6 py-4 font-bold text-secondary transition-all hover:-translate-y-[2px] hover:bg-secondary hover:text-white"
                  >
                    <span className="flex flex-col items-start text-left">
                      <span className="text-[17px] leading-tight">Commercial Services</span>
                      <span className="text-sm font-semibold opacity-85">Turnovers, storefronts + walkthroughs</span>
                    </span>
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>

              <aside
                aria-label="What the hub routes to"
                className="rounded-3xl border border-border bg-card p-4 shadow-elegant"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {ROUTING_CARDS.map(({ Icon, title, body, tone }) => (
                    <div
                      key={title}
                      className="group relative rounded-2xl border border-border bg-background-soft p-6 transition-all hover:-translate-y-[2px] hover:border-primary/30 hover:bg-card hover:shadow-card"
                    >
                      <div
                        className={`mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl ${
                          tone === "home"
                            ? "bg-gradient-to-br from-primary/15 to-accent-tangerine/10 text-primary"
                            : "bg-gradient-to-br from-secondary/12 to-accent-teal/10 text-secondary"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="text-base font-extrabold tracking-tight text-text-primary">
                        {title}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
                        {body}
                      </p>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* RECOMMENDED FLOW */}
        <section className="py-16 md:py-24" id="flow">
          <div className="container mx-auto px-4">
            <div className="mb-12 grid gap-6 lg:grid-cols-2 lg:items-end lg:gap-14">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                  Recommended Flow
                </span>
                <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] tracking-tight text-text-primary md:text-4xl lg:text-5xl">
                  One hub, two dedicated service tracks,{" "}
                  <span className="bg-gradient-to-r from-primary to-accent-sunset bg-clip-text text-transparent">
                    one intake form.
                  </span>
                </h2>
              </div>
              <p className="text-lg leading-relaxed text-text-secondary">
                This keeps the lightweight hub homeowners and managers expect, but
                pushes everyone into the right dedicated page — so the request
                that lands is already shaped around the work you actually need.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  num: 1,
                  title: "Main Services Hub",
                  body: "Short chooser page that explains Home vs Business and links to each dedicated page.",
                  href: "#top",
                  cta: "You are here",
                },
                {
                  num: 2,
                  title: "Home Services",
                  body: "Dedicated residential page: repairs, prep, punch lists, audits, paint, drywall, sump, property-care.",
                  href: "/home-services",
                  cta: "Open page",
                },
                {
                  num: 3,
                  title: "Commercial Services",
                  body: "Dedicated commercial page: make-ready, storefront refresh, CCO prep, documentation, dispatch, walkthroughs.",
                  href: "/commercial-services",
                  cta: "Open page",
                },
                {
                  num: 4,
                  title: "Intake Form",
                  body: "Property type first, then service interests, location and note, timing and call window.",
                  href: "/request-estimate",
                  cta: "Open form",
                },
              ].map((step) => (
                <article
                  key={step.num}
                  className="flex flex-col rounded-2xl border border-border bg-card p-7 shadow-card transition-all hover:-translate-y-[4px] hover:border-primary/30 hover:shadow-elegant"
                >
                  <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent-tangerine text-base font-extrabold text-white shadow-[0_4px_12px_-2px_rgba(238,150,57,0.35)]">
                    {step.num}
                  </div>
                  <h3 className="mb-2 text-[17px] font-extrabold leading-tight tracking-tight text-text-primary">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-text-muted">{step.body}</p>
                  {step.href.startsWith("#") ? (
                    <a
                      href={step.href}
                      className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-extrabold uppercase tracking-wider text-primary hover:text-primary-dark"
                    >
                      {step.cta} <Check className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <Link
                      href={step.href}
                      className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-extrabold uppercase tracking-wider text-primary hover:text-primary-dark"
                    >
                      {step.cta} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CLOSER — navy band */}
        <section className="relative overflow-hidden bg-secondary py-16 md:py-20 text-center text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 18% 30%, rgba(238,150,57,0.18), transparent 40%), radial-gradient(circle at 82% 70%, rgba(255,111,49,0.12), transparent 40%)",
            }}
          />
          <div className="container relative mx-auto px-4">
            <h2 className="text-3xl font-extrabold leading-[1.1] tracking-tight md:text-4xl lg:text-5xl">
              Not sure which track fits your property?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
              Send the address, a few photos, and what you need handled.
              We&apos;ll confirm whether it&apos;s a residential service visit or a
              documented commercial scope — and route it to the right team
              before anyone shows up.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3.5">
              <Link
                href="/request-estimate"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient px-6 py-3.5 text-base font-bold text-white shadow-button"
              >
                Request Availability
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="tel:+12012124917"
                className="inline-flex items-center gap-2 rounded-xl border border-white/45 px-6 py-3.5 text-base font-bold text-white transition-all hover:border-white hover:bg-white hover:text-secondary"
              >
                <Phone className="h-4 w-4" />
                (201) 212-4917
              </a>
            </div>
          </div>
        </section>
      </main>

      <ServicesBottomTabs active="top" />
      <Footer />
    </div>
  );
}
