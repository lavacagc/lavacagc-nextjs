'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Wrench, ClipboardList, Sparkles, History, X, EyeOff, RotateCcw, PartyPopper, Share2, Copy } from 'lucide-react';
import { hasGuideItem } from '@/lib/homecare/guides';
import { prevSeason, seasonStart, type Season } from '@/lib/homecare/season';

const SHARE_URL = 'https://www.lavacagc.com/home-care?utm_source=member_share&utm_medium=portal&utm_campaign=home_care_share';
const SHARE_TEXT = 'I use this free seasonal checklist to stay on top of the house — takes 20 seconds to set up, no account.';

export interface ChecklistTask {
  key: string;
  title: string;
  blurb: string;
  diy_or_pro: 'diy' | 'pro' | 'either';
  bookable: boolean;
  est_cost_low: number | null;
  est_cost_high: number | null;
  seasons: string[];
  frequency: string;
  starter: boolean;
  stages?: string[];
}

const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
const SEASON_LABEL: Record<string, string> = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };
const FREQ_LABEL: Record<string, string> = { quarterly: 'Every few months', annual: 'Once a year' };

// Seasonal "project spotlight" — tees up the right big remodel for the moment.
const SEASON_SPOTLIGHTS: Record<string, { eyebrow: string; title: string; body: string }> = {
  winter: {
    eyebrow: 'Winter · design season',
    title: 'The best spring projects start now',
    body: 'Winter is when we design kitchens, baths, and additions — so we can break ground the moment the weather turns.',
  },
  spring: {
    eyebrow: 'Spring · outdoor season',
    title: 'Prime time for decks, patios & windows',
    body: 'Spring is the moment for decks, patios, siding, and windows — and our build calendar fills fast.',
  },
  summer: {
    eyebrow: 'Summer · space season',
    title: 'Add the room you’ve been wanting',
    body: 'Long summer days are made for additions, finished basements, and bonus rooms — comfortable indoor work while the weather’s great outside.',
  },
  fall: {
    eyebrow: 'Fall · host-ready season',
    title: 'Refresh the spaces you gather in',
    body: 'Fall is the time for kitchens, flooring, mudrooms, and finished basements — done and dusted before the holidays.',
  },
};

function costLabel(lo: number | null, hi: number | null): string | null {
  if (lo == null && hi == null) return null;
  if (lo === 0 && hi != null) return `up to $${hi}`;
  if (lo != null && hi != null) return `$${lo}–$${hi}`;
  return null;
}
const id = (key: string, season: string) => `${key}|${season}`;
// Dismissal is scoped to this season of this year, so the card comes back next season.
const catchUpDismissKey = (season: string) => `hc-catchup-dismissed:${seasonStart().getUTCFullYear()}-${season}`;

