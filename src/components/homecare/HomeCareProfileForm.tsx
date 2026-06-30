'use client';

import { useState } from 'react';
import { Loader2, Check, Home } from 'lucide-react';
import { ASKABLE_SYSTEMS, type HomeSystems } from '@/lib/homecare/profile';

export default function HomeCareProfileForm({ initial, hasProfile }: { initial: HomeSystems; hasProfile: boolean }) {
  const [systems, setSystems] = useState<HomeSystems>(initial);
  const [open, setOpen] = useState(!hasProfile);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (key: string) => setSystems((s) => ({ ...s, [key]: !s[key as keyof HomeSystems] }));

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      // Ensure every askable key is sent explicitly (unchecked → false).
      const payload: Record<string, boolean> = {};
      for (const { key } of ASKABLE_SYSTEMS) payload[key] = systems[key as keyof HomeSystems] === true;
      const res = await fetch('/api/home-care/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ systems: payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Re-render the server checklist with the new filter.
      window.location.assign('/home-care/checklist');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-2 font-bold text-text-primary">
          <Home className="h-4 w-4 text-primary" />
          {hasProfile ? 'Update your home details' : 'Tell us about your home for a sharper list'}
        </span>
        <span className="text-sm text-primary font-semibold">{open ? 'Hide' : 'Edit'}</span>
      </button>

      {open && (
        <div className="mt-4">
          <p className="text-sm text-text-secondary mb-3">Check what your home has — we&apos;ll tailor the checklist (and your seasonal emails) to it.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {ASKABLE_SYSTEMS.map((s) => {
              const on = systems[s.key as keyof HomeSystems] === true;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggle(s.key)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${on ? 'border-primary bg-primary/10 text-text-primary' : 'border-border text-text-secondary hover:border-primary/50'}`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded border ${on ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                    {on && <Check className="h-3.5 w-3.5" />}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </div>
          {err && <p className="mt-3 text-sm font-semibold text-destructive">{err}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-accent-tangerine px-5 py-2.5 text-sm font-bold text-primary-foreground hover:shadow-button transition-all disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save my home details
          </button>
        </div>
      )}
    </div>
  );
}
