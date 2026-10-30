import { Metadata } from 'next';
import Link from 'next/link';
import {
  Camera,
  ClipboardCheck,
  FileSignature,
  FolderOpen,
  ListChecks,
  MonitorSmartphone,
} from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

/**
 * /client-portal - what a La Vaca client gets in their own project portal.
 * The portal runs on SpecNook, so this page carries the in-content links to it
 * (Alex, 2026-10-29: links go La Vaca to SpecNook only, never back).
 * No prices and no legal claims here: the publish guard's word list in
 * src/lib/articles/publishGuard.ts is the reference for what to keep out.
 */

const PAGE_URL = 'https://www.lavacagc.com/client-portal';
const UTM = 'utm_source=lavacagc&utm_medium=website&utm_campaign=client_portal&utm_content=client_portal_page';
const SPECNOOK = {
  portal: `https://www.specnook.app/contractor-client-portal?${UTM}`,
  selections: `https://www.specnook.app/construction-selections-software?${UTM}`,
  dailyLog: `https://www.specnook.app/construction-daily-log-software?${UTM}`,
};

export const metadata: Metadata = {
  title: 'Your Client Portal',
  description:
    'Every La Vaca client gets a private project portal: daily photo updates, selections with deadlines, change orders, contracts and documents in one place.',
  openGraph: {
    title: 'Your Client Portal | La Vaca General Contractors',
    description:
      'Daily photo updates, selections with deadlines, change orders, contracts and documents for your remodel, in one private place.',
    type: 'website',
    url: PAGE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Your Client Portal | La Vaca GC',
    description: 'Follow your remodel from your phone: photos, selections, approvals and documents.',
  },
  alternates: {
    canonical: PAGE_URL,
  },
};

const features = [
  {
    icon: MonitorSmartphone,
    title: 'Your own portal',
    desc: 'One private page for your project. We send you the link, and it opens on your phone, tablet or laptop with no app to install.',
  },
  {
    icon: Camera,
    title: 'Daily updates with photos',
    desc: 'On the days we work, you see what got done and the photos from the site, so you never have to call to ask.',
  },
  {
    icon: ListChecks,
    title: 'Selections with deadlines',
    desc: 'Tile, fixtures, paint and every other choice you make is listed with the date we need it by, so orders go out on time.',
  },
  {
    icon: ClipboardCheck,
    title: 'Change orders to approve',
    desc: 'If the scope changes, you read the change and approve it in the portal before the work starts.',
  },
  {
    icon: FileSignature,
    title: 'Contracts to sign',
    desc: 'Your contract arrives in the portal and you sign it there, with the signed copy kept alongside everything else.',
  },
  {
    icon: FolderOpen,
    title: 'Documents in one place',
    desc: 'Plans, signed papers and the files from your project stay together, so you are not searching old emails for them.',
  },
];

const steps = [
  {
    title: 'You sign on with us',
    desc: 'Once we start working together, we set up your portal and email you the link.',
  },
  {
    title: 'You follow along',
    desc: 'Open the link whenever you like to see updates, photos and anything waiting on you.',
  },
  {
    title: 'You decide on time',
    desc: 'Selections, approvals and signatures happen in the portal, with the deadline in front of you.',
  },
];

export default function ClientPortalPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.lavacagc.com',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Your Client Portal',
        item: PAGE_URL,
      },
    ],
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="flex-1">
        <section className="py-8 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <nav aria-label="Breadcrumb" className="mb-6">
                <ol className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
                  <li>
                    <Link href="/" className="hover:text-primary">
                      Home
                    </Link>
                  </li>
                  <li aria-hidden="true">/</li>
                  <li className="text-foreground font-medium" aria-current="page">
                    Your Client Portal
                  </li>
                </ol>
              </nav>

              <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">Your Client Portal</h1>
              <p className="text-lg md:text-xl text-text-secondary leading-relaxed">
                Every La Vaca client gets a private portal for their project. It is where you see how the work is
                going, make your choices and approve what needs approving, without chasing anyone by phone.
              </p>
            </div>
          </div>
        </section>

        <section className="pt-4 pb-12 md:pt-8 md:pb-20" aria-labelledby="what-you-get">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <h2 id="what-you-get" className="text-3xl md:text-4xl font-bold text-text-primary mb-4 text-center">
                What you get
              </h2>
              <p className="text-text-secondary text-lg leading-relaxed mb-10 md:mb-12 text-center max-w-2xl mx-auto">
                Six things live in your portal from the day we start until the day we hand over the keys.
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {features.map((feature) => (
                  <li key={feature.title} className="flex gap-4 items-start rounded-xl border bg-card p-5 md:p-6">
                    <div className="bg-primary/10 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
                      <feature.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-text-primary mb-1">{feature.title}</h3>
                      <p className="text-text-secondary text-sm leading-relaxed">{feature.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="py-12 md:py-20 bg-muted/30" aria-labelledby="how-it-works">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <h2 id="how-it-works" className="text-3xl md:text-4xl font-bold text-text-primary mb-10 md:mb-12 text-center">
                How it works
              </h2>
              <ol className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                {steps.map((step, i) => (
                  <li key={step.title} className="rounded-xl border bg-card p-5 md:p-6">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold mb-3">
                      {i + 1}
                    </span>
                    <h3 className="font-semibold text-text-primary mb-1">{step.title}</h3>
                    <p className="text-text-secondary text-sm leading-relaxed">{step.desc}</p>
                  </li>
                ))}
              </ol>
              <p className="text-text-secondary leading-relaxed mt-8 text-center max-w-2xl mx-auto">
                The portal sits alongside the rest of how we run a remodel.{' '}
                <Link href="/process" className="text-primary font-semibold hover:underline">
                  See our six-step remodeling process
                </Link>{' '}
                for what happens from the first visit to the final walkthrough.
              </p>
            </div>
          </div>
        </section>

        <section className="py-12 md:py-20" aria-labelledby="built-on-specnook">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto">
              <h2 id="built-on-specnook" className="text-3xl md:text-4xl font-bold text-text-primary mb-6 text-center">
                Built on SpecNook
              </h2>
              <div className="space-y-4 text-text-secondary text-lg leading-relaxed">
                <p>
                  Your portal runs on SpecNook, the software we use to manage every project. If you are curious how it
                  works from the builder&apos;s side, SpecNook explains its{' '}
                  <a href={SPECNOOK.portal} target="_blank" rel="noopener" className="text-primary font-semibold hover:underline">
                    client portal for contractors and their homeowners
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  .
                </p>
                <p>
                  The deadlines on your choices come from{' '}
                  <a href={SPECNOOK.selections} target="_blank" rel="noopener" className="text-primary font-semibold hover:underline">
                    SpecNook&apos;s selections tracking for remodels
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  , and the photos you see each day come from{' '}
                  <a href={SPECNOOK.dailyLog} target="_blank" rel="noopener" className="text-primary font-semibold hover:underline">
                    SpecNook&apos;s daily log with site photos
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  , filled in by our crew on site.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-4">Planning a remodel?</h2>
              <p className="text-text-secondary text-lg leading-relaxed mb-8">
                Tell us about your project and we will walk you through the portal at your first visit.
              </p>
              <Link
                href="/free-estimate"
                className="inline-flex items-center justify-center rounded-md text-base font-medium bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-white min-h-11 px-8"
              >
                Request your free estimate
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
