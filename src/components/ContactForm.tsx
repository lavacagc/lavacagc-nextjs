'use client'

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Mail, MessageCircle, AlertCircle } from "lucide-react";
import { z } from "zod";
import DOMPurify from "dompurify";
import { RECAPTCHA_SITE_KEY } from '@/lib/recaptcha-config';
import { trackFormSubmission } from '@/components/Analytics';
import { trackFormFieldFocus, trackFormAbandon } from '@/services/analyticsManager';
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import CallTrackingWrapper from "@/components/CallTrackingWrapper";
import { getVisitorData } from '@/hooks/useVisitor';
import { ContactTimePicker, type ContactTimePreference } from "@/components/forms/ContactTimePicker";
import { useRecaptchaChallenge } from "@/components/recaptcha/RecaptchaChallengeProvider";
import { submitLead } from "@/lib/submitLead";
import { GeoGateNotice } from "@/components/GeoGateNotice";

interface ContactFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  preferredContactMethod: string;
  termsConsent: boolean;
  contactTimePreference: ContactTimePreference;
  contactTimeDetails: string;
  contactTimezone: string;
}

// Validation schema with security constraints
const contactFormSchema = z.object({
  firstName: z.string()
    .min(1, "First name is required")
    .max(50, "First name must be less than 50 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters, spaces, hyphens, and apostrophes")
    .transform(val => val.trim()),
  lastName: z.string()
    .min(1, "Last name is required")
    .max(50, "Last name must be less than 50 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters, spaces, hyphens, and apostrophes")
    .transform(val => val.trim()),
  email: z.string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .max(255, "Email must be less than 255 characters")
    .transform(val => val.trim()),
  phone: z.string()
    .min(1, "Phone number is required")
    .regex(/^[\+]?[0-9\(\)\s\-\.]{7,20}$/, "Please enter a valid phone number")
    .max(20, "Phone number is too long")
    .transform(val => val.trim()),
  message: z.string()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message must be less than 2000 characters")
    .transform(val => val.trim()),
  preferredContactMethod: z.enum(["phone", "email"], {
    message: "Please select a contact method"
  }),
  termsConsent: z.literal(true, "You must agree to the Terms and Conditions")
});

