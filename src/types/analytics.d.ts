// Google Analytics & Google Tag Manager type declarations

interface Window {
  gtag?: (...args: any[]) => void;
  dataLayer?: any[];
}

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

export {};