export default function HomeCareChecklistClient({
  tasks,
  doneItems,
  dismissedKeys = [],
  showStarter = true,
  currentSeason,
  showCatchUp = false,
}: {
  tasks: ChecklistTask[];
  doneItems: { task_key: string; season: string }[];
  dismissedKeys?: string[];
  showStarter?: boolean;
  currentSeason: string;
  showCatchUp?: boolean;
}) {
  const [done, setDone] = useState<Set<string>>(new Set(doneItems.map((d) => id(d.task_key, d.season))));
  const [dismissed, setDismissed] = useState<Set<string>>(new Set(dismissedKeys));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState<string>(SEASONS.includes(currentSeason as (typeof SEASONS)[number]) ? currentSeason : 'spring');
  const [catchUpDismissed, setCatchUpDismissed] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');
  const [stickyTop, setStickyTop] = useState(0);

  // The plan header sticks just below the site header, whose height varies by
  // breakpoint — measure it instead of hardcoding offsets.
  useEffect(() => {
    const measure = () => {
      const header = document.querySelector('header');
      setStickyTop(header ? Math.round(header.getBoundingClientRect().height) : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const shareResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (shareResetTimer.current != null) clearTimeout(shareResetTimer.current);
    };
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(catchUpDismissKey(currentSeason)) === '1') setCatchUpDismissed(true);
    } catch {
      // localStorage unavailable (e.g. blocked storage) — fall back to session-only dismissal
    }
  }, [currentSeason]);

  const dismissCatchUp = () => {
    setCatchUpDismissed(true);
    try {
      window.localStorage.setItem(catchUpDismissKey(currentSeason), '1');
    } catch {
      // localStorage unavailable — dismissal lasts for this page view only
    }
  };

  // What slipped last season: applicable recurring tasks the member never
  // checked off. Recomputed from live state so checking one shrinks the list.
  const lastSeason = prevSeason(currentSeason as Season);
  const missedTasks = tasks.filter((t) => !t.starter && t.seasons.includes(lastSeason) && !done.has(id(t.key, lastSeason)) && !dismissed.has(t.key));
  const showCatchUpCard = showCatchUp && !catchUpDismissed && missedTasks.length > 0 && activeSeason === currentSeason;

  const starterTasks = tasks.filter((t) => t.starter && !dismissed.has(t.key));
  const seasonTasks = tasks.filter((t) => !t.starter && t.seasons.includes(activeSeason) && !dismissed.has(t.key));
  const hiddenTasks = tasks.filter((t) => dismissed.has(t.key));
  const showStarterSection = showStarter && starterTasks.length > 0;
  const hasBookable = tasks.some((t) => t.bookable);

  // Plan progress: the active season's tasks plus (for members who see them)
  // the one-time essentials — one bar for the whole visible plan, dismissed
  // tasks out of the denominator.
  const trackedStarter = showStarterSection ? starterTasks : [];
  const seasonDone = seasonTasks.filter((t) => done.has(id(t.key, activeSeason))).length;
  const starterDone = trackedStarter.filter((t) => done.has(id(t.key, 'starter'))).length;
  const planTotal = seasonTasks.length + trackedStarter.length;
  const planDone = seasonDone + starterDone;
  const planPct = planTotal > 0 ? Math.round((planDone / planTotal) * 100) : 0;
  const planComplete = planTotal > 0 && planDone === planTotal;
  const planLabel = trackedStarter.length > 0 ? `${SEASON_LABEL[activeSeason]} + essentials` : SEASON_LABEL[activeSeason];

  const setDismissState = async (key: string, dismiss: boolean) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      if (dismiss) next.add(key);
      else next.delete(key);
      return next;
    });
    if (dismiss) {
      setSelected((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
    setBusy(`dismiss|${key}`);
    try {
      const res = await fetch('/api/home-care/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ task_key: key, dismiss }),
      });
      if (!res.ok) throw new Error(`dismiss failed: ${res.status}`);
    } catch {
      setDismissed((prev) => {
        const revert = new Set(prev);
        if (dismiss) revert.delete(key);
        else revert.add(key);
        return revert;
      });
    } finally {
      setBusy(null);
    }
  };

  const shareHomeCare = async () => {
    // Native share sheet only where it's a real UX (touch devices) — on
    // desktop the sheet is rare/awkward and copy-link is what people expect.
    const touchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (touchDevice && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'La Vaca Home Care', text: SHARE_TEXT, url: SHARE_URL });
        return;
      } catch (err) {
        // AbortError = the user closed the share sheet — done. Anything else
        // falls through to copy.
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    const payload = `${SHARE_TEXT} ${SHARE_URL}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(payload);
      copied = true;
    } catch {
      // Clipboard API blocked (permissions, older browsers) — legacy path.
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      } finally {
        ta.remove();
      }
    }
    if (!copied) return;
    setShareState('copied');
    if (shareResetTimer.current != null) clearTimeout(shareResetTimer.current);
    shareResetTimer.current = setTimeout(() => setShareState('idle'), 2500);
  };

  const toggleDone = async (key: string, season: string) => {
    const k = id(key, season);
    const nowDone = !done.has(k);
    setDone((prev) => {
      const next = new Set(prev);
      if (nowDone) next.add(k);
      else next.delete(k);
      return next;
    });
    setBusy(k);
    try {
      const res = await fetch('/api/home-care/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ task_key: key, season, done: nowDone }),
      });
      if (!res.ok) throw new Error(`task update failed: ${res.status}`);
    } catch {
      setDone((prev) => {
        const revert = new Set(prev);
        if (nowDone) revert.delete(k);
        else revert.add(k);
        return revert;
      });
    } finally {
      setBusy(null);
    }
  };

  const toggleSelect = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const requestUrl = `/home-care/book?tasks=${[...selected].map(encodeURIComponent).join(',')}`;

  const Row = (t: ChecklistTask, season: string) => {
    const isDone = done.has(id(t.key, season));
    const isSel = selected.has(t.key);
    const cost = costLabel(t.est_cost_low, t.est_cost_high);
    const freq = FREQ_LABEL[t.frequency];
    return (
      <div key={`${t.key}-${season}`} className={`rounded-xl border bg-card p-4 shadow-card transition-colors ${isSel ? 'border-primary bg-primary/5' : 'border-border'} ${isDone ? 'opacity-70' : ''}`}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => toggleDone(t.key, season)}
            disabled={busy === id(t.key, season)}
            aria-label={isDone ? 'Mark not done' : 'Mark done'}
            className="group flex shrink-0 items-start justify-center"
          >
            {/* 20px visible box inside a 44px tap target (global button min-size = WCAG AAA) */}
            <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border-2 transition-colors ${isDone ? 'border-secondary bg-secondary text-white' : 'border-slate-300 group-hover:border-primary'}`}>
              {isDone && <Check className="h-3.5 w-3.5" />}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`text-base font-bold text-text-primary ${isDone ? 'line-through' : ''}`}>{t.title}</h3>
              <span className={`text-[11px] font-extrabold ${t.diy_or_pro === 'pro' ? 'text-amber-700' : t.diy_or_pro === 'diy' ? 'text-emerald-700' : 'text-slate-500'}`}>
                {t.diy_or_pro === 'pro' ? 'PRO' : t.diy_or_pro === 'diy' ? 'DIY' : 'DIY / PRO'}
              </span>
              {freq && <span className="text-[11px] text-slate-400">· {freq}</span>}
              {cost && <span className="text-[11px] text-slate-400">· Pro est. {cost}</span>}
            </div>
            <p className="text-sm text-text-secondary mt-0.5 leading-relaxed">{t.blurb}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              {hasGuideItem(season, t.key) && (
                <a href={`/home-care/guides/${season}#${t.key}`} className="inline-block text-xs font-semibold text-primary hover:underline">
                  Learn more →
                </a>
              )}
              {t.bookable && (
                <a href={`/home-care/book?task=${encodeURIComponent(t.key)}`} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                  <Wrench className="h-3.5 w-3.5" /> Book this now →
                </a>
              )}
              {!isDone && (
                <button
                  type="button"
                  onClick={() => setDismissState(t.key, true)}
                  disabled={busy === `dismiss|${t.key}`}
                  className="group inline-flex items-center justify-start"
                >
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                    <EyeOff className="h-3.5 w-3.5" /> Not relevant
                  </span>
                </button>
              )}
            </div>
          </div>
          {t.bookable && (
            <button
              type="button"
              onClick={() => toggleSelect(t.key)}
              aria-pressed={isSel}
              aria-label={isSel ? `Remove ${t.title} from estimate` : `Add ${t.title} to estimate`}
              className="group flex shrink-0 items-start justify-center"
            >
              {/* 36px visible circle inside a 44px tap target */}
              <span className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all ${isSel ? 'border-primary bg-primary text-white shadow-button' : 'border-slate-300 text-slate-400 group-hover:border-primary group-hover:text-primary'}`}>
                {isSel ? <Check className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
              </span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Sticky plan header: season tabs + one progress bar for the whole
          visible plan (season + essentials). Sits just below the site header
          (measured at runtime) so progress stays visible while checking off. */}
      <div
        className="sticky z-30 -mx-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:-mx-1 sm:rounded-xl sm:border sm:px-3"
        style={{ top: stickyTop }}
      >
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {SEASONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSeason(s)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${activeSeason === s ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-text-secondary hover:bg-muted/70'}`}
            >
              {SEASON_LABEL[s]}{s === currentSeason ? ' · now' : ''}
            </button>
          ))}
        </div>
        {planTotal > 0 && (
          <div className="mt-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-bold text-text-primary">
                <ClipboardList className="h-4 w-4 text-primary" />
                {planLabel} · {planDone} of {planTotal} done
              </span>
              <span className="text-xs font-bold text-text-secondary">{planPct}%</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={planPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${planLabel} progress`}>
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent-sunset transition-all duration-500" style={{ width: `${planPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {planComplete ? 'Everything handled — progress is saved.' : `${planTotal - planDone} to go — progress is saved.`}
            </p>
          </div>
        )}
      </div>

      {/* Plan 100% celebration */}
      {planComplete && activeSeason === currentSeason && (
        <div className="rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-accent-sunset/10 p-5 text-center">
          <PartyPopper className="mx-auto h-8 w-8 text-primary" />
          <h3 className="mt-2 text-lg font-extrabold text-text-primary">{SEASON_LABEL[activeSeason]}: done.</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-text-secondary">
            {trackedStarter.length > 0
              ? 'Every task in your plan is handled — essentials and all. Your house officially likes you.'
              : `Every ${SEASON_LABEL[activeSeason].toLowerCase()} task is handled — your house officially likes you.`}{' '}
            Know someone who&apos;d want this kind of peace of mind?
          </p>
          <button
            type="button"
            onClick={shareHomeCare}
            aria-live="polite"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground shadow-button transition-all hover:-translate-y-px"
          >
            <Share2 className="h-4 w-4" /> {shareState === 'copied' ? 'Link copied' : 'Share Home Care'}
          </button>
        </div>
      )}

      {/* Catch-up: what slipped last season (returning members only) */}
      {showCatchUpCard && (
        <div className="rounded-2xl border-2 border-amber-300/70 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 mb-1">
              <History className="h-5 w-5 text-amber-700" />
              <h2 className="text-lg font-extrabold text-text-primary">
                Left over from {SEASON_LABEL[lastSeason]}: {missedTasks.length} task{missedTasks.length === 1 ? '' : 's'}
              </h2>
            </div>
            <button
              type="button"
              onClick={dismissCatchUp}
              aria-label="Dismiss catch-up"
              className="group flex shrink-0 items-start justify-center"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full text-amber-700/70 group-hover:bg-amber-100 group-hover:text-amber-900 transition-colors">
                <X className="h-4 w-4" />
              </span>
            </button>
          </div>
          <p className="text-sm text-text-secondary mb-3">
            These didn&apos;t get checked off last season. Most still matter — knock them out (or check off the ones you already did) before diving into {SEASON_LABEL[activeSeason]}.
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {missedTasks.slice(0, 4).map((t) => (
              <span key={t.key} className="rounded-full bg-white border border-amber-200 text-xs font-semibold text-text-secondary px-2.5 py-1">{t.title}</span>
            ))}
            {missedTasks.length > 4 && (
              <span className="rounded-full bg-white border border-amber-200 text-xs font-semibold text-text-secondary px-2.5 py-1">+{missedTasks.length - 4} more</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setActiveSeason(lastSeason)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground shadow-button transition-all hover:-translate-y-px"
          >
            Review {SEASON_LABEL[lastSeason]} →
          </button>
        </div>
      )}

      {hasBookable && selected.size === 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs font-semibold text-text-secondary">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary/40 text-primary"><Plus className="h-3.5 w-3.5" /></span>
          Tap the <span className="text-primary font-bold">＋</span> on any task to add it to your estimate.
        </div>
      )}

      <div className="space-y-3">
        {/* One-time essentials, part of the same list so the plan bar tracks them */}
        {showStarterSection && (
          <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-extrabold text-text-primary">New Homeowner Essentials</h2>
            </div>
            <p className="text-sm text-text-secondary mb-3">One-time setup for a home you just bought — knock these out first, then the seasonal stuff is a breeze.</p>
            <div className="space-y-3">{starterTasks.map((t) => Row(t, 'starter'))}</div>
          </div>
        )}
        {SEASON_SPOTLIGHTS[activeSeason] && (
          <div className="rounded-2xl border border-accent-sunset/30 bg-gradient-to-br from-primary/5 to-accent-sunset/10 p-4">
            <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-accent-sunset">{SEASON_SPOTLIGHTS[activeSeason].eyebrow}</p>
            <h3 className="text-base font-extrabold text-text-primary">{SEASON_SPOTLIGHTS[activeSeason].title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{SEASON_SPOTLIGHTS[activeSeason].body}</p>
            <a
              href={`/free-estimate?utm_source=home_care&utm_medium=portal&utm_campaign=seasonal_project&season=${activeSeason}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent-sunset px-4 py-2.5 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-px"
            >
              Book a free design consult →
            </a>
          </div>
        )}
        {seasonTasks.length === 0 ? (
          <p className="text-text-secondary">Nothing for {SEASON_LABEL[activeSeason]} with your current home details.</p>
        ) : (
          seasonTasks.map((t) => Row(t, activeSeason))
        )}
      </div>

      {/* Hidden ("not relevant") tasks — collapsed strip with one-tap restore */}
      {hiddenTasks.length > 0 && (
        <details className="group rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-text-secondary [&::-webkit-details-marker]:hidden">
            <EyeOff className="h-4 w-4" />
            Hidden ({hiddenTasks.length}) — marked not relevant to your home
            <span className="ml-auto text-xs font-bold text-primary group-open:hidden">show</span>
            <span className="ml-auto hidden text-xs font-bold text-primary group-open:inline">hide</span>
          </summary>
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            {hiddenTasks.map((t) => (
              <div key={t.key} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-text-secondary">{t.title}</span>
                <button
                  type="button"
                  onClick={() => setDismissState(t.key, false)}
                  disabled={busy === `dismiss|${t.key}`}
                  className="group/r flex shrink-0 items-center justify-center"
                >
                  <span className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-bold text-primary group-hover/r:border-primary/50 transition-colors">
                    <RotateCcw className="h-3 w-3" /> Restore
                  </span>
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Share card — members are the best ad channel */}
      <div className="rounded-2xl bg-secondary p-5 text-secondary-foreground">
        <h3 className="text-base font-extrabold">Know someone drowning in house stuff?</h3>
        <p className="mt-1 text-sm text-secondary-foreground/75">
          Home Care is free for any Northern NJ homeowner — send it to a friend or neighbor.
        </p>
        <button
          type="button"
          onClick={shareHomeCare}
          aria-live="polite"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent-sunset px-4 py-2.5 text-sm font-bold text-white shadow-button transition-all hover:-translate-y-px"
        >
          {shareState === 'copied' ? <Copy className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          {shareState === 'copied' ? 'Link copied — paste it anywhere' : 'Share Home Care'}
        </button>
      </div>

      {selected.size > 0 && (
        <a
          href={requestUrl}
          aria-label={`Request an estimate for ${selected.size} selected service${selected.size > 1 ? 's' : ''}`}
          className="fixed right-4 bottom-6 z-[60] inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine py-3 pl-5 pr-3 text-sm font-bold text-white shadow-button hover:-translate-y-px transition-all"
        >
          <ClipboardList className="h-4 w-4" /> Estimate
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-extrabold text-primary">{selected.size}</span>
        </a>
      )}
    </div>
  );
}
