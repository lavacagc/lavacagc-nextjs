'use client'

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChefHat, Bath, Home, Hammer, Plus, ArrowRight, Layers, AlertCircle, RefreshCw } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Icon mapping
const iconMap: Record<string, any> = {
  ChefHat,
  Bath,
  Home,
  Hammer,
  Plus,
  Layers
};

interface Service {
  id: string;
  title: string;
  description: string;
  icon_name: string;
  features: any; // JSONB type from database
  sort_order: number;
}

const Services = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const fetchServices = async (attempt = 1) => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from('services')
          .select('*')
          .eq('active', true)
          .order('sort_order');

        if (error) throw error;
        setServices(data || []);
      } catch (err) {
        console.error('Error fetching services:', err);

        // Retry logic: try up to 3 times with exponential backoff
        if (attempt < 3) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
          setTimeout(() => fetchServices(attempt + 1), delay);
          setRetryCount(attempt);
        } else {
          setError('Unable to load services. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  const handleRetry = () => {
    setRetryCount(0);
    setError(null);
    setLoading(true);
    // Trigger a re-fetch by resetting and re-fetching
    const fetchServices = async () => {
      try {
        const { data, error } = await supabase
          .from('services')
          .select('*')
          .eq('active', true)
          .order('sort_order');

        if (error) throw error;
        setServices(data || []);
      } catch (err) {
        console.error('Error fetching services:', err);
        setError('Unable to load services. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    fetchServices();
  };

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
    <section id="services" className="py-10 md:py-20 bg-muted/30 scroll-mt-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
            Our Premium
            <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text"> Services</span>
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            Specialized in luxury home renovations for Northern New Jersey's most distinguished communities
          </p>
        </div>

        <div className="relative">
          {/* Scroll indicator for mobile */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 bg-gradient-to-l from-muted/80 to-transparent w-16 h-full pointer-events-none z-10 md:hidden" />
          <div className="overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            <div className="flex gap-8 min-w-max px-4">
            {error ? (
              // Error state with retry button
              <div className="w-full flex flex-col items-center justify-center py-16 px-4">
                <AlertCircle className="h-16 w-16 text-destructive mb-4" />
                <h3 className="text-xl font-semibold text-text-primary mb-2">Unable to Load Services</h3>
                <p className="text-text-secondary mb-6 text-center max-w-md">{error}</p>
                <Button onClick={handleRetry} variant="outline" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
              </div>
            ) : loading ? (
              // Loading skeletons with proper layout matching
              Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="flex-shrink-0 w-80 bg-gradient-card">
                  <CardContent className="p-8">
                    {/* Icon skeleton */}
                    <div className="flex items-center justify-center mb-4">
                      <Skeleton className="h-14 w-14 rounded-xl" />
                    </div>
                    {/* Title skeleton */}
                    <Skeleton className="h-8 w-3/4 mx-auto mb-3" />
                    {/* Description skeleton */}
                    <Skeleton className="h-20 w-full mb-6" />
                    {/* Features skeleton */}
                    <div className="space-y-2 mb-6">
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <div key={idx} className="flex items-center">
                          <Skeleton className="h-2 w-2 rounded-full mr-3" />
                          <Skeleton className="h-4 flex-1" />
                        </div>
                      ))}
                    </div>
                    {/* Button skeleton */}
                    <Skeleton className="h-12 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : (
              services.map((service) => {
                const Icon = iconMap[service.icon_name] || Home;
                const serviceSlug = service.title.toLowerCase().replace(/\s+/g, '-').replace('renovations', 'renovation');
                const serviceUrl = `/services/${serviceSlug}`;
                return (
                  <Card key={service.id} className="group hover:shadow-elegant transition-all duration-300 hover:-translate-y-2 bg-gradient-card border-2 hover:border-primary/20 flex-shrink-0 w-80 snap-start">
                    <CardContent className="p-8">
                      <div className="flex items-center justify-center mb-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-accent-tangerine/10 group-hover:from-primary/20 group-hover:to-accent-tangerine/20 transition-colors">
                          <Icon className="h-8 w-8 text-primary" />
                        </div>
                      </div>

                      <h3 className="text-2xl font-bold text-text-primary mb-3 group-hover:text-primary transition-colors text-center">
                        {service.title}
                      </h3>

                      <p className="text-text-muted mb-6 leading-relaxed text-center">
                        {service.description}
                      </p>

                      <div className="space-y-2 mb-6">
                        {(Array.isArray(service.features) ? service.features : []).map((feature: string, idx: number) => (
                          <div key={idx} className="flex items-center text-sm">
                            <div className="w-2 h-2 bg-primary rounded-full mr-3"></div>
                            <span className="text-text-secondary">{feature}</span>
                          </div>
                        ))}
                      </div>

                      <Link href={serviceUrl}>
                        <Button
                          variant="outline"
                          className="w-full h-auto py-3 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all duration-300"
                        >
                          <span className="flex items-center justify-center gap-2 flex-wrap">
                            <span>Our {service.title}</span>
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                          </span>
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                );
              })
            )}
            </div>
          </div>
        </div>

        <div className="text-center mt-12">
          <Button
            onClick={scrollToEstimate}
            size="lg"
            className="bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-button text-lg px-8 py-6 font-semibold transition-all duration-300 hover:scale-105"
          >
            Schedule Your Free Consultation
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Services;
