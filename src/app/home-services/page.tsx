import type { Metadata } from "next";
import Link from "next/link";
import {
  Home,
  ArrowRight,
  Phone,
  Mail,
  CheckCircle2,
  ShieldCheck,
  FileCheck2,
  Users,
  GitMerge,
  FileText,
  ClipboardList,
  Building2,
} from "lucide-react";
import HeaderComponent from "@/components/Header";
import Footer from "@/components/Footer";
import ServicesTrustBar from "@/components/services/ServicesTrustBar";
import ServicesBottomTabs from "@/components/services/ServicesBottomTabs";
import ServiceTile from "@/components/services/ServiceTile";
import { HOME_SERVICES } from "@/components/services/serviceData";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Home Services in Northern NJ | Repairs, Audits & Property Care | La Vaca GC",
  description:
    "Residential home services from a licensed NJ general contractor — safety audits, sump tests, weatherstripping, storm prep, paint refreshes, punch-list days, and drywall repair. Limited weekly openings across Bergen, Essex, Morris, and Passaic counties.",
  openGraph: {
    title: "Home Services | La Vaca General Contractors",
    description:
      "Home repairs handled with general-contractor discipline. Licensed, bonded, insured. Northern NJ.",
    type: "website",
    url: "https://www.lavacagc.com/home-services",
    images: [
      {
        url: "https://www.lavacagc.com/logo.png",
        width: 800,
        height: 800,
        alt: "La Vaca General Contractors — Home Services",
      },
    ],
  },
  alternates: { canonical: "https://www.lavacagc.com/home-services" },
};

const REMODELING_LINKS = [
  {
    href: "/services/kitchen-remodeling",
    title: "Kitchen Remodeling",
    body: "Cabinets, countertops, layouts — built right by licensed contractors.",
  },
  {
    href: "/services/bathroom-renovation",
    title: "Bathroom Renovations",
    body: "Tile, fixtures, vanities, walk-in showers — full remodels.",
  },
  {
    href: "/services/basement-finishing",
    title: "Basement Finishing",
    body: "Legal basements, home theaters, wet bars, and more.",
  },
  {
    href: "/services/home-additions",
    title: "Home Additions",
    body: "Architectural planning, permits handled, itemized costs.",
  },
  {
    href: "/services/interior-finishing",
    title: "Interior Finishing",
    body: "Trim, millwork, built-ins, and high-end interior detail work.",
  },
  {
    href: "/services/whole-home-remodeling",
    title: "Whole-Home Remodeling",
    body: "Coordinated room-by-room renovations under one GC team.",
  },
];

