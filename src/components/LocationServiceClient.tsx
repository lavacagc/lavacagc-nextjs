'use client'

import { Button } from "@/components/ui/button";
import { Phone } from "lucide-react";
import CallTrackingWrapper from "@/components/CallTrackingWrapper";

export function GetEstimateButton() {
  const handleGetEstimate = () => {
    window.location.href = '/#estimate';
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center">
      <Button size="lg" onClick={handleGetEstimate} className="text-lg">
        Get Free Estimate
      </Button>
      <CallTrackingWrapper href="tel:2019312726">
        <Button size="lg" variant="outline" className="text-lg">
          <Phone className="w-5 h-5 mr-2" />
          Call (201) 931-2726
        </Button>
      </CallTrackingWrapper>
    </div>
  );
}

export function CTAButton() {
  const handleGetEstimate = () => {
    window.location.href = '/#estimate';
  };

  return (
    <Button size="lg" variant="secondary" onClick={handleGetEstimate} className="text-lg">
      Get Your Free Estimate
    </Button>
  );
}
