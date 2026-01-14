import { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ContactForm from '@/components/ContactForm';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';

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
        <section className="bg-gradient-to-r from-primary/10 to-accent-sunset/10 py-16">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4">
              Contact Us
            </h1>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto">
              Ready to start your renovation project? Get in touch with our team for a free consultation.
            </p>
          </div>
        </section>

        {/* Contact Info & Form */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Contact Information */}
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-bold text-text-primary mb-6">
                    Get In Touch
                  </h2>
                  <p className="text-text-secondary mb-8">
                    Have questions about your renovation project? We're here to help.
                    Reach out to us through any of the methods below, or fill out the
                    contact form and we'll get back to you within 24 hours.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-3 rounded-lg">
                      <Phone className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary">Phone</h3>
                      <a
                        href="tel:2012124917"
                        className="text-primary hover:underline font-medium text-lg"
                      >
                        (201) 212-4917
                      </a>
                      <p className="text-sm text-text-muted">
                        Call us for immediate assistance
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-3 rounded-lg">
                      <Mail className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary">Email</h3>
                      <a
                        href="mailto:info@lavacagc.com"
                        className="text-primary hover:underline"
                      >
                        info@lavacagc.com
                      </a>
                      <p className="text-sm text-text-muted">
                        Send us your questions anytime
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-3 rounded-lg">
                      <MapPin className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary">Service Area</h3>
                      <p className="text-text-secondary">
                        Northern New Jersey
                      </p>
                      <p className="text-sm text-text-muted">
                        Including Essex, Bergen, Morris & Passaic Counties
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="bg-primary/10 p-3 rounded-lg">
                      <Clock className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary">Business Hours</h3>
                      <p className="text-text-secondary">
                        Monday - Friday: 8:00 AM - 6:00 PM
                      </p>
                      <p className="text-text-secondary">
                        Saturday: 9:00 AM - 2:00 PM
                      </p>
                      <p className="text-sm text-text-muted">
                        Emergency services available 24/7
                      </p>
                    </div>
                  </div>
                </div>

                {/* License Info */}
                <div className="bg-muted/50 p-6 rounded-lg border border-border">
                  <h3 className="font-semibold text-text-primary mb-2">
                    Licensed & Insured
                  </h3>
                  <p className="text-text-secondary text-sm">
                    NJ Home Improvement Contractor License: HIC# 13VH12419200
                  </p>
                  <p className="text-text-muted text-sm mt-2">
                    Fully bonded and insured for your protection
                  </p>
                </div>
              </div>

              {/* Contact Form */}
              <div>
                <ContactForm />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
