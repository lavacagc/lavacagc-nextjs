import { supabase } from '@/integrations/supabase/client';
import { getVisitorId, getVisitorData } from '@/hooks/useVisitor';

interface AnalyticsConfig {
  id: string;
  ga4_measurement_id: string | null;
  gtm_container_id: string | null;
  tracking_enabled: boolean;
  consent_mode_enabled: boolean;
  ip_anonymization: boolean;
  enhanced_ecommerce: boolean;
  custom_dimensions: Record<string, unknown>;
  privacy_settings: Record<string, unknown>;
}

interface CustomEvent {
  id: string;
  event_name: string;
  event_category: string;
  event_action: string;
  event_label: string | null;
  event_value: number | null;
  parameters: Record<string, unknown>;
  active: boolean;
  description: string | null;
}

// Google Ads conversion label mapping
// Update these after running setup_conversions.py
const GOOGLE_ADS_CONVERSION_ID = 'AW-16788190390';
const GOOGLE_ADS_CONVERSION_LABELS: Record<string, string> = {
  phone_call_click: 'h8x7CJaZto8cELbpncU-',
  contact_form_submit: '6-VLCJyZto8cELbpncU-',
  estimate_request: 'MIz0COmVto8cELbpncU-',
  chat_message: 'PsVSCJqXto8cELbpncU-',
};

const GOOGLE_ADS_CONVERSION_VALUES: Record<string, number> = {
  phone_call_click: 50,
  contact_form_submit: 75,
  estimate_request: 100,
  chat_message: 25,
};

/**
 * Global Privacy Control (GPC) — a browser signal that a visitor is opting out of
 * the "sale/sharing" of their data for cross-context behavioral advertising.
 * Honoring it is required by NJDPA (since 2025-07-15) and CCPA/CPRA, and our
 * Privacy Policy promises it. When present we suppress the advertising partners
 * (Meta Pixel + Clarity are gated in layout.tsx; Google Ads config, conversions,
 * and Enhanced-Conversion PII are gated here). First-party GA4 analytics may
 * still run, but with ad storage denied.
 */
export function isGpcEnabled(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
  );
}

class AnalyticsManager {
  private config: AnalyticsConfig | null = null;
  private customEvents: CustomEvent[] = [];
  private initialized = false;
  private isBotDetected = false;
  private pageLoadTime = 0;

  async loadConfiguration() {
    try {
      const { data: config } = await supabase
        .from('analytics_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (config) {
        this.config = config as AnalyticsConfig;
      }

      const { data: events } = await supabase
        .from('custom_events')
        .select('*')
        .eq('active', true);

      if (events) {
        this.customEvents = events as CustomEvent[];
      }

      return { config, events };
    } catch (error) {
      console.error('Error loading analytics configuration:', error);
      return { config: null, events: [] };
    }
  }

  async initializeGA() {
    if (this.initialized) return;

    // Only load analytics on production domain — skip Vercel preview deploys
    // GA4 has built-in bot filtering — no need to block client-side
    if (typeof window !== 'undefined' && window.location.hostname !== 'www.lavacagc.com') {
      return;
    }

    await this.loadConfiguration();

    if (!this.config?.tracking_enabled) {
      return;
    }

    // Defer analytics loading until after page load to avoid blocking main thread
    const loadAnalytics = () => {
      // Initialize Google Tag Manager if configured
      if (this.config?.gtm_container_id) {
        this.initializeGTM(this.config.gtm_container_id);
      }

      // Initialize Google Analytics if configured
      if (this.config?.ga4_measurement_id) {
        this.initializeGA4(this.config.ga4_measurement_id);
      }

      this.initialized = true;

      // Run bot detection after analytics loads
      this.isBotDetected = this.detectBotTraffic();

      // Capture GCLID from URL params
      this.captureGclid();
    };

    // Record page load time for bot detection timing checks
    this.pageLoadTime = Date.now();

    // Load after page is interactive
    if (document.readyState === 'complete') {
      setTimeout(loadAnalytics, 1000);
    } else {
      window.addEventListener('load', () => {
        setTimeout(loadAnalytics, 1000);
      });
    }
  }

