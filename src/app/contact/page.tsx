import { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ContactForm from '@/components/ContactForm';
import CallTrackingWrapper from '@/components/CallTrackingWrapper';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';
import ContactTrustBadges from '@/components/ContactTrustBadges';
import ContactHeroPhone from '@/components/ContactHeroPhone';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: 'Get in touch with La Vaca General Contractors for your home renovation needs in Northern New Jersey. Free estimates and consultations available.',
  openGraph: {
    title: 'Contact Us | La Vaca General Contractors',
    description: 'Get in touch with La Vaca General Contractors for your home renovation needs in Northern New Jersey.',
    url: 'https://www.lavacagc.com/contact',
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/contact',
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content" className="pb-20 md:pb-0">
        {/* Hero Section */}
        <section className="bg-gradient-to-r from-primary/10 to-accent-sunset/10 py-12 md:py-16">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4">
              Let&apos;s Talk About Your Project
            </h1>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-6">
              Call us now or leave your details below — we&apos;ll get back to you within 2 hours.
            </p>
            {/* Prominent Phone Number */}
            <ContactHeroPhone />
          </div>
        </section>

        {/* Trust Badges */}
        <ContactTrustBadges />

        {/* Divider with "or" */}
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4 py-6 max-w-2xl mx-auto">
            <div className="flex-1 h-px bg-border" />
            <span className="text-sm font-medium text-text-muted uppercase tracking-wider">or leave your details</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        </div>

        {/* Contact Form — Front and Center */}
        <section className="pb-12">
          <div className="container mx-auto px-4">
            <ContactForm />
          </div>
        </section>

        {/* Contact Details — Below the form, compact */}
        <section className="py-12 bg-muted/30 border-t border-border">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xl font-bold text-text-primary text-center mb-8">
                Other Ways to Reach Us
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2.5 rounded-lg flex-shrink-0">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary text-sm">Phone</h3>
                    <CallTrackingWrapper
                      href="tel:2016142814"
                      className="text-primary hover:underline font-medium"
                    >
                      (201) 614-2814
                    </CallTrackingWrapper>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2.5 rounded-lg flex-shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary text-sm">Email</h3>
                    <a href="mailto:info@lavacagc.com" className="text-primary hover:underline text-sm">
                      info@lavacagc.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2.5 rounded-lg flex-shrink-0">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary text-sm">Service Area</h3>
                    <p className="text-text-secondary text-sm">Northern New Jersey</p>
                    <p className="text-text-muted text-xs">Essex, Bergen, Morris & Passaic</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 p-2.5 rounded-lg flex-shrink-0">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary text-sm">Hours</h3>
                    <p className="text-text-secondary text-sm">Mon-Fri: 8AM-6PM</p>
                    <p className="text-text-secondary text-sm">Sat: 9AM-2PM</p>
                  </div>
                </div>
              </div>

              {/* License */}
              <p className="text-center text-text-muted text-xs mt-8">
                Licensed & Insured — NJ HIC# 13VH13373800 · Fully bonded for your protection
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
