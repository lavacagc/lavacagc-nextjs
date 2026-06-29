"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, Lock, MailCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RECAPTCHA_SITE_KEY } from "@/lib/recaptcha-config";
import { useRecaptchaChallenge } from "@/components/recaptcha/RecaptchaChallengeProvider";
import { submitUnlock } from "@/lib/listings/submitUnlock";

const RECAPTCHA_ACTION = "buy_remodel_unlock";

interface FormState {
  name: string;
  email: string;
  phone: string;
  zips: string;
  // honeypot — bots fill this
  website: string;
}

export default function ListingsUnlockForm({ next }: { next?: string }) {
  const { toast } = useToast();
  const { requestChallenge } = useRecaptchaChallenge();
  const [state, setState] = useState<FormState>({
    name: "",
    email: "",
    phone: "",
    zips: "",
    website: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  // Lazy-load reCAPTCHA on first interaction.
  useEffect(() => {
    let loaded = false;
    const load = () => {
      if (loaded || document.getElementById("recaptcha-script")) return;
      loaded = true;
      const s = document.createElement("script");
      s.id = "recaptcha-script";
      s.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    };
    const handler = () => {
      load();
      document.removeEventListener("focus", handler, true);
      document.removeEventListener("click", handler, true);
    };
    document.addEventListener("focus", handler, true);
    document.addEventListener("click", handler, true);
    return () => {
      document.removeEventListener("focus", handler, true);
      document.removeEventListener("click", handler, true);
    };
  }, []);

  const executeRecaptcha = (): Promise<string | null> =>
    new Promise((resolve) => {
      if (typeof window !== "undefined" && window.grecaptcha?.enterprise) {
        window.grecaptcha.enterprise.ready(() => {
          window.grecaptcha.enterprise
            .execute(RECAPTCHA_SITE_KEY, { action: RECAPTCHA_ACTION })
            .then((token: string) => resolve(token))
            .catch(() => resolve(null));
        });
      } else {
        resolve(null);
      }
    });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!state.name.trim()) next.name = "Name is required";
    if (!state.email.trim()) next.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) next.email = "Enter a valid email";
    if (!state.phone.trim()) next.phone = "Phone is required";
    if (!state.zips.trim()) next.zips = "Add at least one ZIP code";
    else if (!/\d{5}/.test(state.zips)) next.zips = "Enter a 5-digit ZIP code";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.website) {
      // honeypot — pretend success
      setSent(true);
      return;
    }
    if (!validate()) return;

    setSubmitting(true);
    try {
      const recaptchaToken = await executeRecaptcha();
      if (!recaptchaToken) {
        toast({
          title: "Security check failed",
          description: "Please refresh and try again, or call us at (201) 212-4917.",
          variant: "destructive",
          duration: 8000,
        });
        setSubmitting(false);
        return;
      }

      const nameParts = state.name.trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || firstName;

      const payload: Record<string, unknown> = {
        first_name: firstName,
        last_name: lastName,
        email: state.email.trim(),
        phone: state.phone.trim(),
        zips: state.zips.trim(),
        recaptchaToken,
        recaptchaAction: RECAPTCHA_ACTION,
        honeypot: state.website,
      };
      if (next) payload.next = next;

      const result = await submitUnlock(payload, requestChallenge);
      if (!result.ok) {
        if (result.cancelled) {
          toast({
            title: "Verification needed",
            description: "Please complete the checkbox to continue, or call us at (201) 212-4917.",
            variant: "destructive",
          });
          setSubmitting(false);
          return;
        }
        throw new Error(result.error);
      }

      setSent(true);
    } catch (err) {
      console.error("Unlock submit error:", err);
      toast({
        title: "Something went wrong",
        description: "Please try again, or call us at (201) 212-4917.",
        variant: "destructive",
      });
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
          We just sent a confirmation link to <strong>{state.email.trim()}</strong>. Click it to verify
          your email and unlock the full home details. The link expires in 48 hours.
        </p>
        <p className="mt-4 text-sm text-text-muted">
          Don&apos;t see it? Check spam, or{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-semibold text-primary underline underline-offset-2"
          >
            try a different email
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      autoComplete="on"
      className="rounded-2xl border border-border bg-card p-7 shadow-card md:p-8"
    >
      {/* honeypot */}
      <input
        type="text"
        name="website"
        value={state.website}
        onChange={(e) => update("website", e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />

      <div className="mb-5 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-widest text-primary">
        <Lock className="h-3.5 w-3.5" />
        Unlock full listings
      </div>

      <div className="grid gap-4">
        <Field id="name" label="Full name" error={errors.name}>
          <input
            id="name"
            type="text"
            value={state.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className="lv-input"
          />
        </Field>
        <Field id="email" label="Email" error={errors.email}>
          <input
            id="email"
            type="email"
            value={state.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="lv-input"
          />
        </Field>
        <Field id="phone" label="Phone" error={errors.phone}>
          <input
            id="phone"
            type="tel"
            value={state.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="(201) 555-0123"
            autoComplete="tel"
            className="lv-input"
          />
        </Field>
        <Field id="zips" label="Prospective ZIP code(s)" error={errors.zips}>
          <input
            id="zips"
            type="text"
            value={state.zips}
            onChange={(e) => update("zips", e.target.value)}
            placeholder="07450, 07042, 07039"
            autoComplete="postal-code"
            className="lv-input"
          />
          <p className="mt-1.5 text-xs text-text-muted">Separate multiple ZIPs with commas.</p>
        </Field>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient px-6 py-4 text-base font-bold text-white shadow-button transition-all hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <CheckCircle className="h-4 w-4" />
            Send me the access link
          </>
        )}
      </button>

      <p className="mt-4 text-xs leading-relaxed text-text-muted">
        By continuing you agree to receive our Buy&nbsp;+&nbsp;Remodel newsletter. You can unsubscribe any
        time — note that unsubscribing also removes listing access.
      </p>

      <style jsx>{`
        :global(.lv-input) {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          color: hsl(var(--text-primary));
          padding: 0.8125rem 1rem;
          font-size: 1rem;
          font-family: inherit;
          outline: none;
          transition: all 0.2s ease;
        }
        :global(.lv-input::placeholder) {
          color: hsl(var(--text-muted));
        }
        :global(.lv-input:focus) {
          border-color: hsl(var(--primary));
          box-shadow: 0 0 0 4px hsl(var(--primary) / 0.16);
        }
      `}</style>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-text-primary">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-xs font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}
