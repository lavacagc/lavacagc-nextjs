import { supabase } from '@/integrations/supabase/client';

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

class AnalyticsManager {
  private config: AnalyticsConfig | null = null;
  private customEvents: CustomEvent[] = [];
  private initialized = false;

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
    };

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
    `;
    document.head.appendChild(script2);
  }

  trackEvent(eventName: string, parameters?: Record<string, unknown>) {
    if (!this.config?.tracking_enabled) {
      return;
    }

    // Always push to dataLayer for GTM triggers (Meta Pixel, etc.)
    if (typeof window !== 'undefined') {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: eventName,
        eventData: parameters || {},
      });
    }

    // Also send to gtag if available (GA4 direct)
    if (typeof window.gtag !== 'undefined') {
      const customEvent = this.customEvents.find(e => e.event_name === eventName);

      if (customEvent) {
        window.gtag('event', customEvent.event_action, {
          event_category: customEvent.event_category,
          event_label: customEvent.event_label || parameters?.label,
          value: customEvent.event_value || parameters?.value,
          ...customEvent.parameters,
          ...parameters,
        });
      } else {
        window.gtag('event', eventName, parameters);
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

export const trackFormSubmission = (formName: string) => {
  // Use generate_lead as the primary event (GA4 recommended event for lead gen)
  analyticsManager.trackEvent('generate_lead', { 
    form_name: formName,
    currency: 'USD',
    value: 1,
  });
  // Also fire form_submit for backwards compatibility
  analyticsManager.trackEvent('form_submit', { form_name: formName });
  // Direct gtag call as backup in case analyticsManager hasn't initialized
  if (typeof window !== 'undefined' && typeof window.gtag !== 'undefined') {
    window.gtag('event', 'generate_lead', {
      form_name: formName,
      currency: 'USD',
      value: 1,
    });
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
  analyticsManager.trackEvent('phone_click');
  // Direct gtag backup
  if (typeof window !== 'undefined' && typeof window.gtag !== 'undefined') {
    window.gtag('event', 'phone_click');
  }
};

export const trackEstimateRequest = (source: string = 'unknown') => {
  analyticsManager.trackEvent('estimate_request', { source });
  // Also fire calculator_complete for GTM/Meta Pixel trigger
  analyticsManager.trackEvent('calculator_complete', {
    content_name: 'Cost Calculator Completed',
    content_category: 'Estimate Tool',
    source,
  });
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
