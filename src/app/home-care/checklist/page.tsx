import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { findHomeownerById, updateHomeowner } from '@/lib/homecare/homeowners';
import { currentSeason, SEASON_LABEL } from '@/lib/homecare/season';
import { filterTasksForProfile, type HomeSystems } from '@/lib/homecare/profile';
import HomeCareProfileForm from '@/components/homecare/HomeCareProfileForm';
import HomeCareChecklistClient, { type ChecklistTask } from '@/components/homecare/HomeCareChecklistClient';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { CheckCircle2, Phone, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface CatalogRow extends ChecklistTask {
  applies_to: string[];
  priority: number;
}

export default async function ChecklistPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const access = await verifyHomeAccess(cookieStore.get(HC_ACCESS_COOKIE)?.value);
  if (!access) redirect('/home-care');

  const homeowner = await findHomeownerById(access.homeownerId);
  if (!homeowner || homeowner.status === 'unsubscribed') redirect('/home-care');

  updateHomeowner(homeowner.id, { last_seen_at: new Date().toISOString() }).catch(() => {});

  const season = currentSeason();
  const [allTasks, profileRows, doneRows] = await Promise.all([
    supabaseRest<CatalogRow[]>('GET', `maintenance_catalog?select=key,title,blurb,applies_to,seasons,frequency,starter,diy_or_pro,bookable,est_cost_low,est_cost_high,priority&active=eq.true&order=priority.desc`),
    supabaseRest<{ systems: HomeSystems; homeowner_type: 'first_time' | 'experienced' | null }[]>('GET', `home_profiles?select=systems,homeowner_type&homeowner_id=eq.${homeowner.id}&limit=1`),
    supabaseRest<{ task_key: string; season: string }[]>('GET', `homeowner_maintenance?select=task_key,season&homeowner_id=eq.${homeowner.id}&status=eq.done`),
  ]);

  const systems = profileRows?.[0]?.systems ?? null;
  const homeownerType = profileRows?.[0]?.homeowner_type ?? null;
  const hasProfile = (!!systems && Object.keys(systems).length > 0) || homeownerType !== null;
  const tasks = filterTasksForProfile(allTasks ?? [], systems);
  const doneItems = doneRows ?? [];
  const greeting = homeowner.first_name ? `Welcome back, ${homeowner.first_name}` : 'Your home checklist';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Branded header */}
        <section className="bg-secondary text-secondary-foreground">
          <div className="container mx-auto px-4 max-w-3xl py-6 flex items-center gap-4">
            <div className="bg-white rounded-xl p-1.5 shrink-0">
              <Image src="/logo.png" width={44} height={44} alt="La Vaca General Contractors" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-accent-sunset">La Vaca Home Care</div>
              <div className="text-lg font-extrabold leading-tight">La Vaca General Contractors</div>
            </div>
            <div className="hidden sm:flex flex-col items-end text-xs text-secondary-foreground/80 gap-1">
              <a href="tel:2012124917" className="flex items-center gap-1 font-bold text-white"><Phone className="h-3.5 w-3.5" /> (201) 212-4917</a>
              <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> NJ HIC# 13VH13373800</span>
            </div>
          </div>
        </section>

        <section className="py-7 md:py-9 bg-gradient-subtle">
          <div className="container mx-auto px-4 max-w-3xl">
            {sp?.welcome === '1' && (
              <div className="mb-5 rounded-xl bg-secondary/10 px-4 py-3 text-sm text-text-secondary flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-secondary" /> You&apos;re all set — here&apos;s your plan. We&apos;ll send a seasonal reminder a few times a year.
              </div>
            )}
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-1">{greeting}</h1>
            <p className="text-lg text-text-secondary">
              Your year-round home plan — it&apos;s <strong>{SEASON_LABEL[season]}</strong> now. Check things off (it&apos;s saved), browse any season, book a task, or pick a few for one estimate.
            </p>
          </div>
        </section>

        <section className="py-6">
          <div className="container mx-auto px-4 max-w-3xl space-y-4">
            <HomeCareProfileForm initial={systems ?? {}} hasProfile={hasProfile} initialType={homeownerType} />
            {(tasks?.length ?? 0) === 0 ? (
              <p className="text-text-secondary">Your checklist is being prepared — check back soon.</p>
            ) : (
              <HomeCareChecklistClient tasks={tasks} doneItems={doneItems} homeownerType={homeownerType} currentSeason={season} />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
