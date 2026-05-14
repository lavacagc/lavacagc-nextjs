import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  Building2,
  ArrowRight,
  Phone,
  CheckCircle2,
  Home,
  GitMerge,
  FileText,
  ClipboardList,
  ShieldCheck,
  FileCheck2,
  Users,
} from "lucide-react";
import HeaderComponent from "@/components/Header";
import Footer from "@/components/Footer";
import ServicesTrustBar from "@/components/services/ServicesTrustBar";
import ServicesBottomTabs from "@/components/services/ServicesBottomTabs";
import ServiceTile from "@/components/services/ServiceTile";
import ServiceImageGrid from "@/components/services/ServiceImageGrid";
import { COMMERCIAL_SERVICES } from "@/components/services/serviceData";

const COMMERCIAL_IMAGE_CARDS = [
  {
    src: "/images/commercial-card-make-ready.png",
    alt: "Empty retail unit freshly painted and ready for the next tenant.",
    label: "Tenant make-ready",
    description: "Turnover work, finishes, and a clean walkthrough before move-in.",
  },
  {
    src: "/images/commercial-card-storefront.png",
    alt: "Contractor refreshing the trim above a Northern NJ storefront entry.",
    label: "Storefront refresh",
    description: "Front-of-house finish work that lifts a property without a full reno.",
  },
  {
    src: "/images/commercial-card-dispatch.png",
    alt: "Contractor documenting a small commercial property after a storm.",
    label: "Storm / emergency dispatch",
    description: "Priority response with first-hour stabilization and an insurance-ready report.",
  },
  {
    src: "/images/commercial-card-walkthrough.png",
    alt: "Contractor photographing a wall corner during a commercial property walkthrough.",
    label: "Documentation & walkthroughs",
    description: "Defensible photo + written records for landlord-tenant and lender contexts.",
  },
];

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Commercial Property Services in NJ | Make-Ready, CCO Prep, Documentation | La Vaca GC",
  description:
    "Documented commercial property care for Northern NJ landlords and property managers — tenant make-ready, storefront refresh, CCO pre-inspection, move-in/move-out documentation, storm dispatch, and property walkthroughs from a licensed GC.",
  openGraph: {
    title: "Commercial Services | La Vaca General Contractors",
    description:
      "Fast, documented work for landlords and property managers in Northern NJ.",
    type: "website",
    url: "https://www.lavacagc.com/commercial-services",
    images: [
      {
        url: "https://www.lavacagc.com/logo.png",
        width: 800,
        height: 800,
        alt: "La Vaca General Contractors — Commercial Services",
      },
    ],
  },
  alternates: { canonical: "https://www.lavacagc.com/commercial-services" },
};

