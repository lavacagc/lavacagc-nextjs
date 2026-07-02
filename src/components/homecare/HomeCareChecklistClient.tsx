'use client';

import { useState } from 'react';
import { Check, Plus, Wrench, ClipboardList, Sparkles } from 'lucide-react';
import { hasGuideItem } from '@/lib/homecare/guides';

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

export default function HomeCareChecklistClient({
  tasks,
  doneItems,
  showStarter = true,
  currentSeason,
}: {
  tasks: ChecklistTask[];
  doneItems: { task_key: string; season: string }[];
  showStarter?: boolean;
  currentSeason: string;
}) {
  const [done, setDone] = useState<Set<string>>(new Set(doneItems.map((d) => id(d.task_key, d.season))));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState<string>(SEASONS.includes(currentSeason as (typeof SEASONS)[number]) ? currentSeason : 'spring');

  const starterTasks = tasks.filter((t) => t.starter);
  const seasonTasks = tasks.filter((t) => !t.starter && t.seasons.includes(activeSeason));
  const showStarterSection = showStarter && starterTasks.length > 0;
  const hasBookable = tasks.some((t) => t.bookable);

  const toggleDone = async (key: string, season: string) => {
    const k = id(key, season);
    const next = new Set(done);
    const nowDone = !next.has(k);
    if (nowDone) next.add(k);
    else next.delete(k);
    setDone(next);
    setBusy(k);
    try {
      await fetch('/api/home-care/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ task_key: key, season, done: nowDone }),
      });
    } catch {
      const revert = new Set(done);
      if (nowDone) revert.delete(k);
      else revert.add(k);
      setDone(revert);
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

      {/* Season tabs */}
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

      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <ClipboardList className="h-4 w-4 text-primary" />
        <span>{SEASON_LABEL[activeSeason]}: {seasonTasks.filter((t) => done.has(id(t.key, activeSeason))).length} of {seasonTasks.length} done — progress is saved.</span>
      </div>

      {hasBookable && selected.size === 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs font-semibold text-text-secondary">
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary/40 text-primary"><Plus className="h-3.5 w-3.5" /></span>
          Tap the <span className="text-primary font-bold">＋</span> on any task to add it to your estimate.
        </div>
      )}

      <div className="space-y-3">
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
