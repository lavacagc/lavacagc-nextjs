'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Send, CheckCircle, Loader2 } from 'lucide-react';
import { ContactTimePicker, type ContactTimePreference } from '@/components/forms/ContactTimePicker';
import { GeoGateNotice } from '@/components/GeoGateNotice';

const PROJECT_TYPES = [
  'Kitchen Remodeling',
  'Bathroom Renovation',
  'Basement Finishing',
  'Home Addition',
  'Whole Home Remodeling',
  'Interior Finishing',
  'Other',
];

export default function ReferralForm() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState<{
    referrerName: string;
    referrerEmail: string;
    referrerPhone: string;
    friendName: string;
    friendEmail: string;
    friendPhone: string;
    projectType: string;
    message: string;
    contactTimePreference: ContactTimePreference;
    contactTimeDetails: string;
    contactTimezone: string;
  }>({
    referrerName: '',
    referrerEmail: '',
    referrerPhone: '',
    friendName: '',
    friendEmail: '',
    friendPhone: '',
    projectType: '',
    message: '',
    contactTimePreference: 'anytime',
    contactTimeDetails: '',
    contactTimezone: 'America/New_York',
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit referral');
      }

      setIsSubmitted(true);
      toast({
        title: 'Referral Submitted!',
        description: 'Thank you! We\'ll reach out to your friend soon.',
      });
    } catch (error) {
      toast({
        title: 'Submission Failed',
        description: error instanceof Error ? error.message : 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <Card className="border-primary/20">
        <CardContent className="p-8 md:p-12 text-center">
          <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h3 className="text-2xl font-bold text-text-primary mb-4">
            Thank You for Your Referral!
          </h3>
          <p className="text-text-secondary text-lg mb-6 max-w-md mx-auto">
            We&apos;ll reach out to your friend within 24 hours to schedule their free consultation.
            You&apos;ll hear from us once they book their project!
          </p>
          <Button
            onClick={() => {
              setIsSubmitted(false);
              setFormData({
                referrerName: '',
                referrerEmail: '',
                referrerPhone: '',
                friendName: '',
                friendEmail: '',
                friendPhone: '',
                projectType: '',
                message: '',
                contactTimePreference: 'anytime',
                contactTimeDetails: '',
                contactTimezone: 'America/New_York',
              });
            }}
            variant="outline"
          >
            Submit Another Referral
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Submit a Referral</CardTitle>
        <CardDescription>
          Fill out the form below and we&apos;ll take care of the rest.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GeoGateNotice kind="referral" />
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Your Information */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Your Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="referrerName">Your Name *</Label>
                <Input
                  id="referrerName"
                  placeholder="John Smith"
                  value={formData.referrerName}
                  onChange={(e) => handleChange('referrerName', e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="referrerEmail">Your Email *</Label>
                <Input
                  id="referrerEmail"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.referrerEmail}
                  onChange={(e) => handleChange('referrerEmail', e.target.value)}
                  required
                  maxLength={255}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="referrerPhone">Your Phone *</Label>
                <Input
                  id="referrerPhone"
                  type="tel"
                  placeholder="(201) 555-0123"
                  value={formData.referrerPhone}
                  onChange={(e) => handleChange('referrerPhone', e.target.value)}
                  required
                  maxLength={20}
                />
              </div>
              <div className="md:col-span-2">
                <ContactTimePicker
                  value={formData.contactTimePreference}
                  onChange={(v) => setFormData((prev) => ({ ...prev, contactTimePreference: v }))}
                  details={formData.contactTimeDetails}
                  onDetailsChange={(v) => setFormData((prev) => ({ ...prev, contactTimeDetails: v }))}
                  onTimezoneChange={(tz) => setFormData((prev) => ({ ...prev, contactTimezone: tz }))}
                  labelOverride="When's the best time to reach YOU about this referral?"
                />
              </div>
            </div>
          </div>

          {/* Friend's Information */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Your Friend&apos;s Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="friendName">Friend&apos;s Name *</Label>
                <Input
                  id="friendName"
                  placeholder="Jane Doe"
                  value={formData.friendName}
                  onChange={(e) => handleChange('friendName', e.target.value)}
                  required
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="friendEmail">Friend&apos;s Email *</Label>
                <Input
                  id="friendEmail"
                  type="email"
                  placeholder="jane@example.com"
                  value={formData.friendEmail}
                  onChange={(e) => handleChange('friendEmail', e.target.value)}
                  required
                  maxLength={255}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="friendPhone">Friend&apos;s Phone *</Label>
                <Input
                  id="friendPhone"
                  type="tel"
                  placeholder="(973) 555-0456"
                  value={formData.friendPhone}
                  onChange={(e) => handleChange('friendPhone', e.target.value)}
                  required
                  maxLength={20}
                />
              </div>
            </div>
          </div>

          {/* Project Details */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Project Details</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="projectType">Project Type *</Label>
                <Select
                  value={formData.projectType}
                  onValueChange={(value) => handleChange('projectType', value)}
                  required
                >
                  <SelectTrigger id="projectType">
                    <SelectValue placeholder="Select a project type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Additional Notes (Optional)</Label>
                <Textarea
                  id="message"
                  placeholder="Tell us a bit about your friend's project or any other details..."
                  value={formData.message}
                  onChange={(e) => handleChange('message', e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || !formData.projectType}
            className="w-full bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient hover:shadow-button text-lg py-6"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="mr-2 h-5 w-5" />
                Submit Referral
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