  private initializeGTM(containerId: string) {
    // Validate container ID format to prevent XSS
    if (!/^GTM-[A-Z0-9]+$/.test(containerId)) {
      console.error('Invalid GTM container ID format');
      return;
    }

    // Load GTM script using safe DOM manipulation
    const script1 = document.createElement('script');
    script1.textContent = `
      (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer','${containerId}');
    `;
    document.head.appendChild(script1);

    // Add GTM noscript iframe to body
    const noscript = document.createElement('noscript');
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${containerId}`;
    iframe.height = '0';
    iframe.width = '0';
    iframe.style.display = 'none';
    iframe.style.visibility = 'hidden';
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);
  }

  private initializeGA4(measurementId: string) {
    // Validate measurement ID format to prevent XSS
    if (!/^G-[A-Z0-9]+$/.test(measurementId)) {
      console.error('Invalid GA4 measurement ID format');
      return;
    }

    // Load Google Analytics script
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script1);

    // Initialize gtag using safe textContent instead of innerHTML
    const script2 = document.createElement('script');

    // Build config object safely
    const configOptions: Record<string, unknown> = {
      page_title: 'document.title',
      page_location: 'window.location.href',
    };

    if (this.config?.ip_anonymization) {
      configOptions.anonymize_ip = true;
    }

    // Sanitize custom dimensions - only allow safe key-value pairs
    if (this.config?.custom_dimensions && typeof this.config.custom_dimensions === 'object') {
      const safeCustomDimensions: Record<string, string> = {};
      for (const [key, value] of Object.entries(this.config.custom_dimensions)) {
        // Only allow alphanumeric keys and string values
        if (/^[a-zA-Z0-9_]+$/.test(key) && typeof value === 'string') {
          safeCustomDimensions[key] = value;
        }
      }
      if (Object.keys(safeCustomDimensions).length > 0) {
        configOptions.custom_map = safeCustomDimensions;
      }
    }

    // Check for saved cookie consent and apply it immediately during initialization
    let analyticsConsent = 'denied';
    let adConsent = 'denied';

    try {
      const savedConsent = localStorage.getItem('lavaca_cookie_consent');
      if (savedConsent) {
        const { settings } = JSON.parse(savedConsent);
        analyticsConsent = settings.analytics ? 'granted' : 'denied';
        adConsent = settings.marketing ? 'granted' : 'denied';
      }
    } catch {
      // If parsing fails, keep default 'denied'
    }

    // GPC opt-out overrides any ad consent: never grant ad storage, and skip
    // loading Google Ads entirely (it's an advertising "sharing" partner).
    const gpc = isGpcEnabled();
    if (gpc) {
      adConsent = 'denied';
    }

    const consentBlock = this.config?.consent_mode_enabled ? `
      gtag('consent', 'default', {
        'analytics_storage': '${analyticsConsent}',
        'ad_storage': '${adConsent}'
      });
    ` : '';

    script2.textContent = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      ${consentBlock}
      gtag('config', '${measurementId}', {
        page_title: document.title,
        page_location: window.location.href,
        ${this.config?.ip_anonymization ? 'anonymize_ip: true,' : ''}
        ${configOptions.custom_map ? `custom_map: ${JSON.stringify(configOptions.custom_map)},` : ''}
      });
      ${gpc ? '' : `gtag('config', '${GOOGLE_ADS_CONVERSION_ID}');`}
    `;
    document.head.appendChild(script2);
  }

  /**
   * Detect bot/fake traffic based on browser signals.
   * Returns true if likely a bot.
   */
  detectBotTraffic(): boolean {
    if (typeof window === 'undefined') return false;

    const reasons: string[] = [];

    // Check navigator.webdriver (set by Selenium, Puppeteer, Playwright)
    if (navigator.webdriver) {
      reasons.push('webdriver');
    }

    // Check user agent for known bot patterns
    const ua = navigator.userAgent.toLowerCase();
    const botPatterns = [
      'headless', 'phantom', 'selenium', 'puppeteer', 'playwright',
      'bot', 'crawl', 'spider', 'scrape', 'wget', 'curl',
      'python-requests', 'httpie', 'node-fetch',
    ];
    if (botPatterns.some(pattern => ua.includes(pattern))) {
      reasons.push('bot_ua');
    }

    // Check screen resolution (0x0 or very small = bot)
    if (screen.width === 0 || screen.height === 0 || (screen.width < 100 && screen.height < 100)) {
      reasons.push('zero_screen');
    }

    // Touch support mismatch: mobile UA but no touch support
    const isMobileUA = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
    const hasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isMobileUA && !hasTouchSupport) {
      reasons.push('touch_mismatch');
    }

