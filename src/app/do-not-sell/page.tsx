'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Shield, CheckCircle, Mail, Phone, MapPin } from 'lucide-react';
import Breadcrumb from '@/components/Breadcrumb';
import { RECAPTCHA_SITE_KEY } from '@/lib/recaptcha-config';

export default function DoNotSell() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: ''
  });
  const [caResident, setCaResident] = useState(false);
  const [optOutConfirm, setOptOutConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const { toast } = useToast();

  // Load reCAPTCHA on user interaction
  useEffect(() => {
    let recaptchaLoaded = false;

    const loadRecaptcha = () => {
      if (recaptchaLoaded || document.getElementById('recaptcha-script')) return;
      recaptchaLoaded = true;

      const script = document.createElement('script');
      script.id = 'recaptcha-script';
      script.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    };

    const handleInteraction = () => {
      loadRecaptcha();
      document.removeEventListener('focus', handleInteraction, true);
      document.removeEventListener('click', handleInteraction, true);
    };

    document.addEventListener('focus', handleInteraction, true);
    document.addEventListener('click', handleInteraction, true);

    return () => {
      document.removeEventListener('focus', handleInteraction, true);
      document.removeEventListener('click', handleInteraction, true);
    };
  }, []);

  const executeRecaptcha = async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && window.grecaptcha?.enterprise) {
        window.grecaptcha.enterprise.ready(() => {
          window.grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action: 'opt_out_request' })
            .then((token: string) => {
              resolve(token);
            })
            .catch((error: any) => {
              console.error('reCAPTCHA execution failed:', error);
              resolve(null);
            });
        });
      } else {
        console.error('reCAPTCHA not loaded');
        resolve(null);
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!caResident || !optOutConfirm) {
      toast({
        title: 'Required Fields Missing',
        description: 'Please check all required boxes to submit your opt-out request.',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Execute reCAPTCHA
      const recaptchaToken = await executeRecaptcha();
      if (!recaptchaToken) {
        toast({
          title: 'Security Verification Failed',
          description: 'Please refresh the page and try again.',
          variant: 'destructive'
        });
        setIsSubmitting(false);
        return;
      }

      // Get client info
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipRes.json();

      const { data, error } = await supabase.functions.invoke('submit-opt-out', {
        body: {
          recaptchaToken,
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          ca_resident: caResident,
          ip_address: ipData.ip,
          user_agent: navigator.userAgent
        }
      });

      if (error) throw error;

      setConfirmationNumber(data.confirmationNumber);

      toast({
        title: 'Request Submitted',
        description: 'Your opt-out request has been received. Check your email for confirmation.',
      });

    } catch (error) {
      console.error('Error submitting opt-out request:', error);
      toast({
        title: 'Submission Failed',
        description: 'There was an error processing your request. Please try again or contact us directly.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirmationNumber) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow container mx-auto px-4 py-8">
          <Breadcrumb
            items={[
              { label: 'Home', href: '/' },
              { label: 'Do Not Sell My Information', href: '/do-not-sell' }
            ]}
          />

          <Card className="max-w-2xl mx-auto mt-8">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <CardTitle className="text-2xl">✓ Your Request Has Been Received</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Thank you for submitting your opt-out request. We have received your request and will
                process it within 15 business days.
              </p>

              <div className="bg-muted p-4 rounded-lg">
                <p className="font-semibold">Confirmation Number:</p>
                <p className="text-lg font-mono">{confirmationNumber}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Date Submitted: {new Date().toLocaleDateString()}
                </p>
              </div>

              <p>
                You will receive a confirmation email at the address you provided within 10 business days,
                and a final confirmation once your opt-out is complete.
              </p>

              <div className="border-t pt-4 mt-4">
                <p className="font-semibold mb-2">What This Means:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>We will stop sharing your browsing data with advertising partners</li>
                  <li>You may still see ads from us, but they won't be targeted based on your behavior</li>
                  <li>You can still receive quotes and services from us</li>
                </ul>
              </div>

              <Button
                onClick={() => router.push('/')}
                className="w-full"
              >
                Return to Home
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Do Not Sell My Information', href: '/do-not-sell' }
          ]}
        />

        <div className="max-w-4xl mx-auto mt-8">
          <div className="text-center mb-8">
            <Shield className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              Do Not Sell or Share My Personal Information
            </h1>
            <p className="text-lg text-muted-foreground">
              Exercise your California privacy rights
            </p>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Your Privacy Rights</CardTitle>
              <CardDescription>
                Under California law (CCPA/CPRA)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                <strong>California residents:</strong> Under the California Consumer Privacy Act (CCPA) and
                California Privacy Rights Act (CPRA), you have the right to opt out of the "sale" or "sharing"
                of your personal information.
              </p>
              <p>
                We do not sell your information for money, but we do share information with advertising partners
                (Google Ads, Facebook Pixel) for targeted advertising. This is considered "sharing" under California law.
              </p>

              <div className="bg-muted p-4 rounded-lg">
                <p className="font-semibold mb-2">What happens when you opt out:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>We will stop sharing your browsing data with advertising partners</li>
                  <li>You may still see ads from us, but they won't be targeted based on your behavior</li>
                  <li>You can still receive quotes and services from us</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Submit Your Opt-Out Request</CardTitle>
              <CardDescription>
                Complete this form to exercise your right to opt out
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">
                      Full Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">
                      Email Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      placeholder="john@example.com"
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone">Phone Number (Optional)</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(123) 456-7890"
                    />
                  </div>

                  <div className="space-y-4 pt-4">
                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="ca-resident"
                        checked={caResident}
                        onCheckedChange={(checked) => setCaResident(checked as boolean)}
                      />
                      <Label htmlFor="ca-resident" className="font-normal cursor-pointer">
                        I certify that I am a California resident <span className="text-destructive">*</span>
                      </Label>
                    </div>

                    <div className="flex items-start space-x-3">
                      <Checkbox
                        id="opt-out-confirm"
                        checked={optOutConfirm}
                        onCheckedChange={(checked) => setOptOutConfirm(checked as boolean)}
                      />
                      <Label htmlFor="opt-out-confirm" className="font-normal cursor-pointer">
                        I request to opt out of the sale/sharing of my personal information for targeted advertising <span className="text-destructive">*</span>
                      </Label>
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting || !caResident || !optOutConfirm}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Opt-Out Request'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Alternative Ways to Opt Out</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="flex items-start space-x-3">
                  <Mail className="w-5 h-5 text-primary mt-1" />
                  <div>
                    <p className="font-semibold">Email</p>
                    <a href="mailto:alex@lavacagc.com" className="text-sm text-primary hover:underline">
                      alex@lavacagc.com
                    </a>
                    <p className="text-xs text-muted-foreground">Subject: "Do Not Sell/Share Request"</p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Phone className="w-5 h-5 text-primary mt-1" />
                  <div>
                    <p className="font-semibold">Phone</p>
                    <a href="tel:+12012124917" className="text-sm text-primary hover:underline">
                      (201) 212-4917
                    </a>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <MapPin className="w-5 h-5 text-primary mt-1" />
                  <div>
                    <p className="font-semibold">Mail</p>
                    <p className="text-sm">
                      La Vaca General Contractors, LLC<br />
                      Attn: Privacy Officer<br />
                      New Jersey
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-muted p-4 rounded-lg mt-4">
                <p className="font-semibold mb-2">Processing Timeline:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>We will send a confirmation email within 10 business days</li>
                  <li>Your opt-out will be processed within 15 business days</li>
                  <li>You'll receive a final confirmation once your request is complete</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
