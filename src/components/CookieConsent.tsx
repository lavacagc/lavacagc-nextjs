'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Cookie, Shield, X } from 'lucide-react';
import Link from 'next/link';
import { analyticsManager } from '@/services/analyticsManager';

interface ConsentSettings {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}

const CONSENT_STORAGE_KEY = 'lavaca_cookie_consent';
const CONSENT_VERSION = '1.0';

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [settings, setSettings] = useState<ConsentSettings>({
    necessary: true, // Always required
    analytics: false,
    marketing: false,
    preferences: false,
  });

  useEffect(() => {
    // Check if user has already consented
    const savedConsent = localStorage.getItem(CONSENT_STORAGE_KEY);

    if (savedConsent) {
      try {
        const { version, settings: savedSettings, timestamp } = JSON.parse(savedConsent);

        // Check if consent is still valid (within 1 year)
        const consentAge = Date.now() - timestamp;
        const oneYear = 365 * 24 * 60 * 60 * 1000;

        if (version === CONSENT_VERSION && consentAge < oneYear) {
          setSettings(savedSettings);
          applyConsentSettings(savedSettings);
          return;
        }
      } catch (e) {
        // Invalid saved consent, show banner
      }
    }

    // Show banner after a short delay
    const timer = setTimeout(() => setShowBanner(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  const applyConsentSettings = (consentSettings: ConsentSettings) => {
    // Update Google Analytics consent
    const analyticsConsent = consentSettings.analytics ? 'granted' : 'denied';
    const adConsent = consentSettings.marketing ? 'granted' : 'denied';

    analyticsManager.updateConsent(analyticsConsent, adConsent);

    // Log consent for compliance
    console.log('Cookie consent applied:', consentSettings);
  };

  const saveConsent = (consentSettings: ConsentSettings) => {
    const consentData = {
      version: CONSENT_VERSION,
      settings: consentSettings,
      timestamp: Date.now(),
    };

    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentData));
    applyConsentSettings(consentSettings);
    setShowBanner(false);
  };

  const acceptAll = () => {
    const allAccepted: ConsentSettings = {
      necessary: true,
      analytics: true,
      marketing: true,
      preferences: true,
    };
    setSettings(allAccepted);
    saveConsent(allAccepted);
  };

  const rejectAll = () => {
    const onlyNecessary: ConsentSettings = {
      necessary: true,
      analytics: false,
      marketing: false,
      preferences: false,
    };
    setSettings(onlyNecessary);
    saveConsent(onlyNecessary);
  };

  const saveCustom = () => {
    saveConsent(settings);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-black/50 backdrop-blur-sm">
      <Card className="max-w-4xl mx-auto p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Cookie className="w-8 h-8 text-primary" />
            <div>
              <h3 className="text-lg font-bold">Cookie Preferences</h3>
              <p className="text-sm text-muted-foreground">
                We value your privacy
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowBanner(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="mb-6">
          <p className="text-sm text-muted-foreground mb-3">
            We use cookies to enhance your browsing experience, serve personalized ads or content, and analyze our traffic.
            By clicking "Accept All", you consent to our use of cookies. You can customize your preferences or reject non-essential cookies.
          </p>

          <div className="flex gap-2 text-sm">
            <Link href="/privacy-policy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            <span className="text-muted-foreground">|</span>
            <Link href="/do-not-sell" className="text-primary hover:underline">
              Do Not Sell My Info
            </Link>
          </div>
        </div>

        {showDetails ? (
          <div className="space-y-4 mb-6 border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-semibold">Strictly Necessary</Label>
                <p className="text-xs text-muted-foreground">
                  Essential for the website to function. Cannot be disabled.
                </p>
              </div>
              <Switch checked={true} disabled />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="font-semibold">Analytics Cookies</Label>
                <p className="text-xs text-muted-foreground">
                  Help us understand how visitors interact with our website.
                </p>
              </div>
              <Switch
                checked={settings.analytics}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, analytics: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="font-semibold">Marketing Cookies</Label>
                <p className="text-xs text-muted-foreground">
                  Used to deliver personalized advertisements.
                </p>
              </div>
              <Switch
                checked={settings.marketing}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, marketing: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="font-semibold">Preference Cookies</Label>
                <p className="text-xs text-muted-foreground">
                  Remember your settings and preferences.
                </p>
              </div>
              <Switch
                checked={settings.preferences}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, preferences: checked })
                }
              />
            </div>
          </div>
        ) : (
          <Button
            variant="link"
            onClick={() => setShowDetails(true)}
            className="p-0 h-auto mb-4 text-sm"
          >
            <Shield className="w-4 h-4 mr-2" />
            Customize cookie settings
          </Button>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" onClick={rejectAll} className="flex-1">
            Reject Non-Essential
          </Button>

          {showDetails && (
            <Button variant="secondary" onClick={saveCustom} className="flex-1">
              Save Preferences
            </Button>
          )}

          <Button onClick={acceptAll} className="flex-1">
            Accept All
          </Button>
        </div>
      </Card>
    </div>
  );
}
