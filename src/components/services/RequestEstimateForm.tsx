"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Info, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RECAPTCHA_SITE_KEY } from "@/lib/recaptcha-config";
import {
  COMMERCIAL_INTEREST_OPTIONS,
  HOME_INTEREST_OPTIONS,
  type ServicePropertyType,
} from "./serviceData";

type Timing =
  | "Soonest available opening"
  | "Within 2 weeks"
  | "This month"
  | "Next 1–2 months"
  | "Flexible / planning ahead";

const TIMING_OPTIONS: Timing[] = [
  "Soonest available opening",
  "Within 2 weeks",
  "This month",
  "Next 1–2 months",
  "Flexible / planning ahead",
];

// Maps the prototype's human-readable timing to the `project_timeline`
// enum the leads table accepts. Sending the raw sentence (e.g. "Soonest
// available opening") trips a Postgres CHECK constraint (23514) and the
// row is rejected — the lead is lost. The full sentence is still kept
// verbatim in the `message` body for the owner to read.
const TIMING_TO_TIMELINE: Record<Timing, string> = {
  "Soonest available opening": "asap",
  "Within 2 weeks": "asap",
  "This month": "1-3months",
  "Next 1–2 months": "1-3months",
  "Flexible / planning ahead": "planning",
};

// Maps the prototype's call-window options to the existing
// `contact_time_preference` enum values used by the leads pipeline.
const CALL_WINDOWS: Array<{
  label: string;
  value: "morning" | "afternoon" | "evening" | "anytime";
}> = [
  { label: "Morning, 8 AM – 11 AM", value: "morning" },
  { label: "Midday, 11 AM – 2 PM", value: "afternoon" },
  { label: "Afternoon, 2 PM – 5 PM", value: "afternoon" },
  { label: "Evening, 5 PM – 7 PM", value: "evening" },
  { label: "Anytime business hours", value: "anytime" },
];

interface FormState {
  name: string;
  phone: string;
  email: string;
  town: string;
  propertyType: ServicePropertyType;
  homeInterests: string[];
  commercialInterests: string[];
  timing: Timing;
  callWindowLabel: string;
  notes: string;
  // honeypot — bots fill this
  website: string;
}

