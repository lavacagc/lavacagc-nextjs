'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Phone, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { subscribeBannerState, isBannerVisible } from '@/hooks/useBannerState';
import { useRecaptchaChallenge } from '@/components/recaptcha/RecaptchaChallengeProvider';
import { submitLead } from '@/lib/submitLead';

const ExitIntentPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [bannerShowing, setBannerShowing] = useState(() => isBannerVisible());

  // Listen for SmartBanner visibility
  useEffect(() => {
    return subscribeBannerState(setBannerShowing);
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    projectType: '',
  });
  const { toast } = useToast();
  const { requestChallenge } = useRecaptchaChallenge();
  const pathname = usePathname();

  // Check if current page should show the popup
  const shouldShowOnPage = useCallback(() => {
    // Don't show on admin, auth, blog, or other excluded pages
    if (
      pathname.startsWith('/admin') || pathname.startsWith('/vaca-mgmt') ||
      pathname.startsWith('/auth') ||
      pathname.startsWith('/blog') ||
      pathname.startsWith('/do-not-sell') ||
      pathname.startsWith('/privacy-policy') ||
      pathname.startsWith('/terms-and-conditions') ||
      pathname.startsWith('/home-care')
    ) {
      return false;
    }
    // Show on homepage, service pages, and other main pages
    return true;
  }, [pathname]);

  useEffect(() => {
    // Don't show if not on allowed page
    if (!shouldShowOnPage()) {
      return;
    }

    // Check if already shown this session
    const hasShown = sessionStorage.getItem('exit_intent_shown');
    if (hasShown) {
      return;
    }

    let timeoutId: NodeJS.Timeout;

    // Desktop: detect mouse leaving viewport
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !isOpen && !bannerShowing) {
        timeoutId = setTimeout(() => {
          setIsOpen(true);
          sessionStorage.setItem('exit_intent_shown', 'true');
        }, 100);
      }
    };

    // Mobile: detect back button intent (popstate event)
    const handlePopState = () => {
      if (!isOpen && !bannerShowing) {
        setIsOpen(true);
        sessionStorage.setItem('exit_intent_shown', 'true');
        // Push state back to prevent actual navigation
        window.history.pushState(null, '', window.location.href);
      }
    };

    // Add extra history entry for mobile back button detection
    window.history.pushState(null, '', window.location.href);

    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('popstate', handlePopState);
      clearTimeout(timeoutId);
    };
  }, [pathname, isOpen, bannerShowing, shouldShowOnPage]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleProjectTypeChange = (value: string) => {
    setFormData((prev) => ({ ...prev, projectType: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.phone || !formData.projectType) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Split name into first and last
      const nameParts = formData.name.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || firstName;

      const submitResult = await submitLead({
        first_name: firstName,
        last_name: lastName,
        phone: formData.phone,
        email: '',
        inquiry_type: 'exit_intent',
        project_type: formData.projectType,
        message: `Exit intent popup - ${formData.projectType} project`,
        source: 'exit_intent',
        recaptchaToken: 'exit_intent_bypass',
        recaptchaAction: 'exit_intent',
      }, requestChallenge);

      if (!submitResult.ok) {
        if (submitResult.cancelled) {
          toast({ title: 'Verification needed', description: "Please complete the checkbox to send your request, or call us at (201) 212-4917.", variant: 'destructive' });
          return;
        }
        throw new Error(submitResult.error || 'Failed to submit');
      }

      toast({
        title: 'Success!',
        description: "We'll call you within 24 hours with your free estimate.",
      });

      setIsOpen(false);
      setFormData({ name: '', phone: '', projectType: '' });
    } catch (error) {
      console.error('Exit intent form submission error:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit. Please call us at (201) 212-4917.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md border-2 border-[#ea580c]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            Wait! Get a Free Estimate Before You Go
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            Leave your details and we&apos;ll call you with a free estimate within 24 hours
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Your Name *</Label>
            <Input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="John Smith"
              required
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number *</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleInputChange}
              placeholder="(555) 123-4567"
              required
              maxLength={20}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="projectType">Project Type *</Label>
            <Select value={formData.projectType} onValueChange={handleProjectTypeChange} required>
              <SelectTrigger id="projectType">
                <SelectValue placeholder="Select a project type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Kitchen">Kitchen Remodel</SelectItem>
                <SelectItem value="Bathroom">Bathroom Remodel</SelectItem>
                <SelectItem value="Basement">Basement Finishing</SelectItem>
                <SelectItem value="Addition">Home Addition</SelectItem>
                <SelectItem value="Other">Other Renovation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-[#ea580c] hover:bg-[#c2410c] text-white font-semibold"
            >
              {isSubmitting ? (
                'Submitting...'
              ) : (
                <>
                  <Phone className="mr-2 h-4 w-4" />
                  Get Free Estimate
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="px-4"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            No obligation. We respect your privacy.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ExitIntentPopup;