    const isBot = reasons.length > 0;

    if (isBot) {
      // Tag the session in Clarity
      if (typeof window.clarity === 'function') {
        window.clarity('set', 'bot', 'true');
        window.clarity('set', 'bot_reasons', reasons.join(','));
      }

      console.warn('[AnalyticsManager] Bot detected:', reasons.join(', '));
    }

    return isBot;
  }

  /**
   * Check if a user interaction happened suspiciously fast (within 100ms of page load).
   * Bots often click instantly.
   */
  isInteractionTooFast(): boolean {
    if (this.pageLoadTime === 0) return false;
    return (Date.now() - this.pageLoadTime) < 100;
  }

  /**
   * Capture Google Click ID (gclid) from URL parameters.
   * Stores in localStorage and passes to GA4 as custom dimension.
   */
  captureGclid(): void {
    if (typeof window === 'undefined') return;

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const gclid = urlParams.get('gclid');

      if (gclid) {
        // Store in localStorage for later form submissions
        localStorage.setItem('lavaca_gclid', gclid);
        localStorage.setItem('lavaca_gclid_timestamp', Date.now().toString());
        localStorage.setItem('lavaca_gclid_landing_page', window.location.pathname);

        // Pass to GA4 as custom dimension
        if (typeof window.gtag !== 'undefined') {
          window.gtag('set', { gclid });
        }

        // Tag in Clarity
        if (typeof window.clarity === 'function') {
          window.clarity('set', 'gclid', gclid);
          window.clarity('set', 'ad_source', 'google_ads');
        }
      }
    } catch (err) {
      console.error('[AnalyticsManager] Error capturing gclid:', err);
    }
  }

  /**
   * Get the stored GCLID (if any, within 90-day window).
   */
  getStoredGclid(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const gclid = localStorage.getItem('lavaca_gclid');
      const timestamp = localStorage.getItem('lavaca_gclid_timestamp');
      if (gclid && timestamp) {
        const age = Date.now() - parseInt(timestamp, 10);
        const ninetyDays = 90 * 24 * 60 * 60 * 1000;
        if (age < ninetyDays) {
          return gclid;
        }
        // Expired — clean up
        localStorage.removeItem('lavaca_gclid');
        localStorage.removeItem('lavaca_gclid_timestamp');
        localStorage.removeItem('lavaca_gclid_landing_page');
      }
    } catch {
      // localStorage not available
    }
    return null;
  }

  /**
   * Fire a Google Ads conversion event.
   * Skips if bot detected or interaction too fast.
   */
  trackGoogleAdsConversion(conversionName: string, value?: number): void {
    // Honor GPC: no Google Ads (advertising "sharing" partner) conversions.
    if (isGpcEnabled()) return;

    // Don't fire conversions for bots
    if (this.isBotDetected || this.isInteractionTooFast()) {
      console.warn('[AnalyticsManager] Skipping conversion — bot or too-fast interaction');
      return;
    }

    if (typeof window === 'undefined' || typeof window.gtag === 'undefined') return;

    const label = GOOGLE_ADS_CONVERSION_LABELS[conversionName];
    if (!label) {
      console.warn(`[AnalyticsManager] Unknown conversion: ${conversionName}`);
      return;
    }

    const conversionValue = value ?? GOOGLE_ADS_CONVERSION_VALUES[conversionName] ?? 0;

    window.gtag('event', 'conversion', {
      send_to: `${GOOGLE_ADS_CONVERSION_ID}/${label}`,
      value: conversionValue,
      currency: 'USD',
    });
  }

  /**
   * Send enhanced conversion user data (hashed email/phone) to Google.
   * Called when a form is submitted with user contact info.
   */
  async sendEnhancedConversionData(email?: string, phone?: string): Promise<void> {
    if (typeof window === 'undefined' || typeof window.gtag === 'undefined') return;
    if (!email && !phone) return;

    // Honor GPC: never send hashed email/phone to Google for ad matching.
    if (isGpcEnabled()) return;

    // Don't send for bots
    if (this.isBotDetected) return;

    const userData: Record<string, string> = {};

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const emailHash = await this.sha256(normalizedEmail);
      userData.sha256_email_address = emailHash;
    }

    if (phone) {
      // Normalize phone: remove spaces, dashes, parens; ensure +1 prefix
      let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = '+1' + normalizedPhone;
      }
      const phoneHash = await this.sha256(normalizedPhone);
      userData.sha256_phone_number = phoneHash;
    }

    window.gtag('set', 'user_data', userData);
  }

  /**
   * SHA-256 hash using Web Crypto API.
   */
  private async sha256(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  trackEvent(eventName: string, parameters?: Record<string, unknown>) {
    if (!this.config?.tracking_enabled) {
      return;
    }

    // Enrich every event with visitor context
    const visitorData = getVisitorData();
    const visitorContext: Record<string, unknown> = {};
    if (visitorData) {
      visitorContext.visitor_id = visitorData.id;
      visitorContext.visitor_type = visitorData.visit_count > 1 ? 'returning' : 'new';
      visitorContext.visit_number = visitorData.visit_count;
    }

    const enrichedParams = { ...visitorContext, ...parameters };

    // Always push to dataLayer for GTM triggers (Meta Pixel, etc.)
    if (typeof window !== 'undefined') {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: eventName,
        eventData: enrichedParams,
      });
    }

    // Also send to gtag if available (GA4 direct)
    if (typeof window.gtag !== 'undefined') {
      const customEvent = this.customEvents.find(e => e.event_name === eventName);

      if (customEvent) {
        window.gtag('event', customEvent.event_action, {
          event_category: customEvent.event_category,
          event_label: customEvent.event_label || enrichedParams?.label,
          value: customEvent.event_value || enrichedParams?.value,
          ...customEvent.parameters,
          ...enrichedParams,
        });
      } else {
        window.gtag('event', eventName, enrichedParams);
      }
    }
  }

  trackPageView(path: string, title?: string) {
    if (!this.config?.tracking_enabled || !this.config?.ga4_measurement_id || typeof window.gtag === 'undefined') {
      return;
    }

    window.gtag('config', this.config.ga4_measurement_id, {
      page_path: path,
      page_title: title || document.title,
    });
  }

  updateConsent(analyticsStorage: 'granted' | 'denied', adStorage: 'granted' | 'denied') {
    if (!this.config?.consent_mode_enabled || typeof window.gtag === 'undefined') {
      return;
    }

    window.gtag('consent', 'update', {
      'analytics_storage': analyticsStorage,
      'ad_storage': adStorage,
    });
  }

  getConfig() {
    return this.config;
  }

  isEnabled() {
    return this.config?.tracking_enabled || false;
  }
}

