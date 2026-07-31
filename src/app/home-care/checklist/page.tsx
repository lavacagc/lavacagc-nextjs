import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { findHomeownerById, updateHomeowner } from '@/lib/homecare/homeowners';
import { currentSeason, seasonStart, SEASON_LABEL } from '@/lib/homecare/season';
import { isRowCurrent } from '@/lib/homecare/selection';
import {
  catalogCarriesStages,
  filterTasksForProfile,
  getStage,
  stageFromLegacyType,
  stageShowsStarter,
  SYSTEM_QUESTIONS,
  type HomeSystems,
  type Stage,
} from '@/lib/homecare/profile';
import HomeCareChecklistClient, { type ChecklistTask } from '@/components/homecare/HomeCareChecklistClient';
import UpcomingVisitCard, { type UpcomingVisit } from '@/components/homecare/UpcomingVisitCard';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { CheckCircle2, ChevronDown, Phone, ShieldCheck, SlidersHorizontal } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface MaintenanceRow {
  task_key: string;
  season: string;
  status: string;
  completed_at: string | null;
  updated_at: string | null;
  completed_by: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  service_address: string | null;
}

/** Columns that only exist once 20260815000000 has been applied. */
const SERVICE_COLUMNS = 'completed_by,scheduled_start,scheduled_end,service_address';
const MAINTENANCE_BASE = 'task_key,season,status,completed_at,updated_at';

/**
 * The member's maintenance rows, degrading to the pre-migration column set.
 *
 * This query is unconditional on a page every member loads, and PostgREST
 * answers an unknown column with a 400 that supabaseRest turns into a throw -
 * so on an environment where the migration has not been hand-applied yet (a
 * Supabase Preview branch, say) the whole portal would 500. Retrying narrow
 * costs one extra round trip only in that case: the member keeps their
 * checklist, and just loses the completion label and the visit card until the
 * columns exist. A transient failure still throws, because the retry fails too.
 */
async function fetchMaintenanceRows(homeownerId: string): Promise<MaintenanceRow[]> {
  const filter = `&homeowner_id=eq.${homeownerId}&status=in.(done,dismissed,booked)`;
  try {
    return (await supabaseRest<MaintenanceRow[]>(
      'GET', `homeowner_maintenance?select=${MAINTENANCE_BASE},${SERVICE_COLUMNS}${filter}`,
    )) ?? [];
  } catch {
    const rows = (await supabaseRest<Omit<MaintenanceRow, 'completed_by' | 'scheduled_start' | 'scheduled_end' | 'service_address'>[]>(
      'GET', `homeowner_maintenance?select=${MAINTENANCE_BASE}${filter}`,
    )) ?? [];
    return rows.map((r) => ({
      ...r, completed_by: null, scheduled_start: null, scheduled_end: null, service_address: null,
    }));
  }
}

interface CatalogRow extends ChecklistTask {
  applies_to: string[];
  priority: number;
  /**
   * Required here even though the client prop leaves it optional: this is what
   * the stage gate reads, and a select that forgets it reads as "applies to
   * everyone" rather than failing.
   */
  stages: string[];
}

