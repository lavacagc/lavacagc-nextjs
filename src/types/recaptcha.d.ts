// Type definitions for Google reCAPTCHA v3 and v3 Enterprise
declare global {
  interface Window {
    grecaptcha: {
      ready: (callback: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
      enterprise?: {
        ready: (callback: () => void) => void;
        execute: (siteKey: string, options: { action: string }) => Promise<string>;
        // v2 checkbox (explicit render) — used by the low-score fallback.
        render?: (
          container: HTMLElement,
          params: {
            sitekey: string;
            callback?: (token: string) => void;
            "expired-callback"?: () => void;
            "error-callback"?: () => void;
          }
        ) => number;
        reset?: (widgetId?: number) => void;
      };
    };
  }
}

export {};