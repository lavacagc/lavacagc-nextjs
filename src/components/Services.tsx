import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChefHat, Bath, Home, Hammer, Plus, ArrowRight, Layers } from "lucide-react";
import Link from "next/link";
import { createServerSupabaseClient } from "@/integrations/supabase/server";
import ScrollToEstimateButton from "@/components/ScrollToEstimateButton";

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
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
  features: string[] | null;
  sort_order: number;
}

async function getServices(): Promise<Service[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('active', true)
    .order('sort_order');

  if (error) {
    // Non-fatal: the section renders empty if services can't be loaded. Warn,
    // not error, so a data-source outage doesn't read as a critical page error.
    console.warn('Services: could not load services (non-fatal):', error);
    return [];
  }

  return (data as Service[]) || [];
}

const Services = async () => {
  const services = await getServices();

  return (
    <section id="services" className="py-10 md:py-20 bg-muted/30 scroll-mt-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-text-primary mb-6">
            Our Premium
            <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text"> Services</span>
          </h2>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            Specialized in luxury home renovations for Northern New Jersey&#39;s most distinguished communities
          </p>
        </div>

        <div className="relative">
          {/* Scroll indicator for mobile */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 bg-gradient-to-l from-muted/80 to-transparent w-16 h-full pointer-events-none z-10 md:hidden" />
          <div className="overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
            <div className="flex gap-8 min-w-max px-4">
              {services.length === 0 ? (
                <div className="w-full flex flex-col items-center justify-center py-16 px-4">
                  <p className="text-text-secondary text-center">No services available at this time. Please check back later.</p>
                </div>
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
          <ScrollToEstimateButton />
        </div>
      </div>
    </section>
  );
};

export default Services;
