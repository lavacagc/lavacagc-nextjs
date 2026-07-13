import React, { useState, useEffect } from 'react';
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, FileText, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, User, MapPin, FileX, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RECAPTCHA_SITE_KEY } from '@/lib/recaptcha-config';
import DOMPurify from "dompurify";
import { convertHeicFilesToJpeg } from '@/utils/heicConverter';
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";

interface WarrantyFormData {
  invoiceNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  zipCode: string;
  projectCompletionDate: string;
  originalProjectType: string;
  issueDescription: string;
  urgencyLevel: string;
  preferredContactMethod: string;
  termsConsent: boolean;
}

const WarrantyForm = () => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<WarrantyFormData>({
    invoiceNumber: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    zipCode: '',
    projectCompletionDate: '',
    originalProjectType: '',
    issueDescription: '',
    urgencyLevel: '',
    preferredContactMethod: 'phone',
    termsConsent: false
  });

  const [images, setImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recaptchaLoaded, setRecaptchaLoaded] = useState(false);

  const totalSteps = 4;

  // Load reCAPTCHA only when user interacts with form
  useEffect(() => {
    const loadRecaptcha = () => {
      if (window.grecaptcha) {
        setRecaptchaLoaded(true);
        return;
      }

      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setRecaptchaLoaded(true);
      };
      script.onerror = () => {
        console.error('Failed to load reCAPTCHA script');
        toast({
          title: "Security System Unavailable",
          description: "Please refresh the page and try again.",
          variant: "destructive",
        });
      };
      document.head.appendChild(script);
    };

    // Load reCAPTCHA on first user interaction
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
  }, [toast]);

  // Sanitize user input to prevent XSS attacks
  const sanitizeInput = (input: string): string => {
    return DOMPurify.sanitize(input, { 
      ALLOWED_TAGS: [], 
      ALLOWED_ATTR: [] 
    }).trim();
  };

  const handleInputChange = (field: keyof WarrantyFormData, value: string | boolean) => {
    if (typeof value === 'boolean') {
      setFormData(prev => ({ ...prev, [field]: value }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(formData.invoiceNumber && formData.firstName && formData.lastName && formData.email && formData.phone);
      case 2:
        return !!(formData.originalProjectType);
      case 3:
        // Issue description must be at least 10 characters
        return !!(formData.issueDescription && formData.issueDescription.trim().length >= 10 && formData.urgencyLevel);
      case 4:
        return formData.termsConsent; // Must agree to terms on final step
      default:
        return false;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
    } else {
      toast({
        title: "Please complete all required fields",
        description: "Fill in all required information before proceeding to the next step.",
        variant: "destructive",
      });
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    let files = Array.from(event.target.files || []);
    const currentImageCount = images.length;
    
    if (currentImageCount + files.length > 5) {
      toast({
        title: "Too many images",
        description: "You can upload a maximum of 5 images per warranty claim.",
        variant: "destructive",
      });
      return;
    }

    // Convert HEIC images to JPEG
    try {
      files = await convertHeicFilesToJpeg(files);
    } catch (error) {
      console.error('Error converting HEIC files:', error);
      toast({
        title: "Conversion Error",
        description: "Some images could not be converted. Please try a different format.",
        variant: "destructive",
      });
      return;
    }

    // Validate file types and sizes
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not an image file.`,
          variant: "destructive",
        });
        return false;
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File too large",
          description: `${file.name} is larger than 10MB.`,
          variant: "destructive",
        });
        return false;
      }
      
      return true;
    });

    setImages(prev => [...prev, ...validFiles]);
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    if (imageUrls[index]) {
      setImageUrls(prev => prev.filter((_, i) => i !== index));
    }
  };

  const uploadImages = async (): Promise<string[]> => {
    if (images.length === 0) return [];

    setUploading(true);
    const uploadedUrls: string[] = [];

    try {
      for (let i = 0; i < images.length; i++) {
        const file = images[i];
        const fileName = `${Date.now()}-${i}-${file.name}`;
        
        const { data, error } = await supabase.storage
          .from('warranty-images')
          .upload(fileName, file);

        if (error) {
          console.error('Upload error:', error);
          throw new Error(`Failed to upload ${file.name}`);
        }

        // Get public URL
        const { data: publicData } = supabase.storage
          .from('warranty-images')
          .getPublicUrl(data.path);

        uploadedUrls.push(publicData.publicUrl);
      }

      setImageUrls(uploadedUrls);
      return uploadedUrls;
    } catch (error) {
      console.error('Error uploading images:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload images. Please try again.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent submission if not on final step
    if (currentStep !== totalSteps) {
      return;
    }
    
    // Validate all steps before submission
    for (let step = 1; step <= totalSteps; step++) {
      if (!validateStep(step)) {
        toast({
          title: "Please complete all required fields",
          description: "Some required information is missing. Please review all steps.",
          variant: "destructive",
        });
        setCurrentStep(step);
        return;
      }
    }
    
    setSubmitting(true);

    try {
      // Execute reCAPTCHA v3 Enterprise
      let recaptchaToken = '';
      if (recaptchaLoaded && window.grecaptcha?.enterprise?.ready) {
        try {
          recaptchaToken = await new Promise<string>((resolve, reject) => {
            window.grecaptcha.enterprise.ready(() => {
              window.grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, { action: 'warranty_claim' })
                .then(resolve)
                .catch(reject);
            });
          });
        } catch (error) {
          console.error('reCAPTCHA Enterprise execution failed:', error);
          toast({
            title: "Security Verification Failed",
            description: "Please refresh the page and try again.",
            variant: "destructive",
          });
          setSubmitting(false);
          return;
        }
      } else {
        toast({
          title: "Security System Not Ready",
          description: "Please refresh the page and try again.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      // Upload images first
      const uploadedImageUrls = await uploadImages();

      // Log consent
      try {
        // Server-side consent logging (see /api/consent/log) - the old
        // log-consent edge fn rejected ip_address: null, losing the record.
        await fetch('/api/consent/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_email: formData.email,
            user_phone: formData.phone,
            consent_type: 'warranty_claim',
            tcpa_consent: true,
            consent_text: 'User agreed to Terms and Conditions and consented to receive communications about their warranty claim',
          }),
        });
      } catch (consentError) {
        console.error('Failed to log consent:', consentError);
      }

      // Sanitize all inputs before submission
      const sanitizedData = {
        invoice_number: sanitizeInput(formData.invoiceNumber),
        first_name: sanitizeInput(formData.firstName),
        last_name: sanitizeInput(formData.lastName),
        email: sanitizeInput(formData.email),
        phone: sanitizeInput(formData.phone),
        address: sanitizeInput(formData.address),
        city: sanitizeInput(formData.city),
        zip_code: sanitizeInput(formData.zipCode),
        project_completion_date: formData.projectCompletionDate,
        original_project_type: sanitizeInput(formData.originalProjectType),
        issue_description: sanitizeInput(formData.issueDescription),
        urgency_level: formData.urgencyLevel,
        preferred_contact_method: formData.preferredContactMethod,
        image_urls: uploadedImageUrls
      };

      // Submit warranty claim to database
      const { error: dbError } = await supabase
        .from('warranty_claims')
        .insert(sanitizedData);

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error('Failed to save warranty claim');
      }

      // Send email notification
      const { error: emailError } = await supabase.functions.invoke('send-warranty-notification', {
        body: {
          recaptchaToken,
          formData,
          imageUrls: uploadedImageUrls
        }
      });

      if (emailError) {
        console.error('Email notification error:', emailError);
        throw new Error(emailError.message || 'Failed to send notification');
      }

      toast({
        title: "Warranty claim submitted",
        description: "Your warranty claim was submitted successfully. We'll contact you within 24 hours.",
      });

      // Reset form
      setFormData({
        invoiceNumber: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        zipCode: '',
        projectCompletionDate: '',
        originalProjectType: '',
        issueDescription: '',
        urgencyLevel: '',
        preferredContactMethod: 'phone',
        termsConsent: false
      });
      setImages([]);
      setImageUrls([]);
      setCurrentStep(1);

    } catch (error) {
      console.error('Error submitting warranty claim:', error);
      toast({
        title: "Submission failed",
        description: "There was an error submitting your warranty claim. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getStepIcon = (step: number) => {
    switch (step) {
      case 1: return <User className="h-4 w-4" />;
      case 2: return <MapPin className="h-4 w-4" />;
      case 3: return <FileX className="h-4 w-4" />;
      case 4: return <Camera className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getStepTitle = (step: number) => {
    switch (step) {
      case 1: return "Contact & Invoice";
      case 2: return "Project Details";
      case 3: return "Issue Details";
      case 4: return "Photos & Submit";
      default: return "Step";
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            {/* Invoice Number */}
            <div className="bg-primary/5 p-4 rounded-lg border-l-4 border-primary">
              <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice Information
              </h3>
              <div>
                <Label htmlFor="invoiceNumber">Invoice Number *</Label>
                <Input
                  id="invoiceNumber"
                  value={formData.invoiceNumber}
                  onChange={(e) => handleInputChange('invoiceNumber', e.target.value)}
                  placeholder="Enter your original project invoice number"
                  required
                />
                <p className="text-xs text-text-secondary mt-1">
                  This helps us locate your project records and warranty information
                </p>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary border-b pb-2">Contact Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            {/* Property Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary border-b pb-2">Property Information</h3>
              <div>
                <Label htmlFor="address">Property Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="Street address"
                />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="zipCode">ZIP Code</Label>
                  <Input
                    id="zipCode"
                    value={formData.zipCode}
                    onChange={(e) => handleInputChange('zipCode', e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Project Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary border-b pb-2">Project Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="projectCompletionDate">Project Completion Date</Label>
                  <Input
                    id="projectCompletionDate"
                    type="date"
                    value={formData.projectCompletionDate}
                    onChange={(e) => handleInputChange('projectCompletionDate', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="originalProjectType">Original Project Type *</Label>
                  <Select 
                    value={formData.originalProjectType} 
                    onValueChange={(value) => handleInputChange('originalProjectType', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select project type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Kitchen Remodeling">Kitchen Remodeling</SelectItem>
                      <SelectItem value="Bathroom Renovation">Bathroom Renovation</SelectItem>
                      <SelectItem value="Basement Finishing">Basement Finishing</SelectItem>
                      <SelectItem value="Home Addition">Home Addition</SelectItem>
                      <SelectItem value="Whole House Renovation">Whole House Renovation</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            {/* Issue Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary border-b pb-2">Issue Details</h3>
              <div>
                <Label htmlFor="issueDescription">Describe the Issue *</Label>
                <Textarea
                  id="issueDescription"
                  value={formData.issueDescription}
                  onChange={(e) => handleInputChange('issueDescription', e.target.value)}
                  placeholder="Please provide a detailed description of the warranty issue..."
                  rows={4}
                  required
                />
                <p className="text-xs text-text-secondary mt-1">
                  {formData.issueDescription.trim().length} / 10 characters minimum
                  {formData.issueDescription.trim().length < 10 && formData.issueDescription.trim().length > 0 && (
                    <span className="text-destructive ml-1">
                      (Need {10 - formData.issueDescription.trim().length} more)
                    </span>
                  )}
                </p>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="urgencyLevel">Urgency Level *</Label>
                  <Select 
                    value={formData.urgencyLevel} 
                    onValueChange={(value) => handleInputChange('urgencyLevel', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select urgency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low - Cosmetic issue, no immediate impact</SelectItem>
                      <SelectItem value="Medium">Medium - Functionality affected</SelectItem>
                      <SelectItem value="High">High - Safety concern or significant damage</SelectItem>
                      <SelectItem value="Emergency">Emergency - Immediate attention required</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="preferredContactMethod">Preferred Contact Method</Label>
                  <Select 
                    value={formData.preferredContactMethod} 
                    onValueChange={(value) => handleInputChange('preferredContactMethod', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">Phone Call</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            {/* Image Upload */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary border-b pb-2">Photo Documentation</h3>
              <p className="text-sm text-text-secondary">
                Upload up to 5 photos to help us assess the warranty issue. Photos should clearly show the problem area.
              </p>
              
              <div className="border-2 border-dashed border-muted rounded-lg p-6">
                <input
                  type="file"
                  multiple
                  accept="image/*,.heic,.heif"
                  onChange={handleImageSelect}
                  className="hidden"
                  id="image-upload"
                  disabled={images.length >= 5}
                />
                <label 
                  htmlFor="image-upload" 
                  className={`cursor-pointer flex flex-col items-center justify-center space-y-2 ${
                    images.length >= 5 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {images.length >= 5 ? 'Maximum 5 images reached' : 'Click to upload images (max 5)'}
                  </span>
                </label>
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {images.map((image, index) => (
                    <div key={index} className="relative group">
                      <Image
                        src={URL.createObjectURL(image)}
                        alt={`Warranty claim upload ${index + 1}`}
                        className="w-full h-24 object-cover rounded border"
                        width={200}
                        height={96}
                        unoptimized
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 rounded-b">
                        {image.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Review Summary */}
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-text-primary mb-3">Review Your Claim</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p><strong>Invoice:</strong> {formData.invoiceNumber}</p>
                  <p><strong>Name:</strong> {formData.firstName} {formData.lastName}</p>
                  <p><strong>Email:</strong> {formData.email}</p>
                  <p><strong>Phone:</strong> {formData.phone}</p>
                </div>
                <div>
                  <p><strong>Project:</strong> {formData.originalProjectType}</p>
                  <p><strong>Urgency:</strong> {formData.urgencyLevel}</p>
                  <p><strong>Images:</strong> {images.length} attached</p>
                </div>
              </div>
            </div>

            {/* TCPA Consent Checkbox */}
            <div className="flex items-start space-x-2 p-4 border rounded-lg bg-background">
              <Checkbox
                id="termsConsent"
                checked={formData.termsConsent}
                onCheckedChange={(checked) => handleInputChange('termsConsent', checked === true)}
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
                  . You consent to receive calls, texts, and emails from us about your warranty claim. Standard message and data rates may apply.
                </p>
              </div>
            </div>

            {/* reCAPTCHA Notice */}
            <div className="bg-muted p-4 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-text-primary">Protected by reCAPTCHA</p>
                  <p className="text-xs text-text-secondary">
                    This form is protected by reCAPTCHA and the Google{' '}
                    <a href="https://policies.google.com/privacy" className="underline" target="_blank" rel="noopener noreferrer">
                      Privacy Policy
                    </a>{' '}
                    and{' '}
                    <a href="https://policies.google.com/terms" className="underline" target="_blank" rel="noopener noreferrer">
                      Terms of Service
                    </a>{' '}
                    apply.
                  </p>
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
    <Card className="max-w-4xl mx-auto">
      <CardHeader className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <FileText className="h-6 w-6 text-primary" />
          <CardTitle className="text-2xl text-text-primary">Submit Warranty Claim</CardTitle>
        </div>
        <CardDescription className="text-text-secondary">
          Complete this form to submit a warranty claim for your completed project.
        </CardDescription>

        {/* Step Progress Indicator */}
        <div className="flex justify-center mt-6">
          <div className="flex items-center space-x-2">
            {[1, 2, 3, 4].map((step) => (
              <React.Fragment key={step}>
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all ${
                  step === currentStep 
                    ? 'border-primary bg-primary text-primary-foreground' 
                    : step < currentStep 
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground text-muted-foreground'
                }`}>
                  {step < currentStep ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    getStepIcon(step)
                  )}
                </div>
                {step < 4 && (
                  <div className={`w-8 h-0.5 transition-all ${
                    step < currentStep ? 'bg-primary' : 'bg-muted-foreground'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="text-center mt-4">
          <h3 className="text-lg font-medium text-text-primary">
            Step {currentStep} of {totalSteps}: {getStepTitle(currentStep)}
          </h3>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {renderStepContent()}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-6 border-t">
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

            {currentStep < totalSteps ? (
              <Button
                type="button"
                onClick={nextStep}
                disabled={submitting}
                className="flex items-center gap-2 bg-gradient-to-r from-primary to-accent-tangerine"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button 
                type="button"
                onClick={handleSubmit}
                className="flex items-center gap-2 bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button"
                disabled={submitting || uploading}
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Submitting...
                  </>
                ) : uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Submit Warranty Claim
                  </>
                )}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default WarrantyForm;