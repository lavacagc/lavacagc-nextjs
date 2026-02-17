import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Breadcrumb from '@/components/Breadcrumb';
import ReferralForm from '@/components/ReferralForm';
import { Card, CardContent } from '@/components/ui/card';
import { Gift, Users, Phone, DollarSign, Heart, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Referral Program | Earn Rewards for Referring Friends',
  description:
    'Refer a friend to La Vaca General Contractors and earn rewards! Your friend gets a free consultation and you get rewarded when they start their project. Northern NJ home remodeling.',
  keywords: [
    'referral program',
    'home remodeling referral',
    'NJ contractor referral',
    'earn rewards',
    'free consultation',
    'La Vaca referral',
  ],
  openGraph: {
    title: 'Referral Program | La Vaca General Contractors',
    description:
      'Refer a friend to La Vaca GC. They get a free consultation, and you get rewarded when they start their project.',
    url: 'https://www.lavacagc.com/referral',
    type: 'website',
    images: [
      {
        url: 'https://www.lavacagc.com/logo.png',
        width: 800,
        height: 800,
        alt: 'La Vaca General Contractors Referral Program',
      },
    ],
  },
  alternates: {
    canonical: 'https://www.lavacagc.com/referral',
  },
};

const steps = [
  {
    icon: Users,
    title: 'Refer a Friend',
    description:
      'Fill out the referral form below with your friend\'s information and the type of project they\'re considering.',
  },
  {
    icon: Phone,
    title: 'Free Consultation',
    description:
      'We\'ll reach out to your friend within 24 hours to schedule a complimentary in-home consultation and project estimate.',
  },
  {
    icon: DollarSign,
    title: 'Get Rewarded',
    description:
      'Once your friend signs a contract and their project begins, you\'ll receive your referral reward as a thank you!',
  },
];

const benefits = [
  {
    title: 'For Your Friend',
    items: [
      'Free in-home consultation and estimate',
      'Priority scheduling for their project',
      'Expert guidance from licensed NJ contractors',
      'No obligation to commit',
    ],
  },
  {
    title: 'For You',
    items: [
      'Referral reward for every converted project',
      'Help a friend find a trusted contractor',
      'Unlimited referrals — no cap on rewards',
      'Feel good knowing they\'re in great hands',
    ],
  },
];

export default function ReferralPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Referral Program | La Vaca General Contractors',
    description:
      'Refer a friend to La Vaca General Contractors and earn rewards. Free consultation for your referral.',
    url: 'https://www.lavacagc.com/referral',
    publisher: {
      '@type': 'Organization',
      name: 'La Vaca General Contractors, LLC',
      url: 'https://www.lavacagc.com',
    },
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />

        {/* Breadcrumb */}
        <section className="bg-background-subtle py-4">
          <div className="container mx-auto px-4">
            <Breadcrumb />
          </div>
        </section>

        {/* Hero Section */}
        <section className="py-12 md:py-20 bg-gradient-to-br from-primary/5 via-accent-sunset/5 to-background">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <div className="bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8">
                <Gift className="h-10 w-10 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
                Refer a Friend, Earn Rewards
              </h1>
              <p className="text-xl text-text-secondary leading-relaxed max-w-2xl mx-auto">
                Know someone who&apos;s thinking about a home renovation? Send them our way!
                Your friend gets a free consultation and you get rewarded when their project begins.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-12 md:py-16 bg-background-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold text-text-primary text-center mb-12">
                How It Works
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {steps.map((step, index) => (
                  <div key={index} className="relative text-center">
                    {/* Step number */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold z-10">
                      {index + 1}
                    </div>
                    <Card className="pt-8 hover:shadow-elegant transition-all duration-300 h-full">
                      <CardContent className="p-6">
                        <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                          <step.icon className="h-8 w-8 text-primary" />
                        </div>
                        <h3 className="text-xl font-bold text-text-primary mb-3">
                          {step.title}
                        </h3>
                        <p className="text-text-secondary leading-relaxed">
                          {step.description}
                        </p>
                      </CardContent>
                    </Card>
                    {/* Arrow between steps (desktop only) */}
                    {index < steps.length - 1 && (
                      <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2 z-10">
                        <ArrowRight className="h-6 w-6 text-primary/40" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-12 md:py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold text-text-primary text-center mb-12">
                Everyone Wins
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {benefits.map((benefit, index) => (
                  <Card key={index} className="hover:shadow-elegant transition-all duration-300">
                    <CardContent className="p-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center">
                          <Heart className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="text-xl font-bold text-text-primary">
                          {benefit.title}
                        </h3>
                      </div>
                      <ul className="space-y-3">
                        {benefit.items.map((item, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <span className="text-primary font-bold mt-0.5">&#10003;</span>
                            <span className="text-text-secondary">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Referral Form */}
        <section className="py-12 md:py-16 bg-background-subtle" id="referral-form">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto">
              <ReferralForm />
            </div>
          </div>
        </section>

        {/* FAQ / Fine Print */}
        <section className="py-12 md:py-16 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold text-text-primary text-center mb-8">
                Frequently Asked Questions
              </h2>
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-text-primary mb-2">
                    Is there a limit to how many people I can refer?
                  </h3>
                  <p className="text-text-secondary">
                    No! You can refer as many friends and family members as you like. There&apos;s no
                    cap on the number of referrals or rewards you can earn.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary mb-2">
                    When do I receive my reward?
                  </h3>
                  <p className="text-text-secondary">
                    You&apos;ll receive your referral reward once your friend&apos;s project begins
                    (contract signed and work starts). We&apos;ll contact you directly to arrange it.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary mb-2">
                    Does my friend have to be in New Jersey?
                  </h3>
                  <p className="text-text-secondary">
                    Yes, we currently serve Northern New Jersey including Essex, Bergen, Morris, and
                    Passaic counties. Check our{' '}
                    <Link href="/locations" className="text-primary hover:underline">
                      service areas
                    </Link>{' '}
                    for the full list.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary mb-2">
                    What types of projects qualify?
                  </h3>
                  <p className="text-text-secondary">
                    All of our services qualify including kitchen remodeling, bathroom renovation,
                    basement finishing, home additions, and whole home remodeling.
                    Check our{' '}
                    <Link href="/services" className="text-primary hover:underline">
                      services page
                    </Link>{' '}
                    for details.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