const ContactForm = () => {
  const [honeypot, setHoneypot] = useState("");
  const [formData, setFormData] = useState<ContactFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    message: "",
    preferredContactMethod: "phone",
    termsConsent: false,
    contactTimePreference: "anytime",
    contactTimeDetails: "",
    contactTimezone: "America/New_York",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  const [formStarted, setFormStarted] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [lastFocusedField, setLastFocusedField] = useState('');
  const [focusedFields] = useState(new Set<string>());
  const { toast } = useToast();
  const { requestChallenge } = useRecaptchaChallenge();

  // Track form abandonment on unmount
  useEffect(() => {
    return () => {
      if (formStarted && !formSubmitted && focusedFields.size > 0) {
        trackFormAbandon('contact_form', lastFocusedField, focusedFields.size);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formStarted, formSubmitted, lastFocusedField]);

  const handleFieldFocus = (fieldName: string) => {
    if (!formStarted) setFormStarted(true);
    if (!focusedFields.has(fieldName)) {
      focusedFields.add(fieldName);
      trackFormFieldFocus('contact_form', fieldName);
    }
    setLastFocusedField(fieldName);
  };

  // Load reCAPTCHA only when user interacts with form
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

    // Load reCAPTCHA on first user interaction with form
    const handleInteraction = () => {
      loadRecaptcha();
      // Remove listeners after first interaction
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
          window.grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action: 'contact_form' })
            .then((token: string) => {
              resolve(token);
            })
            .catch((error: unknown) => {
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

  // Sanitize user input to prevent XSS attacks
  const sanitizeInput = (input: string): string => {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    }).trim();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for this field when user types
    if (errors[name as keyof ContactFormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Honeypot check — bots fill hidden fields, humans don't
    if (honeypot) {
      setFormSubmitted(true);
      toast({ title: "Request Sent!", description: "We'll get back to you within 24 hours." });
      return;
    }
    
    setErrors({});

    // Validate with Zod schema
    const validationResult = contactFormSchema.safeParse(formData);

    if (!validationResult.success) {
      const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
      validationResult.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof ContactFormData;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      });
      setErrors(fieldErrors);

      toast({
        title: "Validation Error",
        description: "Please check the form for errors.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Execute reCAPTCHA v3 - REQUIRED
      const recaptchaToken = await executeRecaptcha();
      if (!recaptchaToken) {
        toast({
          title: "Security Verification Failed",
          description: "Unable to verify. Please refresh the page and try again, or call us directly at (201) 212-4917.",
          variant: "destructive",
          duration: 10000,
        });
        setIsSubmitting(false);
        return;
      }

      // Sanitize all inputs before submission
      const sanitizedData = {
        first_name: sanitizeInput(formData.firstName),
        last_name: sanitizeInput(formData.lastName),
        email: sanitizeInput(formData.email),
        phone: sanitizeInput(formData.phone),
        message: sanitizeInput(formData.message),
        inquiry_type: 'contact' as const,
        preferred_contact_method: formData.preferredContactMethod,
        source: 'contact_form',
        contact_time_preference: formData.contactTimePreference,
        contact_time_details: formData.contactTimePreference === 'specific'
          ? sanitizeInput(formData.contactTimeDetails)
          : null,
        contact_timezone: formData.contactTimezone,
      };

      // Add visitor tracking data
      const visitorData = getVisitorData();
      const leadData = {
        ...sanitizedData,
        visitor_id: visitorData?.id || null,
        visit_count: visitorData?.visit_count || 1,
        first_seen: visitorData?.first_seen || null,
        referrer: visitorData?.referrer || null,
      };

      // Submit via server-side API (handles reCAPTCHA verification, scoring, DB insert, and notifications)
      const submitResult = await submitLead({
        ...leadData,
        recaptchaToken,
        recaptchaAction: 'contact_form',
        honeypot,
      }, requestChallenge);

      if (!submitResult.ok) {
        if (submitResult.cancelled) {
          toast({ title: 'Verification needed', description: "Please complete the checkbox to send your request, or call us at (201) 212-4917.", variant: 'destructive' });
          return;
        }
        throw new Error(submitResult.error || 'Failed to submit');
      }

      // Send email notification via Edge Function (reCAPTCHA already verified server-side)
      const { error: emailError } = await supabase.functions.invoke('send-lead-notification', {
        body: {
          type: 'contact',
          data: {
            firstName: sanitizedData.first_name,
            lastName: sanitizedData.last_name,
            email: sanitizedData.email,
            phone: sanitizedData.phone,
            message: sanitizedData.message,
            preferredContactMethod: sanitizedData.preferred_contact_method
          },
          recaptchaToken
        }
      });

      if (emailError) {
        console.error('Email notification failed:', emailError);
      }

      // Log consent
      try {
        // Server-side consent logging - the old log-consent edge fn rejected
        // ip_address: null (a browser can't know its own IP), so consent rows
        // silently failed to write. /api/consent/log derives IP + UA from the
        // request itself.
        await fetch('/api/consent/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_email: sanitizedData.email,
            user_phone: sanitizedData.phone,
            consent_type: 'contact_form_submission',
            tcpa_consent: true,
            consent_text: `I have read and agree to the Terms and Conditions and Privacy Policy, including consent to receive calls and text messages as described in Section 3.3 of the Terms and Conditions. By checking this box, I expressly consent to receive calls and texts from lavacagc.com at the phone number provided, including via automated dialing systems, for marketing and service-related purposes.`,
          }),
        });
      } catch (consentError) {
        console.error('Consent logging failed:', consentError);
      }

      // Mark as submitted before tracking (prevents abandonment event)
      setFormSubmitted(true);

      // Track successful form submission in GA4
      trackFormSubmission('contact_form');

      toast({
        title: "Message Sent Successfully!",
        description: "We'll get back to you within 24 hours.",
      });

      // Reset form
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        message: "",
        preferredContactMethod: "phone",
        termsConsent: false,
        contactTimePreference: "anytime",
        contactTimeDetails: "",
        contactTimezone: "America/New_York",
      });

    } catch (error) {
      console.error('Form submission error:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-text-primary">Contact Us Today</CardTitle>
        <CardDescription className="text-text-secondary">
          Get a quick response from our team of renovation experts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GeoGateNotice kind="estimate" />
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Honeypot — hidden from humans, bots auto-fill it */}
          <div className="absolute opacity-0 top-0 left-0 h-0 w-0 -z-10 overflow-hidden" aria-hidden="true" tabIndex={-1}>
            <label htmlFor="contact-website">Website</label>
            <input
              id="contact-website"
              name="website"
              type="text"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                name="firstName"
                type="text"
                value={formData.firstName}
                onChange={handleInputChange}
                onFocus={() => handleFieldFocus('firstName')}
                required
                placeholder="John"
                maxLength={50}
                className={errors.firstName ? "border-destructive" : ""}
              />
              {errors.firstName && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {errors.firstName}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                name="lastName"
                type="text"
                value={formData.lastName}
                onChange={handleInputChange}
                onFocus={() => handleFieldFocus('lastName')}
                required
                placeholder="Smith"
                maxLength={50}
                className={errors.lastName ? "border-destructive" : ""}
              />
              {errors.lastName && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {errors.lastName}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                onFocus={() => handleFieldFocus('email')}
                required
                placeholder="john@example.com"
                maxLength={255}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {errors.email}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleInputChange}
                onFocus={() => handleFieldFocus('phone')}
                required
                placeholder="(555) 123-4567"
                maxLength={20}
                className={errors.phone ? "border-destructive" : ""}
              />
              {errors.phone && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {errors.phone}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Preferred Contact Method</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="preferredContactMethod"
                  value="phone"
                  checked={formData.preferredContactMethod === "phone"}
                  onChange={handleInputChange}
                  className="text-primary"
                />
                <Phone className="h-4 w-4" />
                <span>Phone</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="preferredContactMethod"
                  value="email"
                  checked={formData.preferredContactMethod === "email"}
                  onChange={handleInputChange}
                  className="text-primary"
                />
                <Mail className="h-4 w-4" />
                <span>Email</span>
              </label>
            </div>
          </div>

          <ContactTimePicker
            value={formData.contactTimePreference}
            onChange={(v) => setFormData((prev) => ({ ...prev, contactTimePreference: v }))}
            details={formData.contactTimeDetails}
            onDetailsChange={(v) => setFormData((prev) => ({ ...prev, contactTimeDetails: v }))}
            onTimezoneChange={(tz) => setFormData((prev) => ({ ...prev, contactTimezone: tz }))}
            preferredContactMethod={formData.preferredContactMethod}
          />

          <div className="space-y-2">
            <Label htmlFor="message">Message *</Label>
            <Textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleInputChange}
              onFocus={() => handleFieldFocus('message')}
              required
              placeholder="Tell us about your project or ask any questions..."
              rows={5}
              maxLength={2000}
              className={errors.message ? "border-destructive" : ""}
            />
            {errors.message && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {errors.message}
              </p>
            )}
            <p className="text-xs text-text-muted">
              {formData.message.length}/2000 characters
            </p>
          </div>

          <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="termsConsent"
                checked={formData.termsConsent}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, termsConsent: checked as boolean })
                }
                className="mt-1"
              />
              <Label htmlFor="termsConsent" className="text-sm leading-relaxed cursor-pointer font-normal">
                I have read and agree to the{" "}
                <Link href="/terms-and-conditions" target="_blank" className="text-primary hover:underline font-medium">
                  Terms and Conditions
                </Link>{" "}
                and{" "}
                <Link href="/privacy-policy" target="_blank" className="text-primary hover:underline font-medium">
                  Privacy Policy
                </Link>
                , including consent to receive calls and text messages as described in Section 3.3 of the Terms and Conditions.
                <br /><br />
                <strong>TCPA Consent:</strong> By checking this box, I expressly consent to receive calls and text messages from lavacagc.com (NJHIC# 13VH13373800) at the phone number provided, including via automated dialing systems, for marketing and service-related purposes. I understand consent is not required to purchase services and I can opt out at any time by replying STOP to texts or contacting info@lavacagc.com.
              </Label>
            </div>
            {errors.termsConsent && (
              <p className="text-sm text-destructive ml-9">{errors.termsConsent}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || !formData.termsConsent}
            className="w-full bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-lg py-6 font-semibold transition-all duration-300"
          >
            {isSubmitting ? (
              <>
                <MessageCircle className="mr-2 h-5 w-5 animate-spin" />
                Sending Message...
              </>
            ) : (
              <>
                <MessageCircle className="mr-2 h-5 w-5" />
                Send Message
              </>
            )}
          </Button>

          <p className="text-sm text-text-muted text-center">
            We&apos;ll respond within 24 hours. For urgent matters, call us directly at{" "}
            <CallTrackingWrapper href="tel:2012124917" className="text-primary hover:underline font-semibold">
              (201) 212-4917
            </CallTrackingWrapper>
          </p>
        </form>
      </CardContent>
    </Card>
  );
};

export default ContactForm;
