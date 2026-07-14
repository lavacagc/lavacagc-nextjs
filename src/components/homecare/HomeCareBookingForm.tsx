'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, CalendarCheck, Wrench } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RECAPTCHA_SITE_KEY } from '@/lib/recaptcha-config';
import { submitLead } from '@/lib/submitLead';
import { useRecaptchaChallenge } from '@/components/recaptcha/RecaptchaChallengeProvider';

const RECAPTCHA_ACTION = 'home_care_booking';

export interface BookingPrefill {
  first_name: string;
  email: string;
  phone: string;
  zip: string;
}
export interface BookingService {
  key: string;
  title: string;
}

export default function HomeCareBookingForm({ services, prefill }: { services: BookingService[]; prefill: BookingPrefill }) {
  const { toast } = useToast();
  const { requestChallenge } = useRecaptchaChallenge();
  const [name, setName] = useState(prefill.first_name);
  const [email, setEmail] = useState(prefill.email);
  const [phone, setPhone] = useState(prefill.phone);
  const [zip, setZip] = useState(prefill.zip);
  const [notes, setNotes] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isMulti = services.length > 1;
  const summary = services.map((s) => s.title).join(', ');
  const keys = services.map((s) => s.key).join(',');

  useEffect(() => {
    const load = () => {
      if (document.getElementById('recaptcha-script')) return;
      const s = document.createElement('script');
      s.id = 'recaptcha-script';
      s.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    };
    const handler = () => {
      load();
      document.removeEventListener('focus', handler, true);
      document.removeEventListener('click', handler, true);
    };
    document.addEventListener('focus', handler, true);
    document.addEventListener('click', handler, true);
    return () => {
      document.removeEventListener('focus', handler, true);
      document.removeEventListener('click', handler, true);
    };
  }, []);

  const executeRecaptcha = (): Promise<string | null> =>
    new Promise((resolve) => {
      const g = (window as unknown as { grecaptcha?: { enterprise?: { ready: (cb: () => void) => void; execute: (k: string, o: { action: string }) => Promise<string> } } }).grecaptcha;
      if (g?.enterprise) {
        g.enterprise.ready(() => {
          g.enterprise!.execute(RECAPTCHA_SITE_KEY, { action: RECAPTCHA_ACTION }).then(resolve).catch(() => resolve(null));
        });
      } else {
        resolve(null);
      }
    });

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setErr(null);
    if (website) {
      setSent(true);
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setErr('Add an email or phone so we can reach you.');
      return;
    }
    setSubmitting(true);
    try {
      const recaptchaToken = await executeRecaptcha();
      if (!recaptchaToken) {
        toast({ title: 'Security check failed', description: 'Please refresh and try again, or call (201) 212-4917.', variant: 'destructive' });
        setSubmitting(false);
        return;
      }
      const parts = name.trim().split(/\s+/);
      // submitLead handles the v2 checkbox fallback: a low v3 score returns
      // 200 {challenge:'recaptcha_v2'} WITHOUT saving anything - treating that
      // as success silently lost bookings before (2026-07-12 incident review).
      const result = await submitLead(
        {
          first_name: parts[0] || 'Homeowner',
          last_name: parts.slice(1).join(' ') || (parts[0] || 'Homeowner'),
          email: email.trim() || null,
          phone: phone.trim() || null,
          zip_code: zip.trim() || null,
          inquiry_type: 'estimate',
          project_type: 'other',
          source: isMulti ? 'home_care_estimate_request' : 'home_care_booking',
          message: `Home Care ${isMulti ? 'estimate request' : 'booking'} — ${summary} (tasks: ${keys})${notes.trim() ? `\n\nNotes: ${notes.trim()}` : ''}`,
          // Structured titles so the owner alert itemizes every requested
          // service in one message (destructured out server-side before the
          // lead is saved - the durable record stays in `message` above).
          services: services.map((s) => s.title),
          recaptchaToken,
          recaptchaAction: RECAPTCHA_ACTION,
          honeypot: website,
        },
        requestChallenge
      );
      if (!result.ok) {
        if (result.cancelled) {
          toast({ title: 'Verification needed', description: 'Please complete the checkbox to send your request, or call (201) 212-4917.', variant: 'destructive' });
          return;
        }
        throw new Error(result.error || 'Failed to submit');
      }
      setSent(true);
    } catch (e) {
      console.error('Home Care booking error:', e);
      toast({ title: 'Something went wrong', description: 'Please try again, or call (201) 212-4917.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-10 text-center shadow-card">
        <CheckCircle className="mb-4 h-14 w-14 text-secondary" />
        <h2 className="text-2xl font-extrabold tracking-tight text-text-primary">{isMulti ? 'Estimate request sent!' : 'Request sent!'}</h2>
        <p className="mt-3 max-w-prose text-base leading-relaxed text-text-muted">
          We&apos;ve got your request for <strong>{isMulti ? `${services.length} services` : summary}</strong>. La Vaca will put together {isMulti ? 'an estimate' : 'details'} and reach out shortly. Need it sooner? Call <a href="tel:2012124917" className="font-semibold text-primary">(201) 212-4917</a>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-border bg-card p-7 shadow-card md:p-8">
      <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      <div className="mb-5 rounded-xl bg-primary/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary shrink-0" />
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-primary">{isMulti ? `Estimate request · ${services.length} services` : 'Booking'}</div>
        </div>
        {isMulti ? (
          <ul className="mt-2 grid gap-1">
            {services.map((s) => (
              <li key={s.key} className="text-sm font-semibold text-text-primary flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-secondary" /> {s.title}</li>
            ))}
          </ul>
        ) : (
          <div className="mt-1 font-bold text-text-primary">{summary}</div>
        )}
      </div>

      {err && <p className="mb-4 text-sm font-semibold text-destructive">{err}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Name"><input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="lv-input" /></Field>
        <Field id="phone" label="Phone"><input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(201) 555-0123" autoComplete="tel" className="lv-input" /></Field>
        <Field id="email" label="Email"><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="lv-input" /></Field>
        <Field id="zip" label="ZIP"><input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="07450" autoComplete="postal-code" className="lv-input" /></Field>
      </div>
      <div className="mt-4">
        <Field id="notes" label="Anything we should know? (optional)">
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Preferred timing, access details, specifics…" className="lv-input" />
        </Field>
      </div>

      <button type="submit" disabled={submitting} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient px-6 py-4 text-base font-bold text-white shadow-button transition-all hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60">
        {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>) : (<><CalendarCheck className="h-4 w-4" /> {isMulti ? 'Request my estimate' : 'Request this service'}</>)}
      </button>
      <p className="mt-4 text-xs leading-relaxed text-text-muted">No obligation — we&apos;ll reach out to confirm scheduling and pricing.</p>

      <style jsx>{`
        :global(.lv-input){width:100%;border-radius:.75rem;border:1px solid hsl(var(--border));background:hsl(var(--card));color:hsl(var(--text-primary));padding:.8125rem 1rem;font-size:1rem;font-family:inherit;outline:none;transition:all .2s ease;}
        :global(.lv-input:focus){border-color:hsl(var(--primary));box-shadow:0 0 0 4px hsl(var(--primary) / .16);}
      `}</style>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-text-primary">{label}</label>
      {children}
    </div>
  );
}
