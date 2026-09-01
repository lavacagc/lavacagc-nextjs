'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Loader2, MailCheck, Home } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RECAPTCHA_SITE_KEY } from '@/lib/recaptcha-config';

const RECAPTCHA_ACTION = 'home_care_signup';
const RECAPTCHA_LOGIN_ACTION = 'home_care_login';

const HOME_TYPES = [
  { value: 'single_family', label: 'Single-family' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'condo', label: 'Condo' },
  { value: 'multi_family', label: 'Multi-family' },
];

interface FormState {
  first_name: string;
  email: string;
  zip: string;
  home_type: string;
  website: string; // honeypot
}

export default function HomeCareOptInForm() {
  const { toast } = useToast();
  const [state, setState] = useState<FormState>({ first_name: '', email: '', zip: '', home_type: '', website: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const isLogin = mode === 'login';

  const switchMode = (m: 'signup' | 'login') => {
    setMode(m);
    setErrors({});
  };

  // Lazy-load reCAPTCHA Enterprise on first interaction.
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

  const executeRecaptcha = (action: string): Promise<string | null> =>
    new Promise((resolve) => {
      const g = (window as unknown as { grecaptcha?: { enterprise?: { ready: (cb: () => void) => void; execute: (k: string, o: { action: string }) => Promise<string> } } }).grecaptcha;
      if (g?.enterprise) {
        g.enterprise.ready(() => {
          g.enterprise!.execute(RECAPTCHA_SITE_KEY, { action }).then(resolve).catch(() => resolve(null));
        });
      } else {
        resolve(null);
      }
    });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((p) => ({ ...p, [key]: value }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: '' }));
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!isLogin && !state.first_name.trim()) e.first_name = 'Name is required';
    if (!state.email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) e.email = 'Enter a valid email';
    if (!isLogin && !state.zip.trim()) e.zip = 'ZIP is required';
    else if (!isLogin && !/\d{5}/.test(state.zip)) e.zip = 'Enter a 5-digit ZIP';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (state.website) {
      setSent(true);
      return;
    }
    if (!validate()) return;
    setSubmitting(true);
    try {
      const recaptchaToken = await executeRecaptcha(isLogin ? RECAPTCHA_LOGIN_ACTION : RECAPTCHA_ACTION);
      if (!recaptchaToken) {
        toast({ title: 'Security check failed', description: 'Please refresh and try again, or call (201) 212-4917.', variant: 'destructive' });
        setSubmitting(false);
        return;
      }
      const res = await fetch(isLogin ? '/api/home-care/login' : '/api/home-care/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isLogin
            ? { email: state.email.trim(), recaptchaToken, honeypot: state.website }
            : {
                first_name: state.first_name.trim(),
                email: state.email.trim(),
                zip: state.zip.trim(),
                home_type: state.home_type || null,
                recaptchaToken,
                honeypot: state.website,
              },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSent(true);
    } catch (err) {
      console.error('Home Care opt-in error:', err);
      toast({ title: 'Something went wrong', description: 'Please try again, or call (201) 212-4917.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-10 text-center shadow-card">
        <MailCheck className="mb-4 h-14 w-14 text-primary" />
        <h2 className="text-2xl font-extrabold tracking-tight text-text-primary">Check your email</h2>
        <p className="mt-3 max-w-prose text-base leading-relaxed text-text-muted">
          {isLogin ? (
            <>If <strong>{state.email.trim()}</strong> is a La Vaca Home Care member, we just sent a sign-in link. Click it to open your checklist - it expires in 48 hours.</>
          ) : (
            <>We sent a confirmation link to <strong>{state.email.trim()}</strong>. Click it to set up your seasonal home plan. The link expires in 48 hours.</>
          )}
        </p>
        {/* The escape hatch for the case this panel cannot distinguish.
            "If that address is a member" is deliberately non-committal - the
            endpoint must not reveal who is in the program - but on its own it
            strands the person it is most likely describing: someone who never
            had a plan, or whose signup never completed. They wait for an email
            that was correctly never sent, and conclude the site is broken.
            Offering the way in costs nothing and leaks nothing: it is shown to
            every login attempt, member or not. */}
        {isLogin && (
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-text-muted">
            Nothing after a few minutes? You may not have a plan yet.
          </p>
        )}
        {/* Both actions share one row rather than stacking: globals.css gives
            every button a 44px minimum, so an inline one inside the paragraph
            above would sit 44px tall in the middle of a sentence. */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 text-sm font-semibold text-primary">
          {isLogin && (
            <button
              type="button"
              onClick={() => { switchMode('signup'); setSent(false); }}
              className="underline underline-offset-2"
            >
              Create your free home plan
            </button>
          )}
          <button type="button" onClick={() => setSent(false)} className="underline underline-offset-2">
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-border bg-card p-7 shadow-card md:p-8">
      <input type="text" name="website" value={state.website} onChange={(e) => update('website', e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />

      <div className="mb-5 flex rounded-xl bg-muted p-1 text-sm font-bold">
        <button type="button" onClick={() => switchMode('signup')} aria-pressed={!isLogin} className={`flex-1 rounded-lg py-2 transition-colors ${!isLogin ? 'bg-card text-primary shadow-sm' : 'text-text-secondary hover:text-primary'}`}>New here</button>
        <button type="button" onClick={() => switchMode('login')} aria-pressed={isLogin} className={`flex-1 rounded-lg py-2 transition-colors ${isLogin ? 'bg-card text-primary shadow-sm' : 'text-text-secondary hover:text-primary'}`}>I&apos;m a member</button>
      </div>

      <div className="mb-5 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-primary">
        <Home className="h-3.5 w-3.5" /> {isLogin ? 'Log in to your home plan' : 'Free seasonal home plan'}
      </div>

      <div className="grid gap-4">
        {!isLogin && (
          <Field id="first_name" label="First name" error={errors.first_name}>
            <input id="first_name" type="text" value={state.first_name} onChange={(e) => update('first_name', e.target.value)} placeholder="Your name" autoComplete="given-name" className="lv-input" />
          </Field>
        )}
        <Field id="email" label="Email" error={errors.email}>
          <input id="email" type="email" value={state.email} onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" autoComplete="email" className="lv-input" />
        </Field>
        {!isLogin && (
          <>
            <Field id="zip" label="Home ZIP code" error={errors.zip}>
              <input id="zip" type="text" value={state.zip} onChange={(e) => update('zip', e.target.value)} placeholder="07450" autoComplete="postal-code" className="lv-input" />
            </Field>
            <Field id="home_type" label="Home type (optional)">
              <Select value={state.home_type} onValueChange={(v) => update('home_type', v)}>
                <SelectTrigger id="home_type" className="h-12 w-full rounded-xl border-border bg-card px-4 text-base data-[placeholder]:text-text-muted">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {HOME_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
      </div>

      <button type="submit" disabled={submitting} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient px-6 py-4 text-base font-bold text-white shadow-button transition-all hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60">
        {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>) : isLogin ? (<><MailCheck className="h-4 w-4" /> Email me a sign-in link</>) : (<><CheckCircle className="h-4 w-4" /> Get my free home plan</>)}
      </button>

      <p className="mt-4 text-xs leading-relaxed text-text-muted">
        {isLogin
          ? 'Enter the email you signed up with and we’ll send a one-tap sign-in link - no password to remember.'
          : 'We’ll email a seasonal maintenance checklist a few times a year. No account, no spam - unsubscribe anytime.'}
      </p>

      <style jsx>{`
        :global(.lv-input){width:100%;border-radius:.75rem;border:1px solid hsl(var(--border));background:hsl(var(--card));color:hsl(var(--text-primary));padding:.8125rem 1rem;font-size:1rem;font-family:inherit;outline:none;transition:all .2s ease;}
        :global(.lv-input:focus){border-color:hsl(var(--primary));box-shadow:0 0 0 4px hsl(var(--primary) / .16);}
      `}</style>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-text-primary">{label}</label>
      {children}
      {error ? <p className="mt-1.5 text-xs font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}
