import type { Metadata } from 'next'
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Services from "@/components/Services";
import Breadcrumb from "@/components/Breadcrumb";

export const metadata: Metadata = {
  title: "Our Services | Premium Home Remodeling NJ",
  description: "Explore our comprehensive home remodeling services including kitchen remodeling, bathroom renovations, basement finishing, and home additions in Northern New Jersey.",
  openGraph: {
    title: "Our Services | Premium Home Remodeling NJ",
    description: "Explore our comprehensive home remodeling services including kitchen remodeling, bathroom renovations, basement finishing, and home additions in Northern New Jersey.",
    url: "https://www.lavacagc.com/services",
  },
}

export default function ServicesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        <div className="container mx-auto px-4 py-10 md:py-16">
          <h1 className="text-4xl md:text-5xl font-bold text-center mb-6 text-text-primary">
            Our Services
          </h1>
          <p className="text-lg text-text-secondary text-center max-w-3xl mx-auto mb-12">
            Discover our full range of premium home remodeling services designed to transform your space.
          </p>
        </div>
        <Services />
      </main>
      <Footer />
    </div>
  );
}
