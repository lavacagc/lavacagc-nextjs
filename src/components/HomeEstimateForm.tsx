'use client'

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RECAPTCHA_SITE_KEY } from '@/lib/recaptcha-config';
import { ChevronDown, ChevronUp, Calculator, CheckCircle } from "lucide-react";
import { z } from "zod";
import { trackEstimateRequest } from '@/components/Analytics';
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";

interface QuickEstimateData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  projectType: string;
  budgetRange: string;
  zipCode: string;
  termsConsent: boolean;
}

// Validation schema
const quickEstimateSchema = z.object({
  firstName: z.string()
    .trim()
    .min(1, "First name is required")
    .min(2, "First name must be at least 2 characters")
    .max(50, "First name must be less than 50 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "First name can only contain letters, spaces, hyphens, and apostrophes"),
  lastName: z.string()
    .trim()
    .min(1, "Last name is required")
    .min(2, "Last name must be at least 2 characters")
    .max(50, "Last name must be less than 50 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Last name can only contain letters, spaces, hyphens, and apostrophes"),
  email: z.string()
    .trim()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .max(255, "Email must be less than 255 characters"),
  phone: z.string()
    .trim()
    .min(1, "Phone number is required")
    .regex(/^[\+]?[1-9][\d]{0,15}$|^[\(]?[\d]{3}[\)]?[\s\-]?[\d]{3}[\s\-]?[\d]{4}$/, "Please enter a valid phone number"),
  projectType: z.string().min(1, "Project type is required"),
  budgetRange: z.string().min(1, "Budget range is required"),
  zipCode: z.string()
    .trim()
    .min(1, "ZIP code is required")
    .regex(/^\d{5}(-\d{4})?$/, "Please enter a valid ZIP code"),
  termsConsent: z.literal(true, "You must agree to the Terms and Conditions")
});

const HomeEstimateForm = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState<QuickEstimateData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    projectType: "",
    budgetRange: "",
    zipCode: "",
    termsConsent: false
  });
  const [errors, setErrors] = useState<Partial<Record<keyof QuickEstimateData, string>>>({});
  const { toast } = useToast();

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
      if (typeof window !== 'undefined' && (window as any).grecaptcha?.enterprise) {
        (window as any).grecaptcha.enterprise.ready(() => {
          (window as any).grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action: 'estimate_request' })
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear error when user starts typing
    if (errors[name as keyof QuickEstimateData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear error when user makes selection
    if (errors[name as keyof QuickEstimateData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const validateStep1 = () => {
    const step1Schema = quickEstimateSchema.pick({
      firstName: true,
      lastName: true,
      email: true,
      phone: true
    });

    const result = step1Schema.safeParse(formData);
    if (!result.success) {
      const newErrors: Partial<Record<keyof QuickEstimateData, string>> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof QuickEstimateData;
        newErrors[field] = issue.message;
      });
      setErrors(newErrors);
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const step2Schema = quickEstimateSchema.pick({
      projectType: true,
      budgetRange: true,
      zipCode: true
    });

    const result = step2Schema.safeParse(formData);
    if (!result.success) {
      const newErrors: Partial<Record<keyof QuickEstimateData, string>> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof QuickEstimateData;
        newErrors[field] = issue.message;
      });
      setErrors(prev => ({ ...prev, ...newErrors }));
      return false;
    }
    return true;
  };

  const canAdvanceToStep2 = () => {
    return formData.firstName && formData.lastName && formData.email && formData.phone;
  };

  const canSubmit = () => {
    return canAdvanceToStep2() && formData.projectType && formData.budgetRange && formData.zipCode;
  };

  const handleGetStarted = () => {
    if (!isExpanded) {
      setIsExpanded(true);
      return;
    }
    if (currentStep === 1) {
      if (validateStep1()) {
        setCurrentStep(2);
      }
    }
  };

  const handleSubmit = async () => {
    // Validate all fields
    const result = quickEstimateSchema.safeParse(formData);
    if (!result.success) {
      const newErrors: Partial<Record<keyof QuickEstimateData, string>> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof QuickEstimateData;
        newErrors[field] = issue.message;
      });
      setErrors(newErrors);
      toast({
        title: "Please fix the errors",
        description: "Check the highlighted fields and try again.",
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
          description: "Please refresh the page and try again.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Submit to database with reCAPTCHA token
      const { error: dbError } = await supabase
        .from('leads')
        .insert({
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          zip_code: formData.zipCode,
          inquiry_type: 'estimate',
          project_type: formData.projectType,
          budget_range: formData.budgetRange,
          project_timeline: 'asap',
          preferred_contact_method: 'phone'
        });

      if (dbError) throw dbError;

      // Log consent
      try {
        await supabase.functions.invoke('log-consent', {
          body: {
            user_email: formData.email,
            user_phone: formData.phone,
            consent_type: 'home_estimate_form',
            tcpa_consent: true,
            consent_text: 'User agreed to Terms and Conditions and consented to receive communications about their project',
            ip_address: null,
            user_agent: navigator.userAgent
          }
        });
      } catch (consentError) {
        console.error('Failed to log consent:', consentError);
      }

      // Send email notification with reCAPTCHA verification
      const { error: emailError } = await supabase.functions.invoke('send-lead-notification', {
        body: {
          type: 'estimate',
          data: {
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            zipCode: formData.zipCode,
            projectType: formData.projectType,
            budgetRange: formData.budgetRange,
            preferredContactMethod: 'phone'
          },
          recaptchaToken
        }
      });

      if (emailError) {
        console.error('Email notification failed:', emailError);
      }

      // Track successful estimate request in GA4
      trackEstimateRequest('home_quick_form');

      setIsSubmitted(true);

      toast({
        title: "Estimate Request Sent!",
        description: "We'll call you within 24 hours to discuss your project.",
      });

    } catch (error) {
      console.error('Form submission error:', error);
      toast({
        title: "Error",
        description: "Failed to send estimate request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardContent className="p-8 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-text-primary mb-2">Thank You!</h3>
          <p className="text-text-secondary mb-4">
            We've received your estimate request for your {formData.projectType} project.
          </p>
          <p className="text-sm text-text-muted mb-6">
            We'll call you at {formData.phone} within 24 hours to discuss details.
          </p>
          <Button
            onClick={() => {
              setIsSubmitted(false);
              setCurrentStep(1);
              setIsExpanded(false);
              setFormData({
                firstName: "",
                lastName: "",
                email: "",
                phone: "",
                projectType: "",
                budgetRange: "",
                zipCode: "",
                termsConsent: false
              });
              setErrors({});
            }}
            variant="outline"
            className="w-full"
          >
            Submit Another Request
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg mx-auto shadow-lg hover:shadow-xl transition-shadow duration-300">
      <CardHeader className="text-center pb-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Calculator className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl text-text-primary">Schedule Your Estimate</CardTitle>
        </div>
        <CardDescription className="text-text-secondary">
          {!isExpanded ? "Start with your contact info" :
           currentStep === 1 ? "Your contact information" : "Project details"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Step 1: Contact Info */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="firstName" className="text-sm">First Name <span className="text-destructive">*</span></Label>
              <Input
                id="firstName"
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                placeholder="John"
                className={`h-9 ${errors.firstName ? 'border-red-500' : ''}`}
              />
              {errors.firstName && <p className="text-xs text-red-500">{errors.firstName}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="lastName" className="text-sm">Last Name <span className="text-destructive">*</span></Label>
              <Input
                id="lastName"
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                placeholder="Smith"
                className={`h-9 ${errors.lastName ? 'border-red-500' : ''}`}
              />
              {errors.lastName && <p className="text-xs text-red-500">{errors.lastName}</p>}
            </div>
          </div>

          {isExpanded && (
            <>
              <div className="space-y-1">
                <Label htmlFor="email" className="text-sm">Email <span className="text-destructive">*</span></Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="john@example.com"
                  className={`h-9 ${errors.email ? 'border-red-500' : ''}`}
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-sm">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="(555) 123-4567"
                  className={`h-9 ${errors.phone ? 'border-red-500' : ''}`}
                />
                {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
              </div>
            </>
          )}
        </div>

        {/* Step 2: Project Details */}
        {isExpanded && currentStep === 2 && (
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-1">
              <Label className="text-sm">Project Type</Label>
              <Select value={formData.projectType} onValueChange={(value) => handleSelectChange('projectType', value)}>
                <SelectTrigger className={`h-9 ${errors.projectType ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Select project type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kitchen">Kitchen Remodel</SelectItem>
                  <SelectItem value="bathroom">Bathroom Renovation</SelectItem>
                  <SelectItem value="basement">Basement Finishing</SelectItem>
                  <SelectItem value="addition">Home Addition</SelectItem>
                  <SelectItem value="whole-home">Whole Home Remodel</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              {errors.projectType && <p className="text-xs text-red-500">{errors.projectType}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-sm">Budget Range</Label>
              <Select value={formData.budgetRange} onValueChange={(value) => handleSelectChange('budgetRange', value)}>
                <SelectTrigger className={`h-9 ${errors.budgetRange ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Select budget range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25k-50k">$25,000 - $50,000</SelectItem>
                  <SelectItem value="50k-100k">$50,000 - $100,000</SelectItem>
                  <SelectItem value="100k-200k">$100,000 - $200,000</SelectItem>
                  <SelectItem value="200k-500k">$200,000 - $500,000</SelectItem>
                  <SelectItem value="500k+">$500,000+</SelectItem>
                </SelectContent>
              </Select>
              {errors.budgetRange && <p className="text-xs text-red-500">{errors.budgetRange}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="zipCode" className="text-sm">ZIP Code</Label>
              <Input
                id="zipCode"
                name="zipCode"
                value={formData.zipCode}
                onChange={handleInputChange}
                placeholder="07620"
                className={`h-9 ${errors.zipCode ? 'border-red-500' : ''}`}
              />
              {errors.zipCode && <p className="text-xs text-red-500">{errors.zipCode}</p>}
            </div>

            {/* TCPA Consent Checkbox */}
            <div className="flex items-start space-x-2 p-3 border rounded-lg bg-background">
              <Checkbox
                id="termsConsent"
                checked={formData.termsConsent}
                onCheckedChange={(checked) => {
                  setFormData(prev => ({ ...prev, termsConsent: checked === true }));
                  if (errors.termsConsent) {
                    setErrors(prev => ({ ...prev, termsConsent: undefined }));
                  }
                }}
                className={errors.termsConsent ? 'border-red-500' : ''}
              />
              <div className="grid gap-1 leading-none">
                <label
                  htmlFor="termsConsent"
                  className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  I agree to the Terms and Conditions *
                </label>
                <p className="text-xs text-text-muted">
                  By checking this box, you agree to our{' '}
                  <Link href="/terms-and-conditions" className="text-primary hover:underline" target="_blank">
                    Terms and Conditions
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy-policy" className="text-primary hover:underline" target="_blank">
                    Privacy Policy
                  </Link>
                  . You consent to receive calls, texts, and emails about your project.
                </p>
                {errors.termsConsent && <p className="text-xs text-red-500">{errors.termsConsent}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2">
          {!isExpanded || currentStep === 1 ? (
            <Button
              onClick={handleGetStarted}
              disabled={isExpanded && currentStep === 1 && !canAdvanceToStep2()}
              className="w-full bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button transition-all duration-300"
            >
              {!isExpanded ? (
                <>
                  Get Started
                  <ChevronDown className="ml-2 h-4 w-4" />
                </>
              ) : (
                <>
                  Next: Project Details
                  <ChevronDown className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          ) : (
            <div className="space-y-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !canSubmit() || !formData.termsConsent}
                className="w-full bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button"
              >
                {isSubmitting ? (
                  <>
                    <Calculator className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Calculator className="mr-2 h-4 w-4" />
                    Get My Estimate
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setCurrentStep(1)}
                className="w-full text-sm"
              >
                <ChevronUp className="mr-2 h-4 w-4" />
                Back to Contact Info
              </Button>
            </div>
          )}
        </div>

        <div className="text-center pt-2">
          <p className="text-sm text-text-muted">
            Questions? Call us at <a href="tel:2012124917" className="text-primary hover:underline font-semibold">(201) 212-4917</a>
          </p>
          <p className="text-xs text-text-muted mt-2">
            Protected by reCAPTCHA v3. No visible captcha required.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default HomeEstimateForm;
