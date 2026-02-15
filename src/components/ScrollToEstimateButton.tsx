'use client'

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const ScrollToEstimateButton = () => {
  const router = useRouter();
  const pathname = usePathname();

  const scrollToEstimate = () => {
    if (pathname !== '/') {
      router.push('/');
      setTimeout(() => {
        document.getElementById('estimate')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 100);
    } else {
      document.getElementById('estimate')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  return (
    <Button
      onClick={scrollToEstimate}
      size="lg"
      className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-lg px-8 py-6 font-semibold transition-all duration-300 hover:scale-105"
    >
      Schedule Your Free Consultation
    </Button>
  );
};

export default ScrollToEstimateButton;
