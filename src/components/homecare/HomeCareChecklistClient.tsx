'use client';

import { useState } from 'react';
import { Check, Wrench, ClipboardList } from 'lucide-react';

export interface ChecklistTask {
  key: string;
  title: string;
  blurb: string;
  diy_or_pro: 'diy' | 'pro' | 'either';
  bookable: boolean;
  est_cost_low: number | null;
  est_cost_high: number | null;
}

function costLabel(lo: number | null, hi: number | null): string | null {
  if (lo == null && hi == null) return null;
  if (lo === 0 && hi != null) return `up to $${hi}`;
  if (lo != null && hi != null) return `$${lo}–$${hi}`;
  return null;
}

export default function HomeCareChecklistClient({ tasks, doneKeys }: { tasks: ChecklistTask[]; doneKeys: string[] }) {
  const [done, setDone] = useState<Set<string>>(new Set(doneKeys));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const toggleDone = async (key: string) => {
    const next = new Set(done);
    const nowDone = !next.has(key);
    if (nowDone) next.add(key);
    else next.delete(key);
    setDone(next); // optimistic
    setBusy(key);
    try {
      await fetch('/api/home-care/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ task_key: key, done: nowDone }),
      });
    } catch {
      // revert on failure
      const revert = new Set(done);
      if (nowDone) revert.delete(key);
      else revert.add(key);
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
  const completed = tasks.filter((t) => done.has(t.key)).length;

  return (
    <div className="space-y-3 pb-24">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <ClipboardList className="h-4 w-4 text-primary" />
        <span>{completed} of {tasks.length} done this season — your progress is saved.</span>
      </div>

      {tasks.map((t) => {
        const isDone = done.has(t.key);
        const isSel = selected.has(t.key);
        const cost = costLabel(t.est_cost_low, t.est_cost_high);
        return (
          <div key={t.key} className={`rounded-xl border bg-card p-4 shadow-card transition-colors ${isDone ? 'border-border opacity-70' : 'border-border'}`}>
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => toggleDone(t.key)}
                disabled={busy === t.key}
                aria-label={isDone ? 'Mark not done' : 'Mark done'}
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${isDone ? 'border-secondary bg-secondary text-white' : 'border-slate-300 hover:border-primary'}`}
              >
                {isDone && <Check className="h-4 w-4" />}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`text-base font-bold text-text-primary ${isDone ? 'line-through' : ''}`}>{t.title}</h3>
                  <span className={`text-[11px] font-extrabold ${t.diy_or_pro === 'pro' ? 'text-amber-700' : t.diy_or_pro === 'diy' ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {t.diy_or_pro === 'pro' ? 'PRO' : t.diy_or_pro === 'diy' ? 'DIY' : 'DIY / PRO'}
                  </span>
                  {cost && <span className="text-[11px] text-slate-400">Pro est. {cost}</span>}
                </div>
                <p className="text-sm text-text-secondary mt-0.5 leading-relaxed">{t.blurb}</p>

                {t.bookable && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSelect(t.key)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${isSel ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:border-primary/50'}`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded border ${isSel ? 'bg-primary border-primary text-white' : 'border-slate-300'}`}>{isSel && <Check className="h-3 w-3" />}</span>
                      Add to estimate
                    </button>
                    <a href={`/home-care/book?task=${encodeURIComponent(t.key)}`} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent-tangerine px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:shadow-button transition-all">
                      <Wrench className="h-3.5 w-3.5" /> Book now
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Sticky estimate bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur p-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)]">
          <div className="container mx-auto max-w-3xl flex items-center justify-between gap-3 px-4">
            <span className="text-sm font-semibold text-text-primary">{selected.size} service{selected.size > 1 ? 's' : ''} selected</span>
            <a href={requestUrl} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine px-5 py-2.5 text-sm font-bold text-white shadow-button hover:-translate-y-px transition-all">
              Request an estimate →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
