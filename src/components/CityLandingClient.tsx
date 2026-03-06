'use client'

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import CallTrackingWrapper from "@/components/CallTrackingWrapper";

interface CityHeroButtonsProps {
  cityName: string;
}

export function CityHeroButtons({ cityName }: CityHeroButtonsProps) {
  const handleGetEstimate = () => {
    window.location.href = '/#estimate';
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center">
      <Button
        size="lg"
        className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button"
        onClick={handleGetEstimate}
      >
        Get Free {cityName} Estimate
      </Button>
      <CallTrackingWrapper href="tel:2019312726">
        <Button variant="outline" size="lg">
          Call (201) 931-2726
        </Button>
      </CallTrackingWrapper>
    </div>
  );
}

interface ServiceCardProps {
  service: {
    title: string;
    description: string;
    features: string[];
    link: string;
  };
}

export function CityServiceCard({ service }: ServiceCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(service.link);
  };

  return (
    <Card
      className="hover:shadow-elegant transition-all duration-300 border-2 hover:border-primary/20 cursor-pointer"
      onClick={handleClick}
    >
      <CardContent className="p-6">
        <h3 className="text-xl font-bold text-text-primary mb-3">{service.title}</h3>
        <p className="text-text-secondary mb-4">{service.description}</p>
        <ul className="space-y-2 mb-4">
          {service.features.map((feature, featureIndex) => (
            <li key={featureIndex} className="flex items-center text-sm text-text-muted">
              <CheckCircle2 className="h-4 w-4 mr-2 text-accent-teal" />
              {feature}
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          className="w-full bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-elegant"
          aria-label={`Learn more about ${service.title}`}
        >
          Learn More
        </Button>
      </CardContent>
    </Card>
  );
}

export function CityCTAButtons() {
  const handleGetEstimate = () => {
    window.location.href = '/#estimate';
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center">
      <Button
        size="lg"
        variant="outline"
        className="bg-white text-secondary hover:bg-gray-100"
        onClick={handleGetEstimate}
      >
        Get Free Estimate
      </Button>
      <CallTrackingWrapper href="tel:2019312726">
        <Button size="lg" className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-elegant">
          Call (201) 931-2726
        </Button>
      </CallTrackingWrapper>
    </div>
  );
}
