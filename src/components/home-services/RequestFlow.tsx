'use client';

import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { getService, t, TIMING_OPTIONS, type Lang } from '@/lib/home-services/catalog';
import { s } from '@/lib/home-services/i18n';
import { isInServiceArea, normalizeZip, ZIP_RE } from '@/lib/home-services/serviceArea';
import { executeRecaptcha, loadRecaptcha, submitHomeServiceRequest } from '@/lib/home-services/submitRequest';
import { useRecaptchaChallenge } from '@/components/recaptcha/RecaptchaChallengeProvider';
import { cn } from '@/lib/utils';
import PhotoUploader, { type PhotoState } from './PhotoUploader';
import AddressField, { type AddressValue } from './AddressField';
import FlowDone from './FlowDone';

type Step = 'details' | 'contact' | 'done';
type Timing = 'this_week' | 'two_weeks' | 'flexible';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RECAPTCHA_ACTION = 'home_services_request';

function phoneDigits(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return d;
  if (d.length === 11 && d.startsWith('1')) return d.slice(1);
  return null;
}

const fieldClass =
  'mt-1.5 block min-h-[48px] w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30 aria-[invalid=true]:border-red-600';

function Segmented({
  legend,
  options,
  value,
  onChange,
  name,
}: {
  legend: string;
  options: Array<{ value: string; label: string }>;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-bold text-text-primary">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2" data-testid={`q-${name}`}>
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              // Tapping the chosen option again clears it: nothing here is required (grill 001 Q5).
              onClick={() => onChange(on ? undefined : o.value)}
              className={cn(
                'min-h-[44px] min-w-[56px] rounded-xl border-2 px-4 py-2 text-[15px] font-bold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-secondary/40',
                on ? 'border-secondary bg-secondary text-white' : 'border-border bg-card text-text-secondary hover:border-secondary/50',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The request flow (grill 001; RF1-RF13): Details (three tap groups per
 * service, photos, address) -> Contact (name, phone, email, timing, notes,
 * consent) -> Done (with the text-code field when one was sent).
 *
 * A full-height bottom sheet on phones and a centred dialog from `sm` up, on
 * Radix Dialog for the focus trap, Escape and labelled close. Loaded with
 * next/dynamic only when first opened, so none of this ships with the landing
 * page's initial JavaScript.
 */
export default function RequestFlow({
  open,
  lang,
  services,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  lang: Lang;
  services: string[];
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const { requestChallenge } = useRecaptchaChallenge();
  const [step, setStep] = useState<Step>('details');
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [photos, setPhotos] = useState<PhotoState>({ ids: [], draftToken: null, busy: false });
  const [address, setAddress] = useState<AddressValue>({ address: '', zip: '', town: '' });
  const [addressError, setAddressError] = useState<string | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [timing, setTiming] = useState<Timing>('flexible');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ merged: boolean; verification: 'sent' | 'skipped'; requestId: string | null } | null>(null);
  const startedAt = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // The timing check counts from the first open of the sheet (grill 001 Q12).
    if (startedAt.current === null) startedAt.current = Date.now();
    loadRecaptcha();
  }, [open]);

  /** Move focus to the visible step's heading, so a screen reader announces the new step. */
  const focusHeading = () => {
    const headings = bodyRef.current?.querySelectorAll<HTMLElement>('[data-step-heading]') ?? [];
    Array.from(headings).find((h) => h.offsetParent !== null)?.focus();
  };

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    focusHeading();
  }, [step]);

  const close = () => {
    onClose();
    if (step === 'done') {
      // A finished request starts the next one fresh.
      setTimeout(() => {
        setStep('details');
        setAnswers({});
        setResult(null);
        setNotes('');
        setConsent(false);
        startedAt.current = null;
      }, 250);
    }
  };

  function checkZip(zip: string): boolean {
    const z = normalizeZip(zip);
    if (!ZIP_RE.test(z)) {
      setZipError(s('invalidZip', lang));
      return false;
    }
    if (!isInServiceArea({ zip: z, town: address.town })) {
      setZipError(s('outOfArea', lang));
      return false;
    }
    setZipError(null);
    return true;
  }

  function continueToContact() {
    let ok = true;
    if (address.address.trim().length < 3) {
      setAddressError(s('requiredAddress', lang));
      ok = false;
    } else {
      setAddressError(null);
    }
    if (!checkZip(address.zip)) ok = false;
    if (ok) setStep('contact');
  }

  function validateContact(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = s('requiredName', lang);
    if (!phone.trim()) next.phone = s('requiredPhone', lang);
    else if (!phoneDigits(phone)) next.phone = s('invalidPhone', lang);
    if (email.trim() && !EMAIL_RE.test(email.trim())) next.email = s('invalidEmail', lang);
    if (!consent) next.consent = s('requiredConsent', lang);
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validateContact()) return;
    setSubmitting(true);
    const submittedServices = [...services];
    const token = await executeRecaptcha(RECAPTCHA_ACTION);
    const payload = {
      services: submittedServices,
      answers: Object.fromEntries(submittedServices.map((slug) => [slug, answers[slug] ?? {}])),
      address: address.address.trim(),
      zip: normalizeZip(address.zip),
      town: address.town,
      photo_ids: photos.ids,
      draft_token: photos.draftToken,
      first_name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      timing,
      notes: notes.trim(),
      consent_sms: consent,
      lang,
      started_at: startedAt.current ?? Date.now(),
      submitted_at: Date.now(),
      honeypot: website,
      recaptchaToken: token ?? '',
      recaptchaAction: RECAPTCHA_ACTION,
    };
    const outcome = await submitHomeServiceRequest(payload, requestChallenge);
    setSubmitting(false);
    switch (outcome.kind) {
      case 'ok':
        setResult({ merged: outcome.data.merged, verification: outcome.data.verification, requestId: outcome.data.request_id });
        setStep('done');
        onSubmitted?.();
        return;
      case 'out_of_area':
        setZipError(s('outOfArea', lang));
        setStep('details');
        return;
      case 'rate_limited':
        setFormError(s('errorRate', lang));
        return;
      case 'cancelled':
        setFormError(s('challengeCancelled', lang));
        return;
      default:
        setFormError(s('errorGeneric', lang));
    }
  }

  const stepNumber = step === 'details' ? 1 : 2;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-testid="request-flow"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            focusHeading();
          }}
          className="fixed inset-x-0 bottom-0 top-0 z-50 flex flex-col bg-card shadow-elegant focus:outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95"
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
            {step === 'contact' ? (
              <button
                type="button"
                onClick={() => setStep('details')}
                aria-label={s('back', lang)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-background-soft text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
              >
                <ArrowLeft aria-hidden className="h-5 w-5" />
              </button>
            ) : null}
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-lg font-extrabold tracking-tight text-text-primary">{s('flowTitle', lang)}</DialogPrimitive.Title>
              {step !== 'done' && <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{s('stepOf', lang, { n: stepNumber })}</p>}
            </div>
            <DialogPrimitive.Close
              aria-label={s('close', lang)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-background-soft text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
            >
              <X aria-hidden className="h-5 w-5" />
            </DialogPrimitive.Close>
          </header>

          <div ref={bodyRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
            {/* Details stays mounted (hidden) on the contact step so photo uploads keep running. */}
            <div hidden={step !== 'details'} data-testid="step-details">
              <h3 tabIndex={-1} data-step-heading className="text-xl font-extrabold tracking-tight text-text-primary focus:outline-none">
                {s('detailsTitle', lang)}
              </h3>
              <div className="mt-5 space-y-6">
                {services.map((slug) => {
                  const service = getService(slug);
                  if (!service) return null;
                  return (
                    <section key={slug} className="rounded-2xl border border-border p-4" data-testid={`details-${slug}`}>
                      <h4 className="text-base font-extrabold text-text-primary">{t(service.name, lang)}</h4>
                      <div className="mt-3 space-y-4">
                        {service.questions.map((q) => (
                          <Segmented
                            key={q.key}
                            name={`${slug}-${q.key}`}
                            legend={t(q.label, lang)}
                            options={q.options.map((o) => ({ value: o.value, label: t(o.label, lang) }))}
                            value={answers[slug]?.[q.key]}
                            onChange={(v) =>
                              setAnswers((prev) => {
                                const forService = { ...(prev[slug] ?? {}) };
                                if (v === undefined) delete forService[q.key];
                                else forService[q.key] = v;
                                return { ...prev, [slug]: forService };
                              })
                            }
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
                <PhotoUploader lang={lang} onChange={setPhotos} />
                <AddressField
                  lang={lang}
                  value={address}
                  onChange={(next) => {
                    setAddress(next);
                    if (next.zip !== address.zip) setZipError(null);
                    if (next.address.trim().length >= 3) setAddressError(null);
                  }}
                  onZipBlur={(zip) => {
                    if (normalizeZip(zip).length === 5) checkZip(zip);
                  }}
                  addressError={addressError}
                  zipError={zipError}
                />
              </div>
            </div>

            {step === 'contact' && (
              <form id="hs-contact-form" onSubmit={submit} noValidate data-testid="step-contact">
                <h3 tabIndex={-1} data-step-heading className="text-xl font-extrabold tracking-tight text-text-primary focus:outline-none">
                  {s('contactTitle', lang)}
                </h3>
                <div className="mt-5 space-y-5">
                  <div>
                    <label htmlFor="hs-name" className="text-[15px] font-bold text-text-primary">
                      {s('nameLabel', lang)}
                    </label>
                    <input
                      id="hs-name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? 'hs-name-error' : undefined}
                      className={fieldClass}
                    />
                    {errors.name && <p id="hs-name-error" className="mt-1.5 text-sm font-semibold text-red-700">{errors.name}</p>}
                  </div>
                  <div>
                    <label htmlFor="hs-phone" className="text-[15px] font-bold text-text-primary">
                      {s('phoneLabel', lang)}
                    </label>
                    <input
                      id="hs-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      aria-invalid={Boolean(errors.phone)}
                      aria-describedby={errors.phone ? 'hs-phone-error' : undefined}
                      className={fieldClass}
                    />
                    {errors.phone && <p id="hs-phone-error" className="mt-1.5 text-sm font-semibold text-red-700">{errors.phone}</p>}
                  </div>
                  <div>
                    <label htmlFor="hs-email" className="text-[15px] font-bold text-text-primary">
                      {s('emailLabel', lang)}
                    </label>
                    <input
                      id="hs-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? 'hs-email-error' : undefined}
                      className={fieldClass}
                    />
                    {errors.email && <p id="hs-email-error" className="mt-1.5 text-sm font-semibold text-red-700">{errors.email}</p>}
                  </div>
                  <Segmented
                    name="timing"
                    legend={s('timingLabel', lang)}
                    options={TIMING_OPTIONS.map((o) => ({ value: o.value, label: t(o.label, lang) }))}
                    value={timing}
                    // Timing always has a value (defaults to flexible), so a second tap keeps it.
                    onChange={(v) => setTiming((v as Timing) ?? timing)}
                  />
                  <div>
                    <label htmlFor="hs-notes" className="text-[15px] font-bold text-text-primary">
                      {s('notesLabel', lang)}
                    </label>
                    <textarea
                      id="hs-notes"
                      rows={3}
                      maxLength={2000}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className={`${fieldClass} min-h-[96px]`}
                    />
                  </div>
                  {/* Honeypot: invisible to people and to assistive tech, irresistible to form-filling bots. */}
                  <div aria-hidden className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden">
                    <label htmlFor="hs-website">Website</label>
                    <input id="hs-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </div>
                  <div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border p-3.5 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-secondary/40">
                      <input
                        id="hs-consent"
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        aria-invalid={Boolean(errors.consent)}
                        aria-describedby={errors.consent ? 'hs-consent-error' : undefined}
                        className="mt-0.5 h-6 w-6 shrink-0 accent-[hsl(var(--secondary))]"
                      />
                      <span className="text-sm leading-relaxed text-text-secondary">{s('consentLabel', lang)}</span>
                    </label>
                    {errors.consent && <p id="hs-consent-error" className="mt-1.5 text-sm font-semibold text-red-700">{errors.consent}</p>}
                  </div>
                  {formError && (
                    <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" data-testid="form-error">
                      {formError}
                    </p>
                  )}
                </div>
              </form>
            )}

            {step === 'done' && result && (
              <FlowDone lang={lang} merged={result.merged} verification={result.verification} requestId={result.requestId} />
            )}
          </div>

          <footer className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {step === 'details' && (
              <button
                type="button"
                onClick={continueToContact}
                className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-secondary px-5 text-[17px] font-bold text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-secondary/40"
              >
                {s('continue', lang)}
              </button>
            )}
            {step === 'contact' && (
              <button
                type="submit"
                form="hs-contact-form"
                disabled={submitting || photos.busy}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-secondary px-5 text-[17px] font-bold text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-secondary/40 disabled:opacity-60"
              >
                {(submitting || photos.busy) && <Loader2 aria-hidden className="h-5 w-5 animate-spin" />}
                {submitting ? s('submitting', lang) : photos.busy ? s('uploading', lang) : s('submit', lang)}
              </button>
            )}
            {step === 'done' && (
              <button
                type="button"
                onClick={close}
                className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-secondary px-5 text-[17px] font-bold text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-secondary/40"
              >
                {s('doneButton', lang)}
              </button>
            )}
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
