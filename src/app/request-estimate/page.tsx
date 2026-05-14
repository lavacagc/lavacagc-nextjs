import type { Metadata } from "next";
import { CalendarCheck, ShieldCheck, FileText, MapPin } from "lucide-react";
import HeaderComponent from "@/components/Header";
import Footer from "@/components/Footer";
import ServicesTrustBar from "@/components/services/ServicesTrustBar";
import RequestEstimateForm from "@/components/services/RequestEstimateForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Request a Service Opening | La Vaca General Contractors",
  description:
    "Tell us what you need. We'll confirm the right visit — residential or commercial — and follow up within one business day. Limited weekly service openings in Northern NJ.",
  openGraph: {
    title: "Request a Service Opening | La Vaca General Contractors",
    description:
      "Tell us what you need. We'll confirm the right visit.",
    type: "website",
    url: "https://www.lavacagc.com/request-estimate",
  },
  alternates: { canonical: "https://www.lavacagc.com/request-estimate" },
};

export default function RequestEstimatePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <HeaderComponent />
      <ServicesTrustBar />

      <main
        id="top"
        className="relative overflow-hidden flex-grow py-16 md:py-20"
        style={{
          background:
            "radial-gradient(circle at 90% -10%, rgba(238,150,57,0.10), transparent 38%), linear-gradient(180deg, hsl(var(--background-soft)) 0%, hsl(var(--background)) 70%)",
        }}
      >
        <div className="container relative mx-auto px-4">
          <div className="mx-auto mb-10 max-w-2xl text-center md:mb-12">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <CalendarCheck className="h-3.5 w-3.5" /> Request a Service Opening
            </span>
            <h1 className="mt-5 text-3xl font-extrabold leading-[1.05] tracking-tight text-text-primary text-balance sm:text-4xl md:text-5xl">
              Tell us what you need.{" "}
              <span className="bg-gradient-to-r from-primary to-accent-sunset bg-clip-text text-transparent">
                We&apos;ll confirm the right visit.
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-text-secondary md:text-lg">
              Answer a few quick questions so we know whether you need
              residential or commercial support, what items matter most, and
              when you&apos;re available for a call.
            </p>
          </div>

          <div className="grid gap-7 lg:grid-cols-[0.85fr_1.15fr]">
            {/* Left sidecard */}
            <aside
              aria-label="How the intake works"
              className="relative flex flex-col overflow-hidden rounded-3xl bg-secondary p-8 text-white shadow-[0_20px_40px_-12px_rgba(0,40,85,0.18)] md:p-9"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(238,150,57,0.20), transparent 65%)",
                }}
              />
              <h2 className="relative text-2xl font-extrabold leading-[1.15] tracking-tight text-balance">
                Limited weekly service spots.
              </h2>
              <p className="relative mt-3 text-[15px] leading-relaxed text-white/80">
                We cap service visits so the schedule stays reliable and every
                request gets reviewed before anyone shows up.
              </p>

              <div className="relative mt-7 grid gap-3.5">
                {[
                  { num: 1, body: "Choose residential or commercial service." },
                  { num: 2, body: "Check off the items you're interested in." },
                  { num: 3, body: "Tell us your timing and best call windows." },
                  { num: 4, body: "We review photos, scope, and availability before booking." },
                ].map(({ num, body }) => (
                  <div key={num} className="grid grid-cols-[32px_1fr] items-start gap-3.5 py-1">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent-tangerine text-sm font-extrabold text-white shadow-[0_4px_10px_-2px_rgba(238,150,57,0.45)]">
                      {num}
                    </div>
                    <p className="mt-1 text-[15px] leading-snug text-white/90">{body}</p>
                  </div>
                ))}
              </div>

              <div className="relative mt-auto grid gap-2.5 border-t border-white/10 pt-6 text-[13px] text-white/70">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary-light" />
                  Licensed, bonded &amp; insured
                </span>
                <span className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-primary-light" />
                  HIC# 13VH13373800
                </span>
                <span className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-primary-light" />
                  Northern New Jersey only
                </span>
              </div>
            </aside>

            {/* Right form */}
            <RequestEstimateForm />
          </div>
        </div>
      </main>

      {/* No bottom tabs on intake form — sticky tabs can cover fields */}
      <Footer />
    </div>
  );
}
