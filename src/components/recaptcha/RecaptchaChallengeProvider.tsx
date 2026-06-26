"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { RECAPTCHA_V2_SITE_KEY } from "@/lib/recaptcha-config";

/**
 * Provides a `requestChallenge()` that shows a reCAPTCHA v2 "I'm not a robot"
 * checkbox modal and resolves with the token once the user passes it (or null
 * if they dismiss / it's unavailable). Used as the fallback when a v3 score is
 * too low, so a real customer is never silently turned away.
 *
 * The widget uses the Enterprise checkbox API (`grecaptcha.enterprise.render`).
 * If RECAPTCHA_V2_SITE_KEY is unset, requestChallenge resolves null immediately
 * and callers fall back to their normal error handling.
 */

// window.grecaptcha is typed globally in src/types/recaptcha.d.ts (render/reset
// added there for the v2 checkbox widget).

const RECAPTCHA_V2_SCRIPT_ID = "recaptcha-v2-explicit";

function ensureScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.grecaptcha?.enterprise?.render) return resolve();
    const existing = document.getElementById(RECAPTCHA_V2_SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("load failed")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.id = RECAPTCHA_V2_SCRIPT_ID;
    s.src = "https://www.google.com/recaptcha/enterprise.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.addEventListener("load", () => resolve(), { once: true });
    s.addEventListener("error", () => reject(new Error("load failed")), { once: true });
    document.head.appendChild(s);
  });
}

type ChallengeContext = {
  /** Resolves with a v2 token, or null if dismissed/unavailable. */
  requestChallenge: () => Promise<string | null>;
};

const Ctx = createContext<ChallengeContext | null>(null);

export function useRecaptchaChallenge(): ChallengeContext {
  const ctx = useContext(Ctx);
  // No-op fallback when the provider isn't mounted (keeps callers simple).
  return ctx ?? { requestChallenge: async () => null };
}

export function RecaptchaChallengeProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<number | null>(null);
  const resolverRef = useRef<((token: string | null) => void) | null>(null);

  const settle = useCallback((token: string | null) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    if (window.grecaptcha?.enterprise?.reset && widgetIdRef.current !== null) {
      try {
        window.grecaptcha.enterprise.reset(widgetIdRef.current);
      } catch {
        /* ignore reset errors */
      }
    }
    if (resolve) resolve(token);
  }, []);

  // Render the widget once the modal is open and the container is mounted.
  useEffect(() => {
    if (!open || !containerRef.current) return;
    let cancelled = false;
    ensureScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const render = window.grecaptcha?.enterprise?.render;
        if (!render) {
          settle(null);
          return;
        }
        // Re-render fresh each open (container is keyed by `open`).
        widgetIdRef.current = render(containerRef.current, {
          sitekey: RECAPTCHA_V2_SITE_KEY,
          callback: (token: string) => settle(token),
          "error-callback": () => {
            /* leave open so the user can retry */
          },
        });
      })
      .catch(() => {
        if (!cancelled) settle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, settle]);

  const requestChallenge = useCallback((): Promise<string | null> => {
    if (!RECAPTCHA_V2_SITE_KEY) return Promise.resolve(null);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  return (
    <Ctx.Provider value={{ requestChallenge }}>
      {children}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Verify you are human"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) settle(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <h2 className="text-lg font-bold text-gray-900">Quick check</h2>
            <p className="mt-2 text-sm text-gray-600">
              Please confirm you&apos;re human to send your request.
            </p>
            <div className="mt-5 flex justify-center">
              {/* keyed by `open` so a fresh widget renders each time */}
              <div key={open ? "v2" : "off"} ref={containerRef} />
            </div>
            <button
              type="button"
              onClick={() => settle(null)}
              className="mt-5 text-sm font-semibold text-gray-500 underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