export const analyticsManager = new AnalyticsManager();

// Convenience functions for backward compatibility
export const trackEvent = (eventName: string, parameters?: Record<string, unknown>) => {
  analyticsManager.trackEvent(eventName, parameters);
};

export const trackFormSubmission = (formName: string, email?: string, phone?: string) => {
  // Include gclid in event parameters for attribution
  const gclid = analyticsManager.getStoredGclid();
  const gclidParams = gclid ? { gclid } : {};

  // Use generate_lead as the primary event (GA4 recommended event for lead gen)
  analyticsManager.trackEvent('generate_lead', { 
    form_name: formName,
    currency: 'USD',
    value: 1,
    ...gclidParams,
  });
  // Also fire form_submit for backwards compatibility
  analyticsManager.trackEvent('form_submit', { form_name: formName, ...gclidParams });
  // Direct gtag call as backup in case analyticsManager hasn't initialized
  if (typeof window !== 'undefined' && typeof window.gtag !== 'undefined') {
    const vid = getVisitorId();
    window.gtag('event', 'generate_lead', {
      form_name: formName,
      currency: 'USD',
      value: 1,
      ...(vid ? { visitor_id: vid } : {}),
      ...gclidParams,
    });
  }
  // Meta Pixel — fire Lead event for audience building + conversion tracking
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', 'Lead', {
      content_name: formName,
      content_category: 'form_submission',
    });
  }

  // Google Ads conversion tracking
  analyticsManager.trackGoogleAdsConversion('contact_form_submit');

  // Enhanced conversions — send hashed user data
  if (email || phone) {
    analyticsManager.sendEnhancedConversionData(email, phone);
  }
};

