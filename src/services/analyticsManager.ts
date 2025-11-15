import { supabase } from '@/integrations/supabase/client';

interface AnalyticsConfig {
  id: string;
  ga4_measurement_id: string | null;
  gtm_container_id: string | null;
  tracking_enabled: boolean;
  consent_mode_enabled: boolean;
  ip_anonymization: boolean;
  enhanced_ecommerce: boolean;
  custom_dimensions: Record<string, any>;
  privacy_settings: Record<string, any>;
}

interface CustomEvent {
  id: string;
  event_name: string;
  event_category: string;
  event_action: string;
  event_label: string | null;
  event_value: number | null;
  parameters: Record<string, any>;
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
      console.log('Analytics tracking is disabled');
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
    // Load GTM script
    const script1 = document.createElement('script');
    script1.innerHTML = `
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

    console.log('Google Tag Manager initialized with ID:', containerId);
  }

  private initializeGA4(measurementId: string) {
    // Load Google Analytics script
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script1);

    // Initialize gtag
    const script2 = document.createElement('script');
    script2.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      
      ${this.config?.consent_mode_enabled ? `
      gtag('consent', 'default', {
        'analytics_storage': 'denied',
        'ad_storage': 'denied'
      });
      ` : ''}
      
      gtag('config', '${measurementId}', {
        page_title: document.title,
        page_location: window.location.href,
        ${this.config?.ip_anonymization ? `anonymize_ip: true,` : ''}
        ${this.config && Object.keys(this.config.custom_dimensions || {}).length > 0 ? 
          `custom_map: ${JSON.stringify(this.config.custom_dimensions)},` : ''}
      });
    `;
    document.head.appendChild(script2);

    console.log('Google Analytics initialized with ID:', measurementId);
  }

  trackEvent(eventName: string, parameters?: Record<string, any>) {
    if (!this.config?.tracking_enabled || typeof window.gtag === 'undefined') {
      return;
    }

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
export const trackEvent = (eventName: string, parameters?: Record<string, any>) => {
  analyticsManager.trackEvent(eventName, parameters);
};

export const trackFormSubmission = (formName: string) => {
  analyticsManager.trackEvent('form_submit', { form_name: formName });
};

export const trackPhoneClick = () => {
  analyticsManager.trackEvent('phone_click');
};

export const trackEstimateRequest = (source: string = 'unknown') => {
  analyticsManager.trackEvent('estimate_request', { source });
};

export const trackProjectView = (projectTitle: string, projectId: string) => {
  analyticsManager.trackEvent('project_view', { 
    project_title: projectTitle,
    project_id: projectId 
  });
};
