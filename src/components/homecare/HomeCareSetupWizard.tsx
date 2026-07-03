'use client';

import { useState } from 'react';
import { Check, ChevronLeft, Loader2, Sparkles, ArrowRight, Home, Wrench, HardHat, Tag, type LucideIcon } from 'lucide-react';
import {
  STAGES,
  SYSTEM_QUESTIONS,
  PROFILE_EXTRAS,
  getStage,
  stageShowsStarter,
  type Stage,
  type HomeSystems,
} from '@/lib/homecare/profile';

const STEP_LABELS = ['Your stage', 'Your program', 'Your home', 'A few details', 'Done'];

// Brand icon per stage (no-emoji design rule — lucide icons only).
const STAGE_ICONS: Record<Stage, LucideIcon> = {
  just_bought: Home,
  established: Wrench,
  new_construction: HardHat,
  selling: Tag,
};

export interface WizardInitial {
  stage: Stage | null;
  systems: HomeSystems;
}

export default function HomeCareSetupWizard({
  initial,
  firstName,
  isEdit = false,
  demo = false,
}: {
  initial: WizardInitial;
  firstName?: string | null;
  isEdit?: boolean;
  demo?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<Stage | null>(initial.stage);
  const [systems, setSystems] = useState<HomeSystems>(initial.systems ?? {});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedDemo, setSavedDemo] = useState(false);

  const total = STEP_LABELS.length;
  const stageDef = getStage(stage);

  const toggleSystem = (key: string) =>
    setSystems((s) => {
      const on = s[key] === true;
      const next = { ...s, [key]: !on };
      if (on) {
        // turning off → drop its follow-up answers
        const q = SYSTEM_QUESTIONS.find((x) => x.key === key);
        for (const f of q?.followups ?? []) delete next[f.key];
      }
      return next;
    });
  const setValue = (key: string, value: string) => setSystems((s) => ({ ...s, [key]: value }));

  const next = () => setStep((s) => Math.min(s + 1, total - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const finish = async () => {
    if (demo) {
      setSavedDemo(true);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/home-care/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ stage, systems }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      window.location.assign('/home-care/checklist?welcome=1');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
      setSaving(false);
    }
  };

  const canContinue = step !== 0 || stage !== null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Step {step + 1} of {total} · {STEP_LABELS[step]}
          </span>
          <span className="text-xs font-semibold text-text-muted">{Math.round(((step + 1) / total) * 100)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent-tangerine transition-all duration-300" style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-card">
        {/* STEP 1 — Stage */}
        {step === 0 && (
          <div>
            <h2 className="text-2xl font-extrabold text-text-primary mb-1">{firstName ? `Welcome, ${firstName}!` : 'Welcome!'} Where are you with this home?</h2>
            <p className="text-text-secondary mb-5">This shapes your starting checklist. You can change it anytime.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {STAGES.map((s) => {
                const on = stage === s.key;
                const StageIcon = STAGE_ICONS[s.key];
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStage(s.key)}
                    className={`flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-all ${on ? 'border-primary bg-primary/5 shadow-button' : 'border-border hover:border-primary/40'}`}
                  >
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${on ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}`}><StageIcon className="h-5 w-5" /></span>
                    <span className="font-bold text-text-primary">{s.label}</span>
                    <span className="text-sm text-text-secondary">{s.tagline}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2 — Program intro */}
        {step === 1 && stageDef && (
          <div>
            <div className="flex items-center gap-2 text-primary mb-3"><Sparkles className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wider">Your program</span></div>
            <h2 className="text-2xl font-extrabold text-text-primary mb-3">
              {stageDef.label}
            </h2>
            <p className="text-lg text-text-secondary leading-relaxed mb-5">{stageDef.intro}</p>
            <ul className="space-y-2">
              {(stageShowsStarter(stage) ? [
                'A one-time essentials checklist to knock out first',
                'Season-by-season tasks tailored to your home',
                'One-tap booking whenever you’d rather we handled it',
              ] : [
                'Season-by-season tasks tailored to your home',
                'Seasonal email reminders so nothing slips',
                'One-tap booking whenever you’d rather we handled it',
              ]).map((li) => (
                <li key={li} className="flex items-start gap-2 text-text-primary">
                  <Check className="h-5 w-5 shrink-0 text-secondary mt-0.5" /> {li}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* STEP 3 — Systems + follow-ups */}
        {step === 2 && (
          <div>
            <h2 className="text-2xl font-extrabold text-text-primary mb-1">What does your home have?</h2>
            <p className="text-text-secondary mb-5">Tap what applies — we&apos;ll only show tasks that fit your home.</p>
            <div className="space-y-3">
              {SYSTEM_QUESTIONS.map((q) => {
                const on = systems[q.key] === true;
                return (
                  <div key={q.key} className={`rounded-xl border p-3.5 transition-colors ${on ? 'border-primary/50 bg-primary/[0.03]' : 'border-border'}`}>
                    <button type="button" onClick={() => toggleSystem(q.key)} className="flex w-full items-center gap-3 text-left">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-primary bg-primary text-white' : 'border-slate-300'}`}>{on && <Check className="h-4 w-4" />}</span>
                      <span className="flex-1">
                        <span className="font-bold text-text-primary">{q.label}</span>
                        {q.hint && <span className="block text-xs text-text-muted">{q.hint}</span>}
                      </span>
                    </button>
                    {on && (q.followups?.length ?? 0) > 0 && (
                      <div className="mt-3 pl-9 space-y-3">
                        {q.followups!.map((f) => (
                          <div key={f.key}>
                            <p className="text-xs font-semibold text-text-secondary mb-1.5">{f.label}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {f.options.map((o) => {
                                const sel = systems[f.key] === o.value;
                                return (
                                  <button key={o.value} type="button" onClick={() => setValue(f.key, o.value)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${sel ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:border-primary/40'}`}>
                                    {o.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 4 — A few more details */}
        {step === 3 && (
          <div>
            <h2 className="text-2xl font-extrabold text-text-primary mb-1">A few more details</h2>
            <p className="text-text-secondary mb-5">Optional — it helps us fine-tune timing and tips.</p>
            <div className="space-y-5">
              {PROFILE_EXTRAS.map((f) => (
                <div key={f.key}>
                  <p className="text-sm font-bold text-text-primary mb-2">{f.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {f.options.map((o) => {
                      const sel = systems[f.key] === o.value;
                      return (
                        <button key={o.value} type="button" onClick={() => setValue(f.key, o.value)} className={`rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${sel ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary hover:border-primary/40'}`}>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5 — Summary */}
        {step === 4 && (
          <div>
            <div className="flex items-center gap-2 text-secondary mb-3"><Check className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wider">All set</span></div>
            <h2 className="text-2xl font-extrabold text-text-primary mb-3">Your personalized plan is ready</h2>
            <div className="rounded-xl bg-muted/50 border border-border p-4 mb-4">
              <p className="text-sm"><span className="font-bold text-text-primary">Stage:</span> <span className="text-text-secondary">{stageDef ? stageDef.label : '—'}</span></p>
              <p className="text-sm mt-2"><span className="font-bold text-text-primary">Your home has:</span> </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {SYSTEM_QUESTIONS.filter((q) => systems[q.key] === true).map((q) => (
                  <span key={q.key} className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1">{q.label}</span>
                ))}
                {SYSTEM_QUESTIONS.filter((q) => systems[q.key] === true).length === 0 && <span className="text-xs text-text-muted">the seasonal basics</span>}
              </div>
            </div>
            {savedDemo && <p className="mb-3 rounded-lg bg-secondary/10 text-secondary text-sm font-semibold px-3 py-2">Demo — in the real flow this saves your profile and opens your checklist.</p>}
            {err && <p className="mb-3 text-sm font-semibold text-destructive">{err}</p>}
          </div>
        )}

        {/* Nav */}
        <div className="mt-7 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button type="button" onClick={back} className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary hover:text-primary">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          ) : <span />}
          {step < total - 1 ? (
            <button type="button" onClick={next} disabled={!canContinue} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent-tangerine px-6 py-3 text-sm font-bold text-primary-foreground shadow-button hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0">
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" onClick={finish} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine px-6 py-3 text-sm font-bold text-white shadow-button hover:-translate-y-px transition-all disabled:opacity-60">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>{isEdit ? 'Save my program' : 'See my personalized checklist'} <ArrowRight className="h-4 w-4" /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
