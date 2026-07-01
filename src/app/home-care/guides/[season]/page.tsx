import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { GUIDES, getGuide, type Season } from '@/lib/homecare/guides';
import { ArrowLeft, Wrench } from 'lucide-react';

export function generateStaticParams() {
  return (Object.keys(GUIDES) as Season[]).map((season) => ({ season }));
}

export async function generateMetadata({ params }: { params: Promise<{ season: string }> }): Promise<Metadata> {
  const { season } = await params;
  const g = getGuide(season);
  if (!g) return { title: 'Home Maintenance Guide | La Vaca General Contractors' };
  const title = `${g.label} Home Maintenance Guide for Northern NJ | La Vaca`;
  return {
    title,
    description: g.intro,
    alternates: { canonical: `https://www.lavacagc.com/home-care/guides/${g.season}` },
    openGraph: { title, description: g.intro, type: 'article', url: `https://www.lavacagc.com/home-care/guides/${g.season}` },
  };
}

const ORDER: Season[] = ['spring', 'summer', 'fall', 'winter'];

export default async function GuidePage({ params }: { params: Promise<{ season: string }> }) {
  const { season } = await params;
  const guide = getGuide(season);
  if (!guide) notFound();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="bg-secondary text-secondary-foreground py-10 md:py-14">
          <div className="container mx-auto px-4 max-w-3xl">
            <Link href="/home-care/checklist" className="inline-flex items-center gap-1 text-sm text-secondary-foreground/80 hover:text-white mb-4">
              <ArrowLeft className="h-4 w-4" /> Back to my checklist
            </Link>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent-sunset mb-2">La Vaca Home Care · Seasonal Guide</p>
            <h1 className="text-3xl md:text-5xl font-extrabold mb-4">{guide.label} Home Maintenance in Northern NJ</h1>
            <p className="text-lg text-secondary-foreground/90 leading-relaxed max-w-2xl">{guide.intro}</p>
          </div>
        </section>

        {/* Season switcher */}
        <section className="border-b border-border bg-background">
          <div className="container mx-auto px-4 max-w-3xl py-3 flex gap-2 overflow-x-auto">
            {ORDER.map((s) => (
              <Link
                key={s}
                href={`/home-care/guides/${s}`}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${s === guide.season ? 'bg-primary text-primary-foreground' : 'bg-muted text-text-secondary hover:bg-muted/70'}`}
              >
                {GUIDES[s].label}
              </Link>
            ))}
          </div>
        </section>

        <section className="py-8 md:py-12">
          <div className="container mx-auto px-4 max-w-3xl space-y-8">
            {guide.items.map((item, i) => (
              <article key={item.key} id={item.key} className="scroll-mt-24">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-extrabold">{i + 1}</span>
                  <div className="min-w-0">
                    <h2 className="text-xl md:text-2xl font-bold text-text-primary">{item.title}</h2>
                    <p className="text-text-secondary leading-relaxed mt-2">{item.body}</p>
                    {item.bookable && (
                      <Link href={`/home-care/book?task=${encodeURIComponent(item.key)}`} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent-tangerine px-4 py-2 text-sm font-bold text-primary-foreground hover:shadow-button transition-all">
                        <Wrench className="h-4 w-4" /> Book La Vaca for this
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            ))}

            <div className="rounded-2xl bg-gradient-subtle border border-border p-6 text-center">
              <h3 className="text-xl font-bold text-text-primary mb-2">Rather not do it yourself?</h3>
              <p className="text-text-secondary mb-4">Pick the tasks you want handled on your checklist and request one estimate — or call us at <a href="tel:2012124917" className="font-semibold text-primary">(201) 212-4917</a>.</p>
              <Link href="/home-care/checklist" className="inline-flex items-center justify-center rounded-md bg-gradient-to-r from-primary to-accent-tangerine text-primary-foreground font-semibold h-11 px-7 hover:shadow-button transition-all">
                Back to my checklist
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
