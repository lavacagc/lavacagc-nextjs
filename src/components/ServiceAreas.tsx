'use client'

import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

interface ServiceArea {
  id: string;
  name: string;
  zip_code: string | null;
  description: string | null;
  has_page: boolean;
}

const ServiceAreas = () => {
  const router = useRouter();
  const pathname = usePathname();
  const [locations, setLocations] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);

  useEffect(() => {
    const checkSize = () => {
      setIsMobileOrTablet(window.innerWidth <= 1024);
    };

    checkSize();
    window.addEventListener('resize', checkSize);
    return () => window.removeEventListener('resize', checkSize);
  }, []);

  // Mobile scrolling rows data
  const scrollingRows = [
    { locations: ['Alpine', 'Short Hills', 'Saddle River', 'Essex Fells', 'Millburn'], direction: 'left', speed: '20s' },
    { locations: ['Montclair', 'Morristown', 'Livingston', 'West Orange', 'Verona'], direction: 'right', speed: '22s' },
    { locations: ['Caldwell', 'Ho-Ho-Kus', 'Summit', 'Chatham', 'Madison'], direction: 'left', speed: '20s' },
  ];

  useEffect(() => {
    const fetchServiceAreas = async () => {
      try {
        const { data, error } = await supabase
          .from('service_areas')
          .select('*')
          .eq('active', true)
          .order('sort_order');

        if (error) throw error;
        setLocations(data || []);
      } catch (error) {
        console.error('Error fetching service areas:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchServiceAreas();
  }, []);

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
    <section id="service-areas" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
            Proudly Serving
            <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text"> Northern New Jersey&apos;s</span>
            <br />Premier Communities
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            Specializing in luxury home renovations in Northern New Jersey&apos;s most distinguished neighborhoods
          </p>
        </div>

        {/* Service Areas */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-text-primary mb-8 text-center">Service Areas</h3>

          {/* Mobile & Tablet Animated Scrolling Version */}
          {isMobileOrTablet ? (
            <div className="overflow-hidden space-y-5">
              {scrollingRows.map((row, rowIndex) => (
                <div key={rowIndex} className="overflow-hidden">
                  <div
                    className="flex gap-5 hover:pause-animation"
                    style={{
                      animation: `scroll-${row.direction} ${row.speed} linear infinite`,
                    }}
                  >
                    {/* Duplicate locations for seamless loop */}
                    {[...row.locations, ...row.locations].map((location, idx) => (
                      <div
                        key={idx}
                        className="px-[30px] py-[15px] bg-[#f0f0f5] rounded-[25px] text-text-secondary whitespace-nowrap flex-shrink-0"
                      >
                        {location}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-text-muted mt-6 text-lg text-center px-4">
                Don&apos;t see your town? <button onClick={scrollToEstimate} className="text-primary font-semibold hover:text-primary/80 transition-colors cursor-pointer">
                  Contact us
                </button> - we likely service your area too!
              </p>
            </div>
          ) : (
            /* Desktop Static Version */
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-wrap justify-center gap-3">
                {loading ? (
                  // Loading skeletons
                  Array.from({ length: 16 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 w-32 rounded-full" />
                  ))
                ) : (
                  locations.map((area) => {
                    const areaSlug = area.name.toLowerCase().replace(/\s+/g, '-');

                    if (area.has_page) {
                      return (
                        <Link
                          key={area.id}
                          href={`/locations/${areaSlug}`}
                          className="px-4 py-2 bg-muted hover:bg-primary hover:text-primary-foreground rounded-full text-text-secondary hover:shadow-md transition-all duration-300 cursor-pointer"
                        >
                          {area.name}
                        </Link>
                      );
                    } else {
                      return (
                        <span
                          key={area.id}
                          className="px-4 py-2 bg-muted hover:bg-primary hover:text-primary-foreground rounded-full text-text-secondary hover:shadow-md transition-all duration-300 cursor-pointer"
                        >
                          {area.name}
                        </span>
                      );
                    }
                  })
                )}
              </div>
              <p className="text-text-muted mt-6 text-lg text-center">
                Don&apos;t see your town? <button onClick={scrollToEstimate} className="text-primary font-semibold hover:text-primary/80 transition-colors cursor-pointer">
                  Contact us
                </button> - we likely service your area too!
              </p>
            </div>
          )}
        </div>

        {/* Service Radius */}
        <div className="mt-16 text-center">
          <div className="max-w-2xl mx-auto p-8 bg-gradient-to-r from-primary/5 to-accent-sunset/5 rounded-2xl border border-primary/10">
            <h4 className="text-2xl font-bold text-text-primary mb-4">Our Service Commitment</h4>
            <p className="text-lg text-text-secondary mb-4">
              We provide premium remodeling services within a 25-mile radius of our base in Northern New Jersey
            </p>
            <div className="flex items-center justify-center space-x-6 text-sm text-text-muted">
              <div className="flex items-center">
                <div className="w-3 h-3 min-w-3 min-h-3 bg-accent-teal rounded-full mr-2 flex-shrink-0"></div>
                Free Estimates
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 min-w-3 min-h-3 bg-primary rounded-full mr-2 flex-shrink-0"></div>
                Licensed, Bonded, & Insured
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 min-w-3 min-h-3 bg-accent-sunset rounded-full mr-2 flex-shrink-0"></div>
                Local Family Business
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ServiceAreas;