export const trackFormFieldFocus = (formName: string, fieldName: string) => {
  analyticsManager.trackEvent('form_field_focus', { form_name: formName, field_name: fieldName });
};

export const trackFormAbandon = (formName: string, lastField: string, fieldsCompleted: number) => {
  analyticsManager.trackEvent('form_abandon', { 
    form_name: formName, 
    last_field: lastField,
    fields_completed: fieldsCompleted,
  });
};

export const trackPhoneClick = () => {
  const gclid = analyticsManager.getStoredGclid();
  const gclidParams = gclid ? { gclid } : {};

  analyticsManager.trackEvent('phone_click', gclidParams);
  // Direct gtag backup
  if (typeof window !== 'undefined' && typeof window.gtag !== 'undefined') {
    window.gtag('event', 'phone_click', gclidParams);
  }
  // Meta Pixel — Contact event for phone clicks
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('track', 'Contact', {
      content_category: 'phone_click',
    });
  }

  // Google Ads conversion tracking
  analyticsManager.trackGoogleAdsConversion('phone_call_click');
};

export const trackEstimateRequest = (source: string = 'unknown') => {
  const gclid = analyticsManager.getStoredGclid();
  const gclidParams = gclid ? { gclid } : {};

  analyticsManager.trackEvent('estimate_request', { source, ...gclidParams });
  // Also fire calculator_complete for GTM/Meta Pixel trigger
  analyticsManager.trackEvent('calculator_complete', {
    content_name: 'Cost Calculator Completed',
    content_category: 'Estimate Tool',
    source,
    ...gclidParams,
  });

  // Fire Facebook Pixel event for calculator completion
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    window.fbq('trackCustom', 'CalculatorDone', {
      content_name: 'Cost Calculator Completed',
      content_category: 'Estimate Tool',
      source,
    });
  }

  // Google Ads conversion tracking
  analyticsManager.trackGoogleAdsConversion('estimate_request');
};

export const trackProjectView = (projectTitle: string, projectId: string) => {
  analyticsManager.trackEvent('project_view', {
    project_title: projectTitle,
    project_id: projectId
  });
};

// Scroll tracking functions
export const trackScrollDepth = (sectionName: string, depth: number, sectionId?: string) => {
  analyticsManager.trackEvent('scroll_depth', {
    section_name: sectionName,
    section_id: sectionId,
    depth_percentage: depth,
    event_category: 'engagement',
  });
};

export const trackSectionView = (sectionName: string, timeSpent?: number, sectionId?: string) => {
  analyticsManager.trackEvent('section_view', {
    section_name: sectionName,
    section_id: sectionId,
    time_spent_seconds: timeSpent,
    event_category: 'engagement',
  });
};

export const trackElementView = (elementName: string, sectionName: string, elementId?: string) => {
  analyticsManager.trackEvent('element_view', {
    element_name: elementName,
    section_name: sectionName,
    element_id: elementId,
    event_category: 'engagement',
  });
};

export const trackCalculatorStep = (stepNumber: number, stepName: string, action: 'enter' | 'exit' | 'complete', timeSpent?: number) => {
  analyticsManager.trackEvent('calculator_step', {
    step_number: stepNumber,
    step_name: stepName,
    action,
    time_spent_seconds: timeSpent,
    event_category: 'calculator',
  });
};

export const trackHorizontalScroll = (sectionName: string, scrollPercentage: number, sectionId?: string) => {
  analyticsManager.trackEvent('horizontal_scroll', {
    section_name: sectionName,
    section_id: sectionId,
    scroll_percentage: scrollPercentage,
    event_category: 'engagement',
  });
};
