'use client';

import { useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { HOME_DETAILS_CONSENT_TEXT, MAX_NOTE, type HomeFact } from '@/lib/homecare/records';

export interface RecordValue {
  note: string | null;
  detail: Record<string, unknown>;
}

const MIN_YEAR = 1900;
const isFilledYear = (raw: string): boolean => {
  const n = parseInt(raw.trim(), 10);
  return Number.isInteger(n) && n >= MIN_YEAR && n <= new Date().getFullYear() + 1;
};

/**
 * Inline "save a home detail" panel shown under a checklist task row. The
 * homeowner is already signed in (the checklist page gates on hc_access), so
 * this only collects + posts the fact. It posts to POST /api/home-care/record,
 * which is the sole homeowner write path and re-gates the session server-side.
 *
 * First-ever save shows the affirmative consent checkbox whose label is the
 * exact HOME_DETAILS_CONSENT_TEXT the server logs to consent_logs (imported, not
 * hardcoded, so the two never drift). Once consent is given (showConsent false)
 * the checkbox is suppressed. A consent-log failure returns 500 without storing
 * the record, so we keep consent state and let the homeowner retry as a first
 * save - onSaved (which flips the parent's consentGiven) fires only on a 200.
 */
export default function HomeCareRecordCapture({
  fact,
  sourceTaskKey,
  prefill,
  showConsent,
  onSaved,
}: {
  fact: HomeFact;
  sourceTaskKey: string;
  prefill?: RecordValue;
  showConsent: boolean;
  onSaved: (value: RecordValue) => void;
}) {
  const [note, setNote] = useState<string>(prefill?.note ?? '');
  const [detail, setDetail] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const field of fact.fields) {
      const v = prefill?.detail?.[field.key];
      init[field.key] = v == null ? '' : String(v);
    }
    return init;
  });
  const [consentChecked, setConsentChecked] = useState(false);
  const [forceConsent, setForceConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show the consent checkbox on the first save, or when the server rejects a
  // save with 403 (the homeowner cleared all their rows in another tab, so this
  // stale panel thought consent was already on): let them re-consent inline.
  const needConsent = showConsent || forceConsent;

  const trimmedNote = note.trim();
  // A save must carry something the server will keep: a note, or (for appliance
  // facts) at least one non-empty text field or a valid year. Mirrors the
  // route's "Nothing to save" guard so Save is only enabled when it will land.
  const hasDetail = fact.fields.some((f) =>
    f.type === 'year' ? isFilledYear(detail[f.key] ?? '') : (detail[f.key] ?? '').trim() !== '',
  );
  const hasContent = trimmedNote !== '' || hasDetail;
  const canSave = !saving && hasContent && (!needConsent || consentChecked);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const detailPayload: Record<string, string> = {};
    for (const field of fact.fields) {
      const v = (detail[field.key] ?? '').trim();
      const keep = field.type === 'year' ? isFilledYear(v) : v !== '';
      if (keep) detailPayload[field.key] = v;
    }
    try {
      const res = await fetch('/api/home-care/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          fact_key: fact.key,
          source_task_key: sourceTaskKey,
          note: trimmedNote,
          detail: detailPayload,
          // consent:true only when consent is still needed; the server logs it
          // before storing, and if that log fails it 500s without saving.
          ...(needConsent ? { consent: true } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (res.status === 403) {
          setForceConsent(true);
          setError('Please confirm your consent to save.');
          return;
        }
        setError(data.error || 'Could not save. Please try again.');
        return;
      }
      onSaved({ note: trimmedNote || null, detail: detailPayload });
      setSavedFlash(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 2500);
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-accent-teal/30 bg-accent-teal/5 p-4">
      <p className="mb-3 text-sm font-bold text-text-primary">{fact.prompt}</p>

      {fact.kind === 'location' ? (
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-extrabold uppercase tracking-wider text-text-secondary">
            {fact.label}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={MAX_NOTE}
            placeholder="e.g. basement, back wall behind the furnace"
            className="lv-cap-input"
          />
        </label>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {fact.fields.map((field) => (
            <label key={field.key} className="block">
              <span className="mb-1.5 block text-[13px] font-extrabold uppercase tracking-wider text-text-secondary">
                {field.label}
              </span>
              <input
                value={detail[field.key] ?? ''}
                onChange={(e) => setDetail((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                {...(field.type === 'year'
                  ? { inputMode: 'numeric' as const, maxLength: 4 }
                  : { maxLength: field.max ?? 60 })}
                className="lv-cap-input"
              />
            </label>
          ))}
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-extrabold uppercase tracking-wider text-text-secondary">
              Anything else? (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={MAX_NOTE}
              placeholder="e.g. it's in the attic, filter door faces the hall"
              className="lv-cap-input"
            />
          </label>
        </div>
      )}

      {needConsent && (
        <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4">
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-text-secondary">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
            />
            <span>{HOME_DETAILS_CONSENT_TEXT}</span>
          </label>
        </div>
      )}

      {error && <p className="mt-3 text-sm font-semibold text-destructive">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground shadow-button transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
          ) : (
            'Save home detail'
          )}
        </button>
        <span aria-live="polite" className="text-sm font-semibold text-accent-teal">
          {savedFlash && (
            <span className="inline-flex items-center gap-1">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text-muted">
        Only La Vaca&apos;s team sees this. You can edit or delete it anytime from your Home Care account.
      </p>

      <style jsx>{`
        :global(.lv-cap-input) {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          color: hsl(var(--text-primary));
          padding: 0.6875rem 0.875rem;
          font-size: 1rem;
          font-family: inherit;
          outline: none;
          transition: all 0.2s ease;
        }
        :global(.lv-cap-input:focus) {
          border-color: hsl(var(--accent-teal));
          box-shadow: 0 0 0 4px hsl(var(--accent-teal) / 0.16);
        }
      `}</style>
    </div>
  );
}
