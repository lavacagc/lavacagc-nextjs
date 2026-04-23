'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Checkbox } from '@/components/ui/checkbox'
import Link from 'next/link'
import { RECAPTCHA_SITE_KEY } from '@/lib/recaptcha-config'
import { ContactTimePicker, type ContactTimePreference } from '@/components/forms/ContactTimePicker'

interface LandingPageLeadFormProps {
  source: string
  projectType: string
  heading?: string
  subheading?: string
  buttonText?: string
  className?: string
}

const LandingPageLeadForm: React.FC<LandingPageLeadFormProps> = ({
  source,
  projectType,
  heading = 'Get Your Free Estimate',
  subheading = 'Fill out the form and we\'ll get back to you within 24 hours.',
  buttonText = 'Get My Free Estimate',
  className = '',
}) => {
  const [formData, setFormData] = useState<{
    name: string
    email: string
    phone: string
    zipCode: string
    termsConsent: boolean
    website: string
    contactTimePreference: ContactTimePreference
    contactTimeDetails: string
    contactTimezone: string
  }>({
    name: '',
    email: '',
    phone: '',
    zipCode: '',
    termsConsent: false,
    website: '', // honeypot field — bots fill this, humans never see it
    contactTimePreference: 'anytime',
    contactTimeDetails: '',
    contactTimezone: 'America/New_York',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { toast } = useToast()

  // Lazy-load reCAPTCHA on first form interaction (matches ContactForm/EstimateForm pattern)
  useEffect(() => {
    let recaptchaLoaded = false

    const loadRecaptcha = () => {
      if (recaptchaLoaded || document.getElementById('recaptcha-script')) return
      recaptchaLoaded = true

      const script = document.createElement('script')
      script.id = 'recaptcha-script'
      script.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    const handleInteraction = () => {
      loadRecaptcha()
      document.removeEventListener('focus', handleInteraction, true)
      document.removeEventListener('click', handleInteraction, true)
    }

    document.addEventListener('focus', handleInteraction, true)
    document.addEventListener('click', handleInteraction, true)

    return () => {
      document.removeEventListener('focus', handleInteraction, true)
      document.removeEventListener('click', handleInteraction, true)
    }
  }, [])

  const executeRecaptcha = async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && window.grecaptcha?.enterprise) {
        window.grecaptcha.enterprise.ready(() => {
          window.grecaptcha.enterprise
            .execute(RECAPTCHA_SITE_KEY, { action: 'landing_page' })
            .then((token: string) => resolve(token))
            .catch((err: unknown) => {
              console.error('reCAPTCHA execution failed:', err)
              resolve(null)
            })
        })
      } else {
        console.error('reCAPTCHA not loaded')
        resolve(null)
      }
    })
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.name.trim()) newErrors.name = 'Name is required'
    if (!formData.email.trim()) newErrors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Valid email required'
    if (!formData.phone.trim()) newErrors.phone = 'Phone is required'
    else if (!/^[\+]?[0-9\(\)\s\-\.]{7,20}$/.test(formData.phone)) newErrors.phone = 'Valid phone required'
    if (!formData.zipCode.trim()) newErrors.zipCode = 'ZIP code is required'
    else if (!/^\d{5}(-\d{4})?$/.test(formData.zipCode)) newErrors.zipCode = 'Valid ZIP required'
    if (!formData.termsConsent) newErrors.termsConsent = 'You must agree to continue'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Honeypot check — bots fill hidden fields, humans don't
    if (formData.website) {
      // Fake success so bot thinks it worked
      setIsSubmitted(true)
      return
    }
    
    if (!validate()) return

    setIsSubmitting(true)
    try {
      // Execute reCAPTCHA v3 (Enterprise) — REQUIRED by /api/leads/submit
      const recaptchaToken = await executeRecaptcha()
      if (!recaptchaToken) {
        toast({
          title: 'Security Verification Failed',
          description:
            'Please refresh the page and try again, or call us directly at (201) 212-4917.',
          variant: 'destructive',
          duration: 10000,
        })
        setIsSubmitting(false)
        return
      }

      // Split name into first/last
      const nameParts = formData.name.trim().split(/\s+/)
      const firstName = nameParts[0]
      const lastName = nameParts.slice(1).join(' ') || ''

      // Submit via server-side API (handles scoring, DB insert, and notifications)
      const submitRes = await fetch('/api/leads/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          zip_code: formData.zipCode.trim(),
          inquiry_type: 'estimate',
          project_type: projectType,
          source,
          preferred_contact_method: 'phone',
          contact_time_preference: formData.contactTimePreference,
          contact_time_details: formData.contactTimePreference === 'specific'
            ? formData.contactTimeDetails.trim()
            : null,
          contact_timezone: formData.contactTimezone,
          recaptchaToken,
          recaptchaAction: 'landing_page',
          honeypot: formData.website,
        }),
      })

      if (!submitRes.ok) {
        const errorData = await submitRes.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to submit')
      }

      // Track Facebook Pixel conversion
      if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
        window.fbq('track', 'Lead', {
          content_name: projectType,
          content_category: source,
        });
      }

      setIsSubmitted(true)
      toast({
        title: 'Request Sent!',
        description: "We'll contact you within 24 hours.",
      })
    } catch (error) {
      console.error('Lead form error:', error)
      toast({
        title: 'Error',
        description: 'Something went wrong. Please try again or call us.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className={`bg-card rounded-xl p-8 text-center shadow-lg ${className}`}>
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-2xl font-bold text-text-primary mb-2">Thank You!</h3>
        <p className="text-text-secondary mb-2">
          We&apos;ve received your request for a free {projectType} estimate.
        </p>
        <p className="text-sm text-text-muted">
          A team member will contact you within 24 hours.
        </p>
      </div>
    )
  }

  return (
    <div className={`bg-card rounded-xl p-6 md:p-8 shadow-lg ${className}`}>
      <div className="text-center mb-6">
        <h3 className="text-xl md:text-2xl font-bold text-text-primary">{heading}</h3>
        <p className="text-sm text-text-secondary mt-1">{subheading}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="source" value={source} />
        {/* Honeypot — hidden from humans, bots auto-fill it */}
        <div className="absolute opacity-0 top-0 left-0 h-0 w-0 -z-10 overflow-hidden" aria-hidden="true" tabIndex={-1}>
          <label htmlFor="lp-website">Website</label>
          <input
            id="lp-website"
            name="website"
            type="text"
            value={formData.website}
            onChange={handleChange}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lp-name" className="text-sm">Full Name *</Label>
          <Input
            id="lp-name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="John Smith"
            className={errors.name ? 'border-red-500' : ''}
          />
          {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lp-email" className="text-sm">Email *</Label>
          <Input
            id="lp-email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="john@example.com"
            className={errors.email ? 'border-red-500' : ''}
          />
          {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lp-phone" className="text-sm">Phone *</Label>
          <Input
            id="lp-phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            placeholder="(555) 123-4567"
            className={errors.phone ? 'border-red-500' : ''}
          />
          {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lp-zip" className="text-sm">ZIP Code *</Label>
          <Input
            id="lp-zip"
            name="zipCode"
            value={formData.zipCode}
            onChange={handleChange}
            placeholder="07620"
            maxLength={10}
            className={errors.zipCode ? 'border-red-500' : ''}
          />
          {errors.zipCode && <p className="text-xs text-red-500">{errors.zipCode}</p>}
        </div>

        <ContactTimePicker
          value={formData.contactTimePreference}
          onChange={(v) => setFormData((prev) => ({ ...prev, contactTimePreference: v }))}
          details={formData.contactTimeDetails}
          onDetailsChange={(v) => setFormData((prev) => ({ ...prev, contactTimeDetails: v }))}
          onTimezoneChange={(tz) => setFormData((prev) => ({ ...prev, contactTimezone: tz }))}
        />

        {/* TCPA Consent */}
        <div className="flex items-start space-x-2 p-3 border rounded-lg bg-background">
          <Checkbox
            id="lp-terms"
            checked={formData.termsConsent}
            onCheckedChange={(checked) => {
              setFormData((prev) => ({ ...prev, termsConsent: checked === true }))
              if (errors.termsConsent) setErrors((prev) => ({ ...prev, termsConsent: '' }))
            }}
            className={`mt-0.5 ${errors.termsConsent ? 'border-red-500' : ''}`}
          />
          <div className="grid gap-1 leading-none">
            <label htmlFor="lp-terms" className="text-xs leading-relaxed text-text-muted cursor-pointer">
              I agree to the{' '}
              <Link href="/terms-and-conditions" target="_blank" className="text-primary hover:underline">
                Terms &amp; Conditions
              </Link>{' '}
              and{' '}
              <Link href="/privacy-policy" target="_blank" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              . I consent to receive calls, texts, and emails about my project at the times I&apos;ve indicated.
            </label>
            {errors.termsConsent && <p className="text-xs text-red-500">{errors.termsConsent}</p>}
          </div>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting || !formData.termsConsent}
          className="w-full bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-lg py-6 font-semibold transition-all duration-300"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Submitting...
            </>
          ) : (
            buttonText
          )}
        </Button>

        <p className="text-xs text-text-muted text-center">
          No spam. No obligation. 100% free estimate.
        </p>
      </form>
    </div>
  )
}

export default LandingPageLeadForm
