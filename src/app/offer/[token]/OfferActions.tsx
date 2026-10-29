'use client';

/**
 * The sub's buttons on /offer/<token>: Accept (or the confirm step after Alex
 * accepts a counter or names a price), and Respond, which opens the counter,
 * details and decline forms. A sub who is not approved sees ONE button, the
 * SpecNook signup link (OF3).
 *
 * Every action POSTs to /api/offers/<token>; on success the server page is
 * re-rendered so what the sub sees is always what the database says.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lang } from '@/lib/home-services/catalog';
import { s, type StringKey } from '@/lib/home-services/i18n';
import { formatDollars } from '@/lib/home-services/pricing';
import { DECLINE_REASONS, DECLINE_REASON_KEY, MAX_RESPONSE_FILES, MAX_RESPONSE_FILE_BYTES, type DeclineReason } from '@/lib/home-services/offerRules';

const ERROR_KEY: Record<string, StringKey> = {
  taken: 'offerTaken',
  won: 'offerAccepted',
  expired: 'offerExpired',
  cancelled: 'offerCancelled',
  not_eligible: 'offerSignUpBody',
  rate_limited: 'offerErrorRate',
  price_required: 'offerCounterPriceRequired',
  details_required: 'offerDetailsRequired',
  too_many_files: 'offerFilesTooMany',
  file_too_big: 'offerFileTooBig',
  invalid_link: 'offerInvalidTitle',
};

type Form = 'counter' | 'details' | 'decline';

const primaryBtn = 'inline-flex w-full items-center justify-center rounded-lg bg-[#B4600F] px-5 py-3.5 text-base font-bold text-white hover:bg-[#9A510C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B4600F] disabled:opacity-60';
const secondaryBtn = 'inline-flex w-full items-center justify-center rounded-lg border border-[#1A1A1A] bg-white px-5 py-3 text-base font-bold text-[#1A1A1A] hover:bg-[#F5F2EE] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A1A1A] disabled:opacity-60';
const inputCls = 'mt-1 block w-full rounded-md border border-[#C9C2BA] bg-white px-3 py-2.5 text-base text-[#1A1A1A] focus:border-[#B4600F] focus:outline-none focus:ring-2 focus:ring-[#B4600F]/30';
const labelCls = 'block text-sm font-bold text-[#1A1A1A]';

export default function OfferActions({
  token, lang, canAccept, signupUrl, confirm,
}: {
  token: string;
  lang: Lang;
  canAccept: boolean;
  signupUrl: string;
  confirm: { cents: number; source: 'accepted_counter' | 'admin_price' } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [open, setOpen] = useState<Form | null>(null);
  const [respondOpen, setRespondOpen] = useState(false);

  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [reason, setReason] = useState<DeclineReason | ''>('');
  const fileInput = useRef<HTMLInputElement>(null);

  async function post(body: BodyInit, json: boolean, success: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/offers/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: json ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(s(ERROR_KEY[data.error ?? ''] ?? 'offerErrorGeneric', lang));
        if (['taken', 'expired', 'cancelled', 'won'].includes(data.error ?? '')) router.refresh();
        return;
      }
      setDone(success);
      setOpen(null);
      setRespondOpen(false);
      router.refresh();
    } catch {
      setError(s('offerErrorGeneric', lang));
    } finally {
      setBusy(false);
    }
  }

  const sendJson = (body: Record<string, unknown>, success: string) => post(JSON.stringify(body), true, success);

  function submitCounter(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = price.replace(/[$,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned) || Number(cleaned) <= 0) {
      setError(s('offerCounterPriceRequired', lang));
      return;
    }
    void sendJson({ action: 'counter', price: cleaned, note }, s('offerCounterSent', lang, { price: formatDollars(Math.round(Number(cleaned) * 100)) }));
  }

  function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) { setError(s('offerDetailsRequired', lang)); return; }
    if (files.length > MAX_RESPONSE_FILES) { setError(s('offerFilesTooMany', lang)); return; }
    if (files.some((f) => f.size > MAX_RESPONSE_FILE_BYTES)) { setError(s('offerFileTooBig', lang)); return; }
    const form = new FormData();
    form.set('action', 'details');
    form.set('text', text.trim());
    for (const f of files) form.append('files', f);
    void post(form, false, s('offerDetailsSent', lang));
  }

  function submitDecline(e: React.FormEvent) {
    e.preventDefault();
    void sendJson({ action: 'decline', reason: reason || null, note }, s('offerDeclined', lang));
  }

  const status = (
    <div aria-live="polite" className={error ? 'mt-3' : ''}>
      {error && <p role="alert" id="offer-action-error" className="rounded-md bg-[#FDECEC] px-3 py-2 text-sm font-medium text-[#9B1C1C]" data-testid="offer-error">{error}</p>}
      {/* The refreshed server page shows the lasting notice; this only announces the change. */}
      {done && !error && <p className="sr-only" data-testid="offer-done">{done}</p>}
    </div>
  );

  if (!canAccept) {
    return (
      <section className="mt-6" data-testid="offer-signup">
        <p className="text-sm text-[#303030]">{s('offerSignUpBody', lang)}</p>
        <a href={signupUrl} className={`${primaryBtn} mt-3`} data-testid="offer-signup-link">{s('offerSignUp', lang)}</a>
      </section>
    );
  }

  return (
    <section className="mt-6" aria-label={s('offerRespond', lang)}>
      {confirm ? (
        <div className="rounded-lg border-2 border-[#B4600F] p-4" data-testid="offer-confirm-step">
          <h2 className="text-lg font-bold text-[#1A1A1A]">
            {confirm.source === 'accepted_counter'
              ? s('offerConfirmTitle', lang)
              : s('offerAlexPriceTitle', lang, { price: formatDollars(confirm.cents) })}
          </h2>
          <p className="mt-1 text-sm text-[#303030]">
            {confirm.source === 'accepted_counter' ? s('offerConfirmBody', lang) : s('offerAlexPriceBody', lang)}
          </p>
          <p className="mt-2 text-2xl font-bold text-[#1A1A1A]">{formatDollars(confirm.cents)}</p>
          <button type="button" className={`${primaryBtn} mt-3`} disabled={busy} onClick={() => sendJson({ action: 'confirm' }, s('offerConfirmed', lang))} data-testid="offer-confirm">
            {busy ? s('offerSending', lang) : s('offerConfirm', lang)}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-sm text-[#303030]">{s('offerAcceptBody', lang)}</p>
          <button type="button" className={`${primaryBtn} mt-3`} disabled={busy} onClick={() => sendJson({ action: 'accept' }, s('offerAccepted', lang))} data-testid="offer-accept">
            {busy && !open ? s('offerSending', lang) : s('offerAccept', lang)}
          </button>
        </div>
      )}

      <button
        type="button"
        className={`${secondaryBtn} mt-3`}
        aria-expanded={respondOpen}
        aria-controls="offer-respond-panel"
        onClick={() => { setRespondOpen((v) => !v); setError(null); }}
        data-testid="offer-respond"
      >
        {s('offerRespond', lang)}
      </button>

      {!respondOpen && status}

      {respondOpen && (
        <div id="offer-respond-panel" className="mt-3 rounded-lg border border-[#E2E8F0] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#666]">{s('offerOtherOptions', lang)}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label={s('offerOtherOptions', lang)}>
            {(['counter', 'details', 'decline'] as Form[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={open === f}
                onClick={() => { setOpen(open === f ? null : f); setError(null); }}
                className={`rounded-md border px-2 py-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B4600F] ${open === f ? 'border-[#B4600F] bg-[#FBEEDF] text-[#1A1A1A]' : 'border-[#C9C2BA] bg-white text-[#303030]'}`}
                data-testid={`offer-open-${f}`}
              >
                {f === 'counter' ? s('offerCounterTab', lang) : f === 'details' ? s('offerDetails', lang) : s('offerDecline', lang)}
              </button>
            ))}
          </div>
          {!open && status}

          {open === 'counter' && (
            <form className="mt-4 space-y-3" onSubmit={submitCounter} noValidate data-testid="offer-counter-form">
              <p className="text-sm text-[#303030]">{s('offerCounterTitle', lang)}</p>
              <div>
                <label htmlFor="offer-price" className={labelCls}>{s('offerCounterPrice', lang)}</label>
                <input id="offer-price" inputMode="decimal" autoComplete="off" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1500" required aria-required="true" aria-invalid={!!error} aria-describedby={error ? "offer-action-error" : undefined} />
              </div>
              <div>
                <label htmlFor="offer-counter-note" className={labelCls}>{s('offerNoteOptional', lang)}</label>
                <textarea id="offer-counter-note" rows={2} maxLength={1000} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {status}
              <button type="submit" className={primaryBtn} disabled={busy} data-testid="offer-counter-submit">{busy ? s('offerSending', lang) : s('offerSendCounter', lang)}</button>
            </form>
          )}

          {open === 'details' && (
            <form className="mt-4 space-y-3" onSubmit={submitDetails} noValidate data-testid="offer-details-form">
              <div>
                <label htmlFor="offer-details-text" className={labelCls}>{s('offerDetailsTitle', lang)}</label>
                <p className="text-xs text-[#666]" id="offer-details-hint">{s('offerDetailsHint', lang)}</p>
                <textarea id="offer-details-text" rows={4} maxLength={4000} aria-describedby="offer-details-hint" className={inputCls} value={text} onChange={(e) => setText(e.target.value)} required aria-required="true" />
              </div>
              <div>
                <label htmlFor="offer-details-files" className={labelCls}>{s('offerFiles', lang)}</label>
                <input
                  id="offer-details-files"
                  ref={fileInput}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  className="mt-1 block w-full text-sm text-[#303030] file:mr-3 file:rounded-md file:border file:border-[#C9C2BA] file:bg-white file:px-3 file:py-2 file:text-sm file:font-bold"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                />
              </div>
              {status}
              <button type="submit" className={primaryBtn} disabled={busy} data-testid="offer-details-submit">{busy ? s('offerSending', lang) : s('offerSendDetails', lang)}</button>
            </form>
          )}

          {open === 'decline' && (
            <form className="mt-4 space-y-3" onSubmit={submitDecline} data-testid="offer-decline-form">
              <fieldset>
                <legend className={labelCls}>{s('offerDeclineWhy', lang)}</legend>
                <div className="mt-2 space-y-1.5">
                  {[...DECLINE_REASONS, ''].map((r) => (
                    <label key={r || 'none'} className="flex items-center gap-2 text-sm text-[#303030]">
                      <input type="radio" name="decline-reason" value={r} checked={reason === r} onChange={() => setReason(r as DeclineReason | '')} className="h-4 w-4 accent-[#B4600F]" />
                      {r ? s(DECLINE_REASON_KEY[r as DeclineReason], lang) : s('offerNoReason', lang)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="offer-decline-note" className={labelCls}>{s('offerNoteOptional', lang)}</label>
                <textarea id="offer-decline-note" rows={2} maxLength={1000} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {status}
              <button type="submit" className={secondaryBtn} disabled={busy} data-testid="offer-decline-submit">{busy ? s('offerSending', lang) : s('offerSendDecline', lang)}</button>
            </form>
          )}
        </div>
      )}

      <p className="mt-5 text-center text-xs text-[#666]">
        <a href={signupUrl} className="underline hover:text-[#1A1A1A]">{s('offerSignUpLink', lang)}</a>
      </p>
    </section>
  );
}

/** Live countdown to the sub's deadline. The absolute time renders on the server; the remainder after mount. */
export function Countdown({ expiresAt, lang }: { expiresAt: string; lang: Lang }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Deferred, not synchronous: the remainder depends on the viewer's clock,
    // so it is computed only after hydration to avoid a server/client mismatch.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  const absolute = new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  }).format(new Date(expiresAt));
  let remaining = '';
  if (now !== null) {
    const ms = new Date(expiresAt).getTime() - now;
    if (ms <= 0) remaining = s('offerTimeUp', lang);
    else {
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      remaining = s('offerTimeLeft', lang, { h, m });
    }
  }
  return (
    <span data-testid="offer-countdown">
      <span className="font-bold">{remaining}</span>
      {remaining && ' · '}
      <span className="text-[#555]">{absolute}</span>
    </span>
  );
}
