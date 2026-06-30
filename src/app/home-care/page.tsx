import { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import HomeCareOptInForm from '@/components/homecare/HomeCareOptInForm';
import { CalendarCheck, ListChecks, Wrench } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Free Seasonal Home Maintenance Plan | La Vaca Home Care',
  description:
    'Get a free, personalized seasonal home-maintenance checklist for your Northern NJ home — what to do each season, with one-tap booking when you want La Vaca to handle it. No account, no spam.',
  alternates: { canonical: 'https://www.lavacagc.com/home-care' },
  openGraph: {
    title: 'La Vaca Home Care — your free seasonal home plan',
    description: 'A simple seasonal maintenance checklist for your Northern NJ home, plus one-tap booking.',
    type: 'website',
    url: 'https://www.lavacagc.com/home-care',
  },
};

const STEPS = [
  { icon: ListChecks, title: 'Tell us about your home', body: 'Just your email + ZIP (and your home type, if you like). 20 seconds, no account.' },
  { icon: CalendarCheck, title: 'Get your seasonal checklist', body: 'See exactly what your house needs this season — with a quick why for each task.' },
  { icon: Wrench, title: 'DIY it — or book us', body: 'Knock out the easy ones yourself, and tap “Book La Vaca” on anything you’d rather hand off.' },
];

export default async function HomeCarePage({ searchParams }: { searchParams: Promise<{ error?: string; unsub?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {sp?.unsub === 'ok' && (
          <div className="bg-secondary/10 text-center text-sm py-3 px-4 text-text-secondary">You&apos;ve been unsubscribed from La Vaca Home Care. You can re-join anytime below.</div>
        )}
        {sp?.error && (
          <div className="bg-destructive/10 text-center text-sm py-3 px-4 text-destructive">That confirmation link was invalid or expired. Enter your email below and we&apos;ll send a fresh one.</div>
        )}

        <section className="py-10 md:py-16 bg-gradient-subtle">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-10 items-center max-w-6xl mx-auto">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-primary mb-3">La Vaca Home Care · Northern NJ</p>
                <h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-5">
                  Never wonder what your home needs this{' '}
                  <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">season</span>
                </h1>
                <p className="text-xl text-text-secondary leading-relaxed mb-6">
                  A free, personalized maintenance checklist for your Northern NJ home — gutters, furnace, sump pump, the works — delivered each season. Do it yourself, or book La Vaca to handle it. No account required.
                </p>
                <ul className="space-y-2 text-text-secondary">
                  <li>✅ Seasonal reminders so nothing slips</li>
                  <li>✅ Clear DIY vs. pro guidance for each task</li>
                  <li>✅ One-tap booking when you&apos;d rather we did it</li>
                </ul>
              </div>
              <div>
                <HomeCareOptInForm />
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8">
              {STEPS.map((s) => (
                <div key={s.title} className="text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                    <s.icon className="h-7 w-7" />
                  </div>
                  <h3 className="text-lg font-bold text-text-primary mb-2">{s.title}</h3>
                  <p className="text-text-secondary leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