export default function RequestEstimateForm() {
  const { toast } = useToast();
  const [state, setState] = useState<FormState>({
    name: "",
    phone: "",
    email: "",
    town: "",
    propertyType: "home",
    homeInterests: [],
    commercialInterests: [],
    timing: TIMING_OPTIONS[0],
    callWindowLabel: CALL_WINDOWS[0].label,
    notes: "",
    website: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Lazy-load reCAPTCHA on first interaction
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
            .execute(RECAPTCHA_SITE_KEY, { action: "services_intake" })
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

  const toggleInterest = (group: "homeInterests" | "commercialInterests", value: string) => {
    setState((prev) => {
      const current = prev[group];
      return {
        ...prev,
        [group]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    });
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!state.name.trim()) next.name = "Name is required";
    if (!state.phone.trim()) next.phone = "Phone is required";
    else if (!/^[\+]?[0-9\(\)\s\-\.]{7,20}$/.test(state.phone))
      next.phone = "Enter a valid phone";
    if (!state.email.trim()) next.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email))
      next.email = "Enter a valid email";
    if (!state.town.trim()) next.town = "Town / property location is required";
    const interests =
      state.propertyType === "home" ? state.homeInterests : state.commercialInterests;
    if (interests.length === 0) {
      const key = state.propertyType === "home" ? "homeInterests" : "commercialInterests";
      next[key] = "Pick at least one service you're interested in";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.website) {
      // honeypot — pretend success
      setSubmitted(true);
      return;
    }
    if (!validate()) return;

    setSubmitting(true);
    try {
      const recaptchaToken = await executeRecaptcha();
      if (!recaptchaToken) {
        toast({
          title: "Security check failed",
          description:
            "Please refresh and try again, or call us directly at (201) 212-4917.",
          variant: "destructive",
          duration: 8000,
        });
        setSubmitting(false);
        return;
      }

      const nameParts = state.name.trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const interests =
        state.propertyType === "home" ? state.homeInterests : state.commercialInterests;
      const interestOptions =
        state.propertyType === "home" ? HOME_INTEREST_OPTIONS : COMMERCIAL_INTEREST_OPTIONS;
      const selectedLabels = interestOptions
        .filter((opt) => interests.includes(opt.value))
        .map((opt) => opt.label);

      const projectType =
        state.propertyType === "home" ? "Home Services" : "Commercial Services";
      const callWindow = CALL_WINDOWS.find((w) => w.label === state.callWindowLabel);

      // Compose a structured `message` so the existing leads table
      // doesn't need new columns to capture intake details.
      const message = [
        `Property type: ${state.propertyType === "home" ? "Residential home" : "Commercial property"}`,
        `Services of interest: ${selectedLabels.join(", ") || "(none specified)"}`,
        `Timing: ${state.timing}`,
        `Preferred call window: ${state.callWindowLabel}`,
        state.notes.trim() ? `\nNotes:\n${state.notes.trim()}` : "",
        "\nReply to this email with photos if you have them so we can review condition + access.",
      ]
        .filter(Boolean)
        .join("\n");

      const res = await fetch("/api/leads/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: state.email.trim(),
          phone: state.phone.trim(),
          city: state.town.trim(),
          // The leads table enforces CHECK constraints on these columns.
          // Send the enum values the table accepts (mirroring the other lead
          // forms); the human-readable property type, services, and timing
          // are preserved verbatim in `message` above so nothing is lost.
          project_type: "other",
          inquiry_type: "estimate",
          source: "services_intake_form",
          preferred_contact_method: "phone",
          project_timeline: TIMING_TO_TIMELINE[state.timing] ?? "planning",
          contact_time_preference: callWindow?.value ?? "anytime",
          contact_timezone: "America/New_York",
          message,
          recaptchaToken,
          recaptchaAction: "services_intake",
          honeypot: state.website,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to submit");
      }

      if (typeof window !== "undefined" && typeof window.fbq === "function") {
        window.fbq("track", "Lead", {
          content_name: projectType,
          content_category: "services_intake_form",
        });
      }

      setSubmitted(true);
      toast({
        title: "Request sent",
        description: "We'll review and follow up within one business day.",
      });
    } catch (err) {
      console.error("Intake submit error:", err);
      toast({
        title: "Something went wrong",
        description: "Please try again, or call us at (201) 212-4917.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-border bg-card p-10 text-center shadow-elegant">
        <CheckCircle className="mb-4 h-14 w-14 text-accent-teal" />
        <h2 className="text-2xl font-extrabold tracking-tight text-text-primary">
          Request received.
        </h2>
        <p className="mt-3 max-w-prose text-base leading-relaxed text-text-muted">
          Thanks — we&apos;ll review the details and reach out within one business
          day to confirm scope, timing, and the right next step. For anything
          urgent, call <a className="text-primary font-bold" href="tel:+12012124917">(201) 212-4917</a>.
        </p>
      </div>
    );
  }

  const activeInterests =
    state.propertyType === "home"
      ? { options: HOME_INTEREST_OPTIONS, selected: state.homeInterests, group: "homeInterests" as const }
      : { options: COMMERCIAL_INTEREST_OPTIONS, selected: state.commercialInterests, group: "commercialInterests" as const };
  const interestError =
    state.propertyType === "home" ? errors.homeInterests : errors.commercialInterests;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      autoComplete="on"
      className="rounded-3xl border border-border bg-card p-7 shadow-elegant md:p-9"
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

      {/* Contact */}
      <p className="mb-4 text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
        Contact
      </p>
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Name" error={errors.name}>
          <input
            id="name"
            type="text"
            value={state.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className="form-input"
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
            className="form-input"
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
            className="form-input"
          />
        </Field>
        <Field id="town" label="Town / property location" error={errors.town}>
          <input
            id="town"
            type="text"
            value={state.town}
            onChange={(e) => update("town", e.target.value)}
            placeholder="Montclair, NJ"
            autoComplete="address-level2"
            className="form-input"
          />
        </Field>
      </div>

      {/* Property type */}
      <div className="mb-6">
        <p className="mb-2.5 text-xs font-extrabold uppercase tracking-widest text-text-primary">
          What type of property is this?
        </p>
        <div role="radiogroup" aria-label="Property type" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { value: "home" as const, label: "Residential home" },
            { value: "commercial" as const, label: "Commercial property" },
          ].map((opt) => {
            const checked = state.propertyType === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-sm font-bold transition-all ${
                  checked
                    ? "border-primary bg-primary/5 text-text-primary shadow-card"
                    : "border-border bg-card text-text-secondary hover:border-primary/40"
                }`}
              >
                <input
                  type="radio"
                  name="propertyType"
                  value={opt.value}
                  checked={checked}
                  onChange={() => update("propertyType", opt.value)}
                  className="sr-only"
                />
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                    checked ? "border-primary" : "border-border"
                  }`}
                >
                  {checked ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                </span>
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Interests */}
      <div className="mb-6">
        <p className="mb-2.5 text-xs font-extrabold uppercase tracking-widest text-text-primary">
          What are you interested in?
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {activeInterests.options.map((opt) => {
            const checked = activeInterests.selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                  checked
                    ? "border-primary bg-primary/10 text-text-primary"
                    : "border-border bg-card text-text-secondary hover:border-primary/40 hover:bg-background-soft"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleInterest(activeInterests.group, opt.value)}
                  className="sr-only"
                />
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-md border-2 ${
                    checked ? "border-primary bg-primary text-white" : "border-border"
                  }`}
                >
                  {checked ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-2.5 w-2.5"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : null}
                </span>
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
        {interestError ? (
          <p className="mt-2 text-xs font-semibold text-destructive">{interestError}</p>
        ) : null}
      </div>

      {/* Timing + Call window */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Field id="when" label="When are you hoping to get this done?">
          <select
            id="when"
            value={state.timing}
            onChange={(e) => update("timing", e.target.value as Timing)}
            className="form-select"
          >
            {TIMING_OPTIONS.map((opt) => (
              <option key={opt}>{opt}</option>
            ))}
          </select>
        </Field>
        <Field id="callwindow" label="When are you available for a call?">
          <select
            id="callwindow"
            value={state.callWindowLabel}
            onChange={(e) => update("callWindowLabel", e.target.value)}
            className="form-select"
          >
            {CALL_WINDOWS.map((opt) => (
              <option key={opt.label}>{opt.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {/* Notes */}
      <div className="mb-7">
        <Field id="notes" label="What should we know?">
          <textarea
            id="notes"
            value={state.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Describe the issue, access notes, urgency, or anything you want us to review before calling."
            className="form-input min-h-[120px] resize-y leading-relaxed"
          />
        </Field>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient px-6 py-4 text-base font-bold text-white shadow-button transition-all hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            Request Availability
            <span className="text-xs font-semibold opacity-90">— We&apos;ll review and follow up</span>
          </>
        )}
      </button>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        No automatic booking. We confirm scope, timing, and whether a trade or
        custom quote is needed first. Have photos? Reply to our confirmation
        email and attach them.
      </p>

      <style jsx>{`
        :global(.form-input) {
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
        :global(.form-input::placeholder) {
          color: hsl(var(--text-muted));
        }
        :global(.form-input:focus) {
          border-color: hsl(var(--primary));
          box-shadow: 0 0 0 4px hsl(var(--primary) / 0.16);
        }
        :global(.form-select) {
          width: 100%;
          appearance: none;
          border-radius: 0.75rem;
          border: 1px solid hsl(var(--border));
          background-color: hsl(var(--card));
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 1rem center;
          background-size: 0.875rem;
          padding: 0.8125rem 2.5rem 0.8125rem 1rem;
          color: hsl(var(--text-primary));
          font-size: 1rem;
          font-family: inherit;
          outline: none;
          transition: all 0.2s ease;
        }
        :global(.form-select:focus) {
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
      <label
        htmlFor={id}
        className="mb-2 text-[13px] font-extrabold uppercase tracking-wider text-text-primary"
      >
        {label}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-xs font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}
