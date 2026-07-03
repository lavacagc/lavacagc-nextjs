import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { findHomeownerById, updateHomeowner } from '@/lib/homecare/homeowners';
import { currentSeason, seasonStart, SEASON_LABEL } from '@/lib/homecare/season';
import {
  filterTasksForProfile,
  getStage,
  stageFromLegacyType,
  stageShowsStarter,
  SYSTEM_QUESTIONS,
  type HomeSystems,
  type Stage,
} from '@/lib/homecare/profile';
import HomeCareChecklistClient, { type ChecklistTask } from '@/components/homecare/HomeCareChecklistClient';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { CheckCircle2, ChevronDown, Phone, ShieldCheck, SlidersHorizontal } from 'lucide-react';

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
    supabaseRest<CatalogRow[]>('GET', `maintenance_catalog?select=key,title,blurb,applies_to,stages,seasons,frequency,starter,diy_or_pro,bookable,est_cost_low,est_cost_high,priority&active=eq.true&order=priority.desc`),
    supabaseRest<{ systems: HomeSystems; stage: Stage | null; homeowner_type: string | null }[]>('GET', `home_profiles?select=systems,stage,homeowner_type&homeowner_id=eq.${homeowner.id}&limit=1`),
    supabaseRest<{ task_key: string; season: string; status: string }[]>('GET', `homeowner_maintenance?select=task_key,season,status&homeowner_id=eq.${homeowner.id}&status=in.(done,dismissed)`),
  ]);

  const systems = profileRows?.[0]?.systems ?? null;
  const stage: Stage | null = profileRows?.[0]?.stage ?? stageFromLegacyType(profileRows?.[0]?.homeowner_type);
  const stageDef = getStage(stage);
  const hasProfile = (!!systems && Object.keys(systems).length > 0) || stage !== null;
  const tasks = filterTasksForProfile(allTasks ?? [], systems, stage);
  const doneItems = (doneRows ?? []).filter((r) => r.status === 'done').map(({ task_key, season }) => ({ task_key, season }));
  const dismissedKeys = (doneRows ?? []).filter((r) => r.status === 'dismissed').map((r) => r.task_key);
  const ownedSystems = SYSTEM_QUESTIONS.filter((q) => systems?.[q.key] === true);
  const greeting = homeowner.first_name ? `Welcome back, ${homeowner.first_name}` : 'Your home checklist';

  // Catch-up applies to members who were already signed up before this season
  // started — a brand-new member has nothing meaningful to have "missed".
  const memberSince = homeowner.created_at ? new Date(homeowner.created_at) : null;
  const showCatchUp = !!memberSince && memberSince.getTime() < seasonStart().getTime();

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
            {/* Your program summary + edit re-entry */}
            {hasProfile ? (
              /* Condensed by default (owner: the full card was bulky) — a one-line
                 summary that expands via native <details>; Edit is always visible. */
              <details className="group rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
                  <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                    <span className="font-bold text-text-primary">Your program</span>
                    {stageDef && <span className="font-semibold"> · {stageDef.label}</span>}
                    {ownedSystems.length > 0 && <span> · {ownedSystems.length} home detail{ownedSystems.length === 1 ? '' : 's'}</span>}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-180" />
                  <Link href="/home-care/setup?edit=1" className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-primary hover:border-primary/50 transition-colors">Edit</Link>
                </summary>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {ownedSystems.length > 0 ? ownedSystems.map((q) => (
                    <span key={q.key} className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1">{q.label}</span>
                  )) : <span className="text-xs text-text-muted">Seasonal basics — add your home details for a sharper list.</span>}
                </div>
              </details>
            ) : (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 text-center">
                <p className="font-bold text-text-primary mb-1">Personalize your plan</p>
                <p className="text-sm text-text-secondary mb-3">Answer a few quick questions and we&apos;ll tailor this checklist to your home.</p>
                <Link href="/home-care/setup" className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-primary to-accent-tangerine px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-button hover:-translate-y-px transition-all">Set up my program →</Link>
              </div>
            )}
            {(tasks?.length ?? 0) === 0 ? (
              <p className="text-text-secondary">Your checklist is being prepared — check back soon.</p>
            ) : (
              <HomeCareChecklistClient tasks={tasks} doneItems={doneItems} dismissedKeys={dismissedKeys} showStarter={stageShowsStarter(stage)} currentSeason={season} showCatchUp={showCatchUp} />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
