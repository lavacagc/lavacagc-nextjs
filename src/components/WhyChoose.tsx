'use client'

import { Card, CardContent } from "@/components/ui/card";
import { Shield, Clock, Users, Award, FileText, Home } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import CallTrackingWrapper from "@/components/CallTrackingWrapper";

const features = [
  {
    icon: Shield,
    title: "Fully Licensed, Bonded, & Insured",
    description: "HIC# 13VH13373800 - Complete protection for your investment and peace of mind throughout your project."
  },
  {
    icon: FileText,
    title: "Detailed Project Planning",
    description: "Comprehensive planning with transparent pricing, detailed timelines, and no hidden costs or surprises."
  },
  {
    icon: Users,
    title: "Dedicated Project Manager",
    description: "Your personal project manager ensures seamless communication and quality control from start to finish."
  },
  {
    icon: Award,
    title: "Warranty-Backed Craftsmanship",
    description: "We stand behind our work with comprehensive warranties and a commitment to lasting quality."
  },
  {
    icon: Home,
    title: "Local Family Business",
    description: "Deep community roots and personal relationships built on trust, quality, and exceptional service."
  },
  {
    icon: Clock,
    title: "On-Time, On-Budget",
    description: "Reliable project completion with clear timelines and budget adherence - your time matters to us."
  }
];

const WhyChoose = () => {
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
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
            Why Choose
            <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text"> La Vaca</span>
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            Five generations of craftsmanship excellence, combined with modern project management and unwavering commitment to quality
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8 max-w-7xl mx-auto">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card key={index} className="group hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 bg-gradient-card border-2 hover:border-primary/20">
                <CardContent className="p-4 md:p-8 text-center">
                  <div className="p-3 md:p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-accent-tangerine/10 w-fit mx-auto mb-3 md:mb-6 group-hover:from-primary/20 group-hover:to-accent-tangerine/20 transition-colors">
                    <Icon className="h-6 w-6 md:h-8 md:w-8 text-primary" />
                  </div>

                  <h3 className="text-sm md:text-lg font-bold text-text-primary mb-4 group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>

                  <p className="text-text-muted leading-relaxed hidden md:block">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-16 text-center">
          <div className="max-w-4xl mx-auto p-8 bg-gradient-to-r from-secondary/5 to-primary/5 rounded-2xl border border-primary/10">
            <h3 className="text-2xl font-bold text-text-primary mb-4">Ready to Transform Your Home?</h3>
            <p className="text-lg text-text-secondary mb-6">
              Join over 100 satisfied homeowners who have trusted La Vaca with their luxury renovation projects
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={scrollToEstimate}
                className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-primary-foreground px-8 py-3 rounded-lg font-semibold transition-all duration-300 hover:scale-105"
              >
                Schedule Your Estimate
              </button>
              <CallTrackingWrapper href="tel:2012124917">
                <button className="border-2 border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground px-8 py-3 rounded-lg font-semibold transition-all duration-300">
                  Call (201) 212-4917
                </button>
              </CallTrackingWrapper>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyChoose;