export default async function ChecklistPage({ searchParams }: { searchParams: Promise<{ welcome?: string; add?: string | string[] }> }) {
  const sp = await searchParams;
  const rawAdd = Array.isArray(sp?.add) ? sp.add[0] : sp?.add;
  const addKey = rawAdd?.trim().slice(0, 80) || undefined;
  const cookieStore = await cookies();
  const access = await verifyHomeAccess(cookieStore.get(HC_ACCESS_COOKIE)?.value);
  if (!access) redirect('/home-care');

  const homeowner = await findHomeownerById(access.homeownerId);
  if (!homeowner || homeowner.status === 'unsubscribed') redirect('/home-care');

  updateHomeowner(homeowner.id, { last_seen_at: new Date().toISOString() }).catch(() => {});

  // Captured once per request. This is a server component rendered fresh on
  // every load (force-dynamic), so there is no memoised-render concern.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const season = currentSeason();
  const [allTasks, profileRows, doneRows] = await Promise.all([
    supabaseRest<CatalogRow[]>('GET', `maintenance_catalog?select=key,title,blurb,applies_to,stages,seasons,frequency,starter,diy_or_pro,bookable,est_cost_low,est_cost_high,priority&active=eq.true&order=priority.desc`),
    supabaseRest<{ systems: HomeSystems; stage: Stage | null; homeowner_type: string | null }[]>('GET', `home_profiles?select=systems,stage,homeowner_type&homeowner_id=eq.${homeowner.id}&limit=1`),
    fetchMaintenanceRows(homeowner.id),
  ]);

  // Same exposure as the newsletter cron, so the same guard: the select above
  // is an unchecked cast, and a `stages` that goes missing from it reads as
  // "applies to everyone" instead of failing. Throw rather than quietly show
  // "get ready to sell your house" to a member who never said they're selling.
  if (!catalogCarriesStages(allTasks ?? [])) {
    throw new Error('maintenance_catalog select is missing `stages` - the stage gate would not apply');
  }

  const systems = profileRows?.[0]?.systems ?? null;
  const stage: Stage | null = profileRows?.[0]?.stage ?? stageFromLegacyType(profileRows?.[0]?.homeowner_type);
  const stageDef = getStage(stage);
  const hasProfile = (!!systems && Object.keys(systems).length > 0) || stage !== null;
  const tasks = filterTasksForProfile(allTasks ?? [], systems, stage);
  // Seasonal reset lives in isRowCurrent (shared with the monthly newsletter so
  // the page and the email can't disagree about what still counts as done).
  const doneItems = (doneRows ?? [])
    .filter((r) => r.status === 'done' && isRowCurrent(r))
    .map(({ task_key, season }) => ({ task_key, season }));
  const dismissedKeys = (doneRows ?? []).filter((r) => r.status === 'dismissed').map((r) => r.task_key);
  // Work La Vaca performed gets a label; a task the member ticked themselves
  // does not - which is the whole point of completed_by.
  //
  // Keyed per (task, season) exactly like doneItems, and filtered through the
  // same isRowCurrent reset. Keyed on task_key alone the label leaked: a gutter
  // clean La Vaca did in fall would credit itself on the spring row the member
  // ticked, and come back next fall on a re-tick carrying last year's date.
  const lavacaCompleted: Record<string, string> = {};
  for (const r of doneRows ?? []) {
    const ourWork = r.status === 'done' && r.completed_by === 'lavaca' && !!r.completed_at && isRowCurrent(r);
    if (!ourWork) continue;
    const key = `${r.task_key}|${r.season}`;
    const previous = lavacaCompleted[key];
    if (!previous || Date.parse(r.completed_at) > Date.parse(previous)) lavacaCompleted[key] = r.completed_at;
  }
  // The next booked visit, if any. Several tasks can share one window, so they
  // collapse into a single card listing every service.
  const bookedRows = (doneRows ?? []).filter((r) => r.status === 'booked' && r.scheduled_start);
  const nextStart = bookedRows
    .map((r) => r.scheduled_start as string)
    .filter((iso) => new Date(iso).getTime() > nowMs)
    .sort()[0];
  const upcomingVisit: UpcomingVisit | null = nextStart
    ? (() => {
        const rows = bookedRows.filter((r) => r.scheduled_start === nextStart);
        const titleFor = (k: string) => (allTasks ?? []).find((t) => t.key === k)?.title ?? k;
        return {
          start: nextStart,
          end: rows[0].scheduled_end,
          address: rows[0].service_address,
          services: rows.map((r) => titleFor(r.task_key)),
        };
      })()
    : null;
  const autoAddKey = addKey && tasks.some((t) => t.key === addKey && t.bookable && !t.starter && !dismissedKeys.includes(addKey)) ? addKey : undefined;
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
            {/* A booked visit shows even when the task list is empty - it is
                the most time-sensitive thing on the page. */}
            {upcomingVisit && <UpcomingVisitCard visit={upcomingVisit} />}
            {(tasks?.length ?? 0) === 0 ? (
              <p className="text-text-secondary">Your checklist is being prepared — check back soon.</p>
            ) : (
              <HomeCareChecklistClient tasks={tasks} doneItems={doneItems} dismissedKeys={dismissedKeys} showStarter={stageShowsStarter(stage)} currentSeason={season} showCatchUp={showCatchUp} autoAddKey={autoAddKey} lavacaCompleted={lavacaCompleted} />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
