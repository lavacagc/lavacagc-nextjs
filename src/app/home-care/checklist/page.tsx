import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { findHomeownerById, updateHomeowner } from '@/lib/homecare/homeowners';
import { currentSeason, SEASON_LABEL } from '@/lib/homecare/season';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { Wrench, CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface CatalogRow {
  key: string;
  title: string;
  blurb: string;
  seasons: string[];
  diy_or_pro: 'diy' | 'pro' | 'either';
  bookable: boolean;
  est_cost_low: number | null;
  est_cost_high: number | null;
  priority: number;
}

function costLabel(lo: number | null, hi: number | null): string | null {
  if (lo == null && hi == null) return null;
  if (lo === 0 && hi != null) return `up to $${hi}`;
  if (lo != null && hi != null) return `$${lo}–$${hi}`;
  return null;
}

export default async function ChecklistPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const access = await verifyHomeAccess(cookieStore.get(HC_ACCESS_COOKIE)?.value);
  if (!access) redirect('/home-care');

  const homeowner = await findHomeownerById(access.homeownerId);
  if (!homeowner || homeowner.status === 'unsubscribed') redirect('/home-care');

  // Best-effort "last seen" stamp.
  updateHomeowner(homeowner.id, { last_seen_at: new Date().toISOString() }).catch(() => {});

  const season = currentSeason();
  const tasks = (await supabaseRest<CatalogRow[]>(
    'GET',
    `maintenance_catalog?active=eq.true&seasons=cs.%7B${season}%7D&order=priority.desc`,
  )) ?? [];

  const greeting = homeowner.first_name ? `Welcome back, ${homeowner.first_name}` : 'Your home checklist';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="py-8 md:py-12 bg-gradient-subtle">
          <div className="container mx-auto px-4 max-w-3xl">
            {sp?.welcome === '1' && (
              <div className="mb-5 rounded-xl bg-secondary/10 px-4 py-3 text-sm text-text-secondary flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-secondary" /> You&apos;re all set — here&apos;s your plan. We&apos;ll send a seasonal reminder a few times a year.
              </div>
            )}
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-primary mb-2">La Vaca Home Care</p>
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-1">{greeting}</h1>
            <p className="text-lg text-text-secondary">Your <strong>{SEASON_LABEL[season]}</strong> home-maintenance checklist for Northern NJ.</p>
          </div>
        </section>

        <section className="py-8">
          <div className="container mx-auto px-4 max-w-3xl space-y-4">
            {tasks.length === 0 ? (
              <p className="text-text-secondary">No tasks for this season yet — check back soon.</p>
            ) : (
              tasks.map((t) => {
                const cost = costLabel(t.est_cost_low, t.est_cost_high);
                return (
                  <div key={t.key} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-text-primary">{t.title}</h3>
                        <p className="text-text-secondary mt-1 leading-relaxed">{t.blurb}</p>
                        <div className="flex flex-wrap gap-2 mt-3 text-xs">
                          <span className={`px-2 py-0.5 rounded-full font-semibold ${t.diy_or_pro === 'pro' ? 'bg-amber-100 text-amber-800' : t.diy_or_pro === 'diy' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                            {t.diy_or_pro === 'pro' ? 'Pro recommended' : t.diy_or_pro === 'diy' ? 'DIY-friendly' : 'DIY or pro'}
                          </span>
                          {cost && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">Pro est. {cost}</span>}
                        </div>
                      </div>
                      {t.bookable && (
                        <Link
                          href={`/home-care/book?task=${encodeURIComponent(t.key)}`}
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent-tangerine px-4 py-2 text-sm font-bold text-primary-foreground hover:shadow-button transition-all"
                        >
                          <Wrench className="h-4 w-4" /> Book La Vaca
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <p className="text-xs text-text-muted pt-2">
              Want a sharper list? Soon you&apos;ll be able to tell us about your specific systems (HVAC, sump pump, deck…) for a fully personalized plan.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
