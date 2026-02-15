'use client'

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RECAPTCHA_SITE_KEY } from '@/lib/recaptcha-config';
import { ChevronRight, ChevronLeft, Calculator, Clock, DollarSign, Home } from "lucide-react";
import { z } from "zod";
import DOMPurify from "dompurify";
import { trackEstimateRequest } from '@/components/Analytics';
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";

interface EstimateFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  zipCode: string;
  projectType: string;
  projectTimeline: string;
  budgetRange: string;
  squareFootage: string;
  currentProjectStatus: string;
  message: string;
  preferredContactMethod: string;
  termsConsent: boolean;
}

// Validation schema
const estimateFormSchema = z.object({
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
  address: z.string()
    .trim()
    .min(1, "Address is required")
    .max(200, "Address must be less than 200 characters"),
  city: z.string()
    .trim()
    .min(1, "City is required")
    .max(100, "City must be less than 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "City can only contain letters, spaces, hyphens, and apostrophes"),
  zipCode: z.string()
    .trim()
    .min(1, "ZIP code is required")
    .regex(/^\d{5}(-\d{4})?$/, "Please enter a valid ZIP code"),
  projectType: z.string().min(1, "Project type is required"),
  projectTimeline: z.string().min(1, "Project timeline is required"),
  budgetRange: z.string().min(1, "Budget range is required"),
  squareFootage: z.string().optional(),
  currentProjectStatus: z.string().optional(),
  message: z.string().optional(),
  preferredContactMethod: z.string().min(1, "Preferred contact method is required"),
  termsConsent: z.literal(true, "You must agree to the Terms and Conditions")
});

const EstimateForm = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<EstimateFormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    zipCode: "",
    projectType: "",
    projectTimeline: "",
    budgetRange: "",
    squareFootage: "",
    currentProjectStatus: "",
    message: "",
    preferredContactMethod: "phone",
    termsConsent: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof EstimateFormData, string>>>({});
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

  // Sanitize user input to prevent XSS attacks
  const sanitizeInput = (input: string): string => {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    }).trim();
  };

  const executeRecaptcha = async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && window.grecaptcha?.enterprise) {
        window.grecaptcha.enterprise.ready(() => {
          window.grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action: 'estimate_request' })
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear error when user starts typing
    if (errors[name as keyof EstimateFormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear error when user makes selection
    if (errors[name as keyof EstimateFormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const validateStep = (step: number) => {
    let fieldsToValidate: Partial<typeof estimateFormSchema.shape> = {};

    switch (step) {
      case 1:
        fieldsToValidate = {
          firstName: estimateFormSchema.shape.firstName,
          lastName: estimateFormSchema.shape.lastName,
          email: estimateFormSchema.shape.email,
          phone: estimateFormSchema.shape.phone,
          address: estimateFormSchema.shape.address,
          city: estimateFormSchema.shape.city,
          zipCode: estimateFormSchema.shape.zipCode
        };
        break;
      case 2:
        fieldsToValidate = {
          projectType: estimateFormSchema.shape.projectType,
          projectTimeline: estimateFormSchema.shape.projectTimeline,
          budgetRange: estimateFormSchema.shape.budgetRange
        };
        break;
      case 3:
        fieldsToValidate = {
          preferredContactMethod: estimateFormSchema.shape.preferredContactMethod
        };
        break;
    }

    const stepSchema = z.object(fieldsToValidate);
    const result = stepSchema.safeParse(formData);

    if (!result.success) {
      const newErrors: Partial<Record<keyof EstimateFormData, string>> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof EstimateFormData;
        newErrors[field] = issue.message;
      });
      setErrors(prev => ({ ...prev, ...newErrors }));
      return false;
    }
    return true;
  };

  const isStepValid = () => {
    return validateStep(currentStep);
  };

  const nextStep = () => {
    if (validateStep(currentStep) && currentStep < 3) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    // Only allow submission if we're on step 3
    if (currentStep !== 3) {
      toast({
        title: "Please complete all steps",
        description: "You must complete steps 1 and 2 first.",
        variant: "destructive",
      });
      return;
    }

    // Validate all fields
    const result = estimateFormSchema.safeParse(formData);
    if (!result.success) {
      const newErrors: Partial<Record<keyof EstimateFormData, string>> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof EstimateFormData;
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

      // Sanitize all inputs before submission
      const sanitizedData = {
        first_name: sanitizeInput(formData.firstName),
        last_name: sanitizeInput(formData.lastName),
        email: sanitizeInput(formData.email),
        phone: sanitizeInput(formData.phone),
        address: sanitizeInput(formData.address),
        city: sanitizeInput(formData.city),
        zip_code: sanitizeInput(formData.zipCode),
        inquiry_type: 'estimate' as const,
        project_type: sanitizeInput(formData.projectType),
        project_timeline: sanitizeInput(formData.projectTimeline),
        budget_range: sanitizeInput(formData.budgetRange),
        square_footage: formData.squareFootage ? parseInt(formData.squareFootage) : null,
        current_project_status: sanitizeInput(formData.currentProjectStatus),
        message: sanitizeInput(formData.message),
        preferred_contact_method: formData.preferredContactMethod
      };

      // Submit to database
      const { error: dbError } = await supabase
        .from('leads')
        .insert(sanitizedData);

      if (dbError) throw dbError;

      // Log consent
      try {
        await supabase.functions.invoke('log-consent', {
          body: {
            user_email: formData.email,
            user_phone: formData.phone,
            consent_type: 'estimate_form',
            tcpa_consent: true,
            consent_text: 'User agreed to Terms and Conditions and consented to receive communications about their project',
            ip_address: null,
            user_agent: navigator.userAgent
          }
        });
      } catch (consentError) {
        console.error('Failed to log consent:', consentError);
      }

      // Send email notification
      const { error: emailError } = await supabase.functions.invoke('send-lead-notification', {
        body: {
          type: 'estimate',
          data: formData,
          recaptchaToken
        }
      });

      if (emailError) {
        console.error('Email notification failed:', emailError);
      }

      // Track successful estimate request in GA4
      trackEstimateRequest('estimate_form');

      toast({
        title: "Estimate Request Sent!",
        description: "We'll prepare your detailed estimate and get back to you within 24 hours.",
      });

      // Reset form
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        zipCode: "",
        projectType: "",
        projectTimeline: "",
        budgetRange: "",
        squareFootage: "",
        currentProjectStatus: "",
        message: "",
        preferredContactMethod: "phone",
        termsConsent: false
      });
      setErrors({});
      setCurrentStep(1);

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

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Home className="h-12 w-12 text-primary mx-auto mb-3" />
              <h3 className="text-xl font-semibold text-text-primary">Contact Information</h3>
              <p className="text-text-secondary">Let&apos;s start with your basic details</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  required
                  placeholder="John"
                  className={errors.firstName ? 'border-red-500' : ''}
                />
                {errors.firstName && <p className="text-xs text-red-500">{errors.firstName}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  required
                  placeholder="Smith"
                  className={errors.lastName ? 'border-red-500' : ''}
                />
                {errors.lastName && <p className="text-xs text-red-500">{errors.lastName}</p>}
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
                  required
                  placeholder="john@example.com"
                  className={errors.email ? 'border-red-500' : ''}
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  required
                  placeholder="(555) 123-4567"
                  className={errors.phone ? 'border-red-500' : ''}
                />
                {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Property Address *</Label>
              <Input
                id="address"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                required
                placeholder="123 Main Street"
                className={errors.address ? 'border-red-500' : ''}
              />
              {errors.address && <p className="text-xs text-red-500">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  required
                  placeholder="Alpine"
                  className={errors.city ? 'border-red-500' : ''}
                />
                {errors.city && <p className="text-xs text-red-500">{errors.city}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="zipCode">ZIP Code *</Label>
                <Input
                  id="zipCode"
                  name="zipCode"
                  value={formData.zipCode}
                  onChange={handleInputChange}
                  required
                  placeholder="07620"
                  className={errors.zipCode ? 'border-red-500' : ''}
                />
                {errors.zipCode && <p className="text-xs text-red-500">{errors.zipCode}</p>}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Calculator className="h-12 w-12 text-primary mx-auto mb-3" />
              <h3 className="text-xl font-semibold text-text-primary">Project Details</h3>
              <p className="text-text-secondary">Tell us about your renovation project</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Project Type *</Label>
                <Select value={formData.projectType} onValueChange={(value) => handleSelectChange('projectType', value)}>
                  <SelectTrigger className={errors.projectType ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select your project type" />
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

              <div className="space-y-2">
                <Label>Project Timeline *</Label>
                <Select value={formData.projectTimeline} onValueChange={(value) => handleSelectChange('projectTimeline', value)}>
                  <SelectTrigger className={errors.projectTimeline ? 'border-red-500' : ''}>
                    <SelectValue placeholder="When do you want to start?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asap">ASAP</SelectItem>
                    <SelectItem value="1-3months">1-3 months</SelectItem>
                    <SelectItem value="3-6months">3-6 months</SelectItem>
                    <SelectItem value="6-12months">6-12 months</SelectItem>
                    <SelectItem value="planning">Just planning/exploring</SelectItem>
                  </SelectContent>
                </Select>
                {errors.projectTimeline && <p className="text-xs text-red-500">{errors.projectTimeline}</p>}
              </div>

              <div className="space-y-2">
                <Label>Budget Range *</Label>
                <Select value={formData.budgetRange} onValueChange={(value) => handleSelectChange('budgetRange', value)}>
                  <SelectTrigger className={errors.budgetRange ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select your budget range" />
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

              <div className="space-y-2">
                <Label htmlFor="squareFootage">Square Footage (optional)</Label>
                <Input
                  id="squareFootage"
                  name="squareFootage"
                  value={formData.squareFootage}
                  onChange={handleInputChange}
                  placeholder="e.g. 1200"
                  type="number"
                />
              </div>

              <div className="space-y-2">
                <Label>Current Project Status (optional)</Label>
                <Select value={formData.currentProjectStatus} onValueChange={(value) => handleSelectChange('currentProjectStatus', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Where are you in the process?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="just-exploring">Just exploring ideas</SelectItem>
                    <SelectItem value="planning">Planning phase</SelectItem>
                    <SelectItem value="getting-quotes">Getting quotes</SelectItem>
                    <SelectItem value="need-contractor">Need contractor ASAP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <Clock className="h-12 w-12 text-primary mx-auto mb-3" />
              <h3 className="text-xl font-semibold text-text-primary">Additional Details</h3>
              <p className="text-text-secondary">Help us prepare the best estimate for you</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Preferred Contact Method *</Label>
                <Select value={formData.preferredContactMethod} onValueChange={(value) => handleSelectChange('preferredContactMethod', value)}>
                  <SelectTrigger className={errors.preferredContactMethod ? 'border-red-500' : ''}>
                    <SelectValue placeholder="How should we contact you?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">Phone call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="text">Text message</SelectItem>
                  </SelectContent>
                </Select>
                {errors.preferredContactMethod && <p className="text-xs text-red-500">{errors.preferredContactMethod}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Additional Details (optional)</Label>
                <Textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  placeholder="Tell us more about your project, specific requirements, or any questions you have..."
                  rows={4}
                />
              </div>

              <div className="bg-muted p-4 rounded-lg">
                <h4 className="font-semibold text-text-primary mb-2">What happens next?</h4>
                <ul className="text-sm text-text-secondary space-y-1">
                  <li>• We&apos;ll review your project details within 24 hours</li>
                  <li>• Schedule a consultation at your property</li>
                  <li>• Provide a detailed written estimate</li>
                  <li>• Discuss timeline and next steps</li>
                </ul>
              </div>

              {/* TCPA Consent Checkbox */}
              <div className="flex items-start space-x-2 p-4 border rounded-lg bg-background">
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
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="termsConsent"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
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
                    . You consent to receive calls, texts, and emails from us about your project. Standard message and data rates may apply. You can opt out at any time.
                  </p>
                  {errors.termsConsent && <p className="text-xs text-red-500">{errors.termsConsent}</p>}
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-text-primary flex items-center justify-center gap-2">
          <DollarSign className="h-6 w-6" />
          Schedule Your Estimate
        </CardTitle>
        <CardDescription className="text-text-secondary">
          Step {currentStep} of 3 - Complete our quick form for a detailed estimate
        </CardDescription>

        {/* Progress Bar */}
        <div className="w-full bg-muted h-2 rounded-full mt-4">
          <div
            className="bg-gradient-to-r from-primary to-accent-tangerine h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / 3) * 100}%` }}
          ></div>
        </div>
      </CardHeader>

      <CardContent>
        <div>
          {renderStep()}

          <div className="flex justify-between mt-8">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>

            {currentStep < 3 ? (
              <Button
                type="button"
                onClick={nextStep}
                disabled={!isStepValid()}
                className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button flex items-center gap-2"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !isStepValid() || !formData.termsConsent}
                className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Calculator className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Calculator className="h-4 w-4" />
                    Get My Estimate
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="text-center pt-4">
            <p className="text-xs text-text-muted">
              Protected by reCAPTCHA v3. No visible captcha required.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EstimateForm;