export default function HomeServicesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <HeaderComponent />
      <ServicesTrustBar />

      <main id="top" className="flex-grow pb-24 lg:pb-0">
        {/* HERO */}
        <section className="relative overflow-hidden bg-gradient-to-b from-background-soft to-background py-16 md:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 -right-20 h-[540px] w-[540px] rounded-full bg-primary opacity-[0.10] blur-[90px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-24 h-[360px] w-[360px] rounded-full bg-accent-sunset opacity-[0.07] blur-[90px]"
          />
          <div className="container relative mx-auto px-4">
            <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                  <Home className="h-3.5 w-3.5" /> Home Services
                </span>
                <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-text-primary sm:text-5xl md:text-6xl">
                  Home repairs handled with{" "}
                  <span className="bg-gradient-to-r from-primary to-accent-sunset bg-clip-text text-transparent">
                    general-contractor discipline.
                  </span>
                </h1>
                <p className="mt-5 max-w-xl text-lg leading-relaxed text-text-secondary">
                  One trusted team for repairs, prep work, punch lists, and
                  property-care details. We take on a limited number of service
                  visits each week so every job gets proper attention.
                </p>

                <div className="mt-7 flex max-w-md flex-col gap-3.5">
                  <Link
                    href="/request-estimate"
                    className="group flex items-center justify-between gap-4 rounded-xl bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient px-6 py-4 font-bold text-white shadow-button transition-transform hover:-translate-y-[2px]"
                  >
                    <span className="flex flex-col items-start text-left">
                      <span className="text-[17px] leading-tight">Check Availability</span>
                      <span className="text-sm font-semibold opacity-90">Limited weekly service openings</span>
                    </span>
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <a
                    href="tel:+12012124917"
                    className="group flex items-center justify-between gap-4 rounded-xl border-2 border-secondary bg-card px-6 py-4 font-bold text-secondary transition-all hover:-translate-y-[2px] hover:bg-secondary hover:text-white"
                  >
                    <span className="flex flex-col items-start text-left">
                      <span className="text-[17px] leading-tight">Call (201) 212-4917</span>
                      <span className="text-sm font-semibold opacity-85">Talk through your punch list</span>
                    </span>
                    <Phone className="h-5 w-5" />
                  </a>
                </div>

                <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent-teal" /> NJ HIC# 13VH13373800
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent-teal" /> Licensed, bonded &amp; insured
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-accent-teal" /> Northern NJ
                  </span>
                </div>
              </div>

              <aside
                aria-label="How home services work"
                className="rounded-3xl border border-border bg-card p-7 shadow-elegant md:p-9"
              >
                <h3 className="mb-6 text-xs font-extrabold uppercase tracking-widest text-text-primary">
                  How home services work
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    { title: "Scope first", body: "We review the need, photos, access, and constraints before giving direction." },
                    { title: "Clear scope", body: "You know what is included, excluded, and likely to need a trade or permit." },
                    { title: "One contact", body: "Small repairs, punch lists, and coordination stay under one organized process." },
                    { title: "Limited spots", body: "We cap weekly service visits to protect schedule quality and response time." },
                  ].map((card) => (
                    <div
                      key={card.title}
                      className="rounded-xl border border-border bg-background-soft px-5 py-5 transition-all hover:-translate-y-[2px] hover:border-primary/30 hover:bg-card"
                    >
                      <p className="text-[15px] font-extrabold tracking-tight text-text-primary">{card.title}</p>
                      <p className="mt-2 text-xs leading-relaxed text-text-muted">{card.body}</p>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* MINI-TABS */}
        <section className="border-y border-border bg-background py-3.5">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap gap-2.5">
              {[
                { href: "/home-services", label: "Residential", Icon: Home, active: true },
                { href: "/commercial-services", label: "Commercial", Icon: Building2, active: false },
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
                  Homeownership should feel manageable, not like a second job.
                </h2>
                <p className="relative mt-4 text-base leading-relaxed text-white/80">
                  La Vaca Home Services is built for the recurring, practical
                  work that keeps properties safe, presentable, and moving:
                  repairs, prep visits, punch-list days, turnovers, checks,
                  documentation, and seasonal maintenance.
                </p>
              </div>

              <div className="grid gap-5">
                {[
                  {
                    Icon: ShieldCheck,
                    title: "Home care, not bargain handyman work.",
                    body: "Dependable property support from a licensed GC team, not a race to the cheapest service call.",
                  },
                  {
                    Icon: FileCheck2,
                    title: "Every service has coverage notes.",
                    body: "Each card explains what usually fits and what needs a separate quote, trade, or permit.",
                  },
                  {
                    Icon: Users,
                    title: "Specialty trades are coordinated, not hidden.",
                    body: "HVAC, plumbing, new electrical circuits, remediation, and structural work are handled by the right trade when required.",
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

        {/* SERVICE GRID */}
        <section className="bg-background-soft py-16 md:py-24" id="services">
          <div className="container mx-auto px-4">
            <div className="mb-12 grid gap-6 lg:grid-cols-2 lg:items-end lg:gap-14">
              <h2 className="text-3xl font-extrabold leading-[1.1] tracking-tight text-text-primary md:text-4xl lg:text-5xl">
                For homeowners who need{" "}
                <span className="bg-gradient-to-r from-primary to-accent-sunset bg-clip-text text-transparent">
                  one reliable contractor.
                </span>
              </h2>
              <p className="text-lg leading-relaxed text-text-secondary">
                Choose the type of help you need. We confirm the right scope
                after reviewing photos, access, timing, and any trade or permit
                requirements.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {HOME_SERVICES.map((service) => (
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
              Send photos, describe the issue, and we&apos;ll help sort whether
              it&apos;s a quick service visit, a bundled punch-list day, or a
              larger quoted project.
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

        {/* LARGER REMODELING PROJECTS — links to existing /services/[slug] SEO pages */}
        <section className="bg-background py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mb-10 max-w-3xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
                Planning a remodel?
              </span>
              <h2 className="mt-4 text-3xl font-extrabold leading-[1.1] tracking-tight text-text-primary md:text-4xl">
                Larger remodeling projects, handled by the{" "}
                <span className="bg-gradient-to-r from-primary to-accent-sunset bg-clip-text text-transparent">
                  same GC team.
                </span>
              </h2>
              <p className="mt-4 text-base leading-relaxed text-text-secondary">
                If you&apos;re past service-visit scope and into a full
                remodel — kitchen, bath, basement, addition, or whole-home —
                use the dedicated project pages to scope the work and get a
                detailed estimate.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {REMODELING_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group rounded-2xl border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-[3px] hover:border-primary/30 hover:shadow-elegant"
                >
                  <p className="text-[17px] font-extrabold leading-tight tracking-tight text-text-primary">
                    {link.title}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{link.body}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-extrabold uppercase tracking-wider text-primary group-hover:text-primary-dark">
                    Explore service <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
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
              Home service and commercial requests vary based on property
              condition, access, ceiling heights, material selections, parking,
              permits, hidden damage, and whether licensed specialty trades are
              required. We confirm the scope before work starts, document what
              is included, and flag anything that should be quoted separately.
            </p>
          </div>
        </section>

        {/* CLOSER */}
        <section className="bg-background-subtle py-16 md:py-20 text-center">
          <div className="container mx-auto px-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              Ready When You Are
            </span>
            <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-extrabold leading-[1.05] tracking-tight text-text-primary text-balance md:text-4xl lg:text-5xl">
              Send photos. Get a practical plan. Reserve a service opening.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-text-secondary md:text-lg">
              Tell us what you need, attach a few photos, and we&apos;ll confirm
              whether it fits a service visit, a bundled punch-list day, or a
              custom quoted project.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3.5">
              <a
                href="tel:+12012124917"
                className="group inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient px-6 py-4 font-bold text-white shadow-button transition-transform hover:-translate-y-[2px]"
              >
                <span className="flex flex-col items-start text-left">
                  <span className="text-base leading-tight">Call (201) 212-4917</span>
                  <span className="text-xs font-semibold opacity-90">Fastest for urgent items</span>
                </span>
                <Phone className="h-5 w-5" />
              </a>
              <a
                href="mailto:info@lavacagc.com"
                className="inline-flex items-center gap-3 rounded-xl border-2 border-secondary bg-card px-6 py-4 font-bold text-secondary transition-all hover:bg-secondary hover:text-white"
              >
                <span className="flex flex-col items-start text-left">
                  <span className="text-base leading-tight">Email Photos</span>
                  <span className="text-xs font-semibold opacity-80">info@lavacagc.com</span>
                </span>
                <Mail className="h-5 w-5" />
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
              We meet your house or property, you meet your tech, and you decide.
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

      <ServicesBottomTabs active="home" />
      <Footer />
    </div>
  );
}
