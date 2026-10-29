'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { Lang } from '@/lib/home-services/catalog';
import { s } from '@/lib/home-services/i18n';

/**
 * The confirmation screen (grill 001 Q9, Q10; RF8-RF10). When the server sent a
 * text code it also shows the 4-digit field; verifying is optional - the request
 * is already saved, and nothing stops the homeowner from leaving.
 */
export default function FlowDone({
  lang,
  merged,
  verification,
  requestId,
}: {
  lang: Lang;
  merged: boolean;
  verification: 'sent' | 'skipped';
  requestId: string | null;
}) {
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'verified'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    if (!requestId || !/^\d{4}$/.test(code)) {
      setMessage(s('verifyWrong', lang));
      return;
    }
    setState('checking');
    setMessage(null);
    try {
      const res = await fetch('/api/home-services/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, code }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && data.ok) {
        setState('verified');
        return;
      }
      setMessage(res.status === 429 ? s('errorRate', lang) : s('verifyWrong', lang));
    } catch {
      setMessage(s('errorGeneric', lang));
    }
    setState('idle');
  }

  async function resend() {
    if (!requestId) return;
    setMessage(null);
    try {
      const res = await fetch('/api/home-services/verify/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      setMessage(res.status === 429 ? s('verifyLimit', lang) : res.ok ? s('verifyResent', lang) : s('errorGeneric', lang));
    } catch {
      setMessage(s('errorGeneric', lang));
    }
  }

  return (
    <div className="py-4 text-center" data-testid="flow-done">
      <CheckCircle2 aria-hidden className="mx-auto h-14 w-14 text-accent-teal" />
      <h3 tabIndex={-1} data-step-heading className="mt-4 text-2xl font-extrabold tracking-tight text-text-primary focus:outline-none">
        {s('doneTitle', lang)}
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-text-secondary">{s('doneBody', lang)}</p>
      {merged && (
        <p className="mx-auto mt-3 max-w-sm rounded-xl bg-background-soft p-3 text-sm text-text-secondary" data-testid="done-merged">
          {s('doneMerged', lang)}
        </p>
      )}

      {verification === 'sent' && (
        <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-border p-5 text-left" data-testid="verify-panel">
          {state === 'verified' ? (
            <p role="status" className="font-bold text-accent-teal">
              {s('verifyDone', lang)}
            </p>
          ) : (
            <>
              <p className="font-bold text-text-primary">{s('verifyTitle', lang)}</p>
              <p className="mt-1 text-sm text-text-secondary">{s('verifyBody', lang)}</p>
              <label htmlFor="hs-code" className="mt-4 block text-sm font-bold text-text-primary">
                {s('verifyCodeLabel', lang)}
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="hs-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="min-h-[48px] w-28 rounded-xl border-2 border-border bg-card px-4 text-center text-xl font-bold tracking-[0.4em] focus:border-secondary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={confirm}
                  disabled={state === 'checking'}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-secondary px-4 font-bold text-white disabled:opacity-60"
                >
                  {state === 'checking' && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                  {s('verifyButton', lang)}
                </button>
              </div>
              <button type="button" onClick={resend} className="mt-3 min-h-[44px] text-sm font-bold text-secondary underline underline-offset-4">
                {s('verifyResend', lang)}
              </button>
            </>
          )}
          {message && (
            <p role="status" className="mt-2 text-sm font-semibold text-red-700">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