export default function CommercialServicesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <HeaderComponent />
      <ServicesTrustBar />

      <main id="top" className="flex-grow pb-24 lg:pb-0">
        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-b from-background-soft to-background py-16 md:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 -right-20 h-[540px] w-[540px] rounded-full bg-secondary opacity-[0.08] blur-[90px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-24 h-[360px] w-[360px] rounded-full bg-accent-teal opacity-[0.07] blur-[90px]"
          />
          <div className="container relative mx-auto px-4">
            <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-secondary">
                  <Building2 className="h-3.5 w-3.5" /> Commercial Services
                </span>
                <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-text-primary sm:text-5xl md:text-6xl">
                  Fast, documented work for{" "}
                  <span className="bg-gradient-to-r from-primary to-accent-sunset bg-clip-text text-transparent">
                    landlords and property managers.
                  </span>
                </h1>
                <p className="mt-5 max-w-xl text-lg leading-relaxed text-text-secondary">
                  Property support for turnovers, storefront refreshes,
                  inspections, documentation, and urgent coordination. Best fit
                  for small-to-mid-size Northern NJ properties that need a
                  dependable local GC partner.
                </p>

                <div className="mt-7 flex max-w-md flex-col gap-3.5">
                  <Link
                    href="/request-estimate"
                    className="group flex items-center justify-between gap-4 rounded-xl bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient px-6 py-4 font-bold text-white shadow-button transition-transform hover:-translate-y-[2px]"
                  >
                    <span className="flex flex-col items-start text-left">
                      <span className="text-[17px] leading-tight">Request Commercial Support</span>
                      <span className="text-sm font-semibold opacity-90">Limited service openings</span>
                    </span>
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <a
                    href="tel:+12012124917"
                    className="group flex items-center justify-between gap-4 rounded-xl border-2 border-secondary bg-card px-6 py-4 font-bold text-secondary transition-all hover:-translate-y-[2px] hover:bg-secondary hover:text-white"
                  >
                    <span className="flex flex-col items-start text-left">
                      <span className="text-[17px] leading-tight">Call (201) 212-4917</span>
                      <span className="text-sm font-semibold opacity-85">Talk through the property</span>
                    </span>
                    <Phone className="h-5 w-5" />
                  </a>
                </div>

                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent-teal" /> Documented visits
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent-teal" /> Commercial property support
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent-teal" /> Northern NJ
                  </span>
                </div>
              </div>

              <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border bg-background-soft shadow-elegant">
                <Image
                  src="/images/commercial-services-hero.png"
                  alt="Property manager and a La Vaca contractor meeting at the entrance of a Northern NJ storefront."
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* MINI-TABS */}
        <section className="border-y border-border bg-background py-3.5">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap gap-2.5">
              {[
                { href: "/home-services", label: "Residential", Icon: Home, active: false },
                { href: "/commercial-services", label: "Commercial", Icon: Building2, active: true },
                { href: "#process", label: "Process", Icon: GitMerge, active: false, anchor: true },
                { href: "#scope", label: "Scope notes", Icon: FileText, active: false, anchor: true },
                { href: "/request-estimate", label: "Request quote", Icon: ClipboardList, active: false },
              ].map(({ href, label, Icon, active, anchor }) => {
                const Tag = anchor ? "a" : Link;
                return (
                  <Tag
                    key={label}
                    href={href}
                    className={
                      active
                        ? "inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-accent-tangerine px-4 py-2 text-sm font-bold text-white shadow-button"
                        : "inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-text-secondary transition-all hover:border-primary hover:text-primary"
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </Tag>
                );
              })}
            </div>
          </div>
        </section>

        {/* PHILOSOPHY */}
        <section className="bg-background py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="grid items-stretch gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
              <div className="relative overflow-hidden rounded-3xl bg-secondary p-8 text-white shadow-[0_20px_40px_-12px_rgba(0,40,85,0.18)] md:p-10">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-20 -right-20 h-60 w-60 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(238,150,57,0.18), transparent 65%)",
                  }}
                />
                <h2 className="relative text-2xl font-extrabold leading-[1.1] tracking-tight text-balance md:text-3xl lg:text-4xl">
                  A documented GC partner for Northern NJ property owners.
                </h2>
                <p className="relative mt-4 text-base leading-relaxed text-white/80">
                  La Vaca Commercial Services is built for the recurring work
                  that keeps small-to-mid-size commercial properties
                  presentable, leased, and inspection-ready: make-ready
                  turnovers, storefront refreshes, CCO prep, tenant
                  documentation, urgent dispatch, and structured walkthroughs.
                </p>
              </div>

              <div className="grid gap-5">
                {[
                  {
                    Icon: ShieldCheck,
                    title: "Single licensed GC, single invoice.",
                    body: "One contract, one point of contact, and trades coordinated under one schedule.",
                  },
                  {
                    Icon: FileCheck2,
                    title: "Documented work product.",
                    body: "Photo logs, written reports, and condition narratives — formatted to defend in NJ landlord-tenant and lender contexts.",
                  },
                  {
                    Icon: Users,
                    title: "Specialty trades coordinated, not hidden.",
                    body: "HVAC, plumbing, electrical, and structural work are handled by the right trade when required.",
                  },
                ].map(({ Icon, title, body }, i, arr) => (
                  <div
                    key={title}
                    className={`grid grid-cols-[28px_1fr] items-start gap-4 ${
                      i < arr.length - 1 ? "border-b border-border pb-5" : ""
                    }`}
                  >
                    <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[17px] font-extrabold tracking-tight text-text-primary">{title}</p>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-text-secondary">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* IMAGE CARD GRID — visual entry into the service catalog */}
        <ServiceImageGrid
          eyebrow="Common requests"
          title="The work landlords and managers ask us about."
          intro="Four representative engagements that fit a typical commercial week — see the full catalog below for everything in scope."
          items={COMMERCIAL_IMAGE_CARDS}
        />

        {/* SERVICE GRID */}
        <section className="bg-background-soft py-16 md:py-24" id="services">
          <div className="container mx-auto px-4">
            <div className="mb-12 grid gap-6 lg:grid-cols-2 lg:items-end lg:gap-14">
              <h2 className="text-3xl font-extrabold leading-[1.1] tracking-tight text-text-primary md:text-4xl lg:text-5xl">
                Commercial services that keep properties{" "}
                <span className="bg-gradient-to-r from-primary to-accent-sunset bg-clip-text text-transparent">
                  ready, documented, and presentable.
                </span>
              </h2>
              <p className="text-lg leading-relaxed text-text-secondary">
                Separate from homeowner services so business owners, landlords,
                and property managers can get to the right scope quickly.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {COMMERCIAL_SERVICES.map((service) => (
                <ServiceTile key={service.slug} service={service} />
              ))}
            </div>
          </div>
        </section>

        {/* PROCESS — navy band */}
        <section className="bg-secondary py-16 md:py-20 text-white" id="process">
          <div className="container mx-auto px-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-light">
              Our Process
            </span>
            <h2 className="mt-4 text-3xl font-extrabold leading-[1.05] tracking-tight md:text-4xl lg:text-5xl">
              A better way to handle the small stuff.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/75">
              Send the address, photos, and timing, and we&apos;ll sort whether
              it fits a documented service visit or needs a custom quoted scope.
            </p>

            <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { num: 1, title: "Send photos", body: "Show us the issue, access, and property condition." },
                { num: 2, title: "Confirm scope", body: "We flag what fits, what doesn't, and what needs a trade." },
                { num: 3, title: "Schedule visit", body: "Limited openings keep the schedule reliable." },
                { num: 4, title: "Document work", body: "You get clear notes on what was handled." },
              ].map(({ num, title, body }) => (
                <div
                  key={num}
                  className="rounded-2xl border border-white/12 bg-white/5 p-6 transition-all hover:-translate-y-[2px] hover:border-primary/45"
                >
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-primary-light">
                    Step {num}
                  </p>
                  <h3 className="mt-3 text-[17px] font-extrabold tracking-tight">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SCOPE NOTES */}
        <section className="bg-background-soft py-16" id="scope">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-extrabold leading-[1.1] tracking-tight text-text-primary md:text-3xl lg:text-4xl">
              Scope notes that belong on the page.
            </h2>
            <p className="mt-4 max-w-4xl text-base leading-relaxed text-text-secondary">
              Commercial requests vary based on property condition, occupancy,
              ceiling heights, material selections, parking, permits, hidden
              damage, and whether licensed specialty trades are required. We
              confirm the scope before work starts, document what is included,
              and flag anything that should be quoted separately.
            </p>
          </div>
        </section>

        {/* CLOSER */}
        <section className="bg-background py-16 md:py-20 text-center">
          <div className="container mx-auto px-4">
            <h2 className="mx-auto max-w-3xl text-3xl font-extrabold leading-[1.05] tracking-tight text-text-primary text-balance md:text-4xl lg:text-5xl">
              Send the address, photos, and timing.{" "}
              <span className="bg-gradient-to-r from-primary to-accent-sunset bg-clip-text text-transparent">
                We&apos;ll confirm
              </span>{" "}
              whether it fits a service visit or needs a custom quote.
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3.5">
              <Link
                href="/request-estimate"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient px-6 py-3.5 text-base font-bold text-white shadow-button"
              >
                Request a Walkthrough
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="tel:+12012124917"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-secondary px-6 py-3.5 text-base font-bold text-secondary transition-all hover:bg-secondary hover:text-white"
              >
                <Phone className="h-4 w-4" />
                (201) 212-4917
              </a>
            </div>
          </div>
        </section>

        {/* GUARANTEE — navy band */}
        <section className="relative overflow-hidden bg-secondary py-16 text-center text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 18% 30%, rgba(238,150,57,0.16), transparent 40%), radial-gradient(circle at 82% 70%, rgba(255,111,49,0.10), transparent 40%)",
            }}
          />
          <div className="container relative mx-auto px-4">
            <h2 className="text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
              Free 30-Minute Walk-Through.{" "}
              <span className="bg-gradient-to-r from-primary to-accent-sunset bg-clip-text text-transparent">
                No commitment.
              </span>
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-white/80">
              We meet your property, you meet your tech, and you decide.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3.5">
              <Link
                href="/request-estimate"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient px-6 py-3.5 text-base font-bold text-white shadow-button"
              >
                Schedule Your Walk-Through
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

      <ServicesBottomTabs active="commercial" />
      <Footer />
    </div>
  );
}
