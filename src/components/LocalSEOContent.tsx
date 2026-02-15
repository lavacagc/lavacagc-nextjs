import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Users, DollarSign, Home } from 'lucide-react';
import { LocationData } from '@/data/locationData';

interface LocalSEOContentProps {
  location: LocationData;
  service?: string;
}

const LocalSEOContent: React.FC<LocalSEOContentProps> = ({ location, service }) => {
  const serviceMap: Record<string, string> = {
    'kitchen-remodeling': 'kitchen remodeling',
    'bathroom-renovation': 'bathroom renovation',
    'basement-finishing': 'basement finishing',
    'home-additions': 'home additions'
  };

  const serviceName = service ? serviceMap[service] : 'home remodeling';

  return (
    <section className="py-16 bg-background-subtle">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Why Choose Local {location.name} Contractors?
            </h2>
            <p className="text-xl text-text-secondary">
              We understand {location.name}&apos;s unique architectural styles, building codes, and community standards
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <Card className="p-6">
              <CardContent className="p-0">
                <div className="flex items-start gap-4">
                  <MapPin className="h-8 w-8 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold text-text-primary mb-2">Local {location.county} Expertise</h3>
                    <p className="text-text-secondary mb-3">
                      Serving {location.name} and surrounding {location.county} communities with deep local knowledge of:
                    </p>
                    <ul className="space-y-1 text-sm text-text-secondary">
                      {location.neighborhoods.map((neighborhood, index) => (
                        <li key={index}>&#8226; {neighborhood}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="p-6">
              <CardContent className="p-0">
                <div className="flex items-start gap-4">
                  <Home className="h-8 w-8 text-primary mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold text-text-primary mb-2">
                      {location.name} {serviceName ? serviceName.charAt(0).toUpperCase() + serviceName.slice(1) : 'Remodeling'} Specialists
                    </h3>
                    <p className="text-text-secondary mb-3">
                      Understanding {location.name}&apos;s unique housing market and architectural requirements:
                    </p>
                    <ul className="space-y-1 text-sm text-text-secondary">
                      <li>&#8226; Average home value: {location.demographics.avgHomeValue}</li>
                      <li>&#8226; Premium materials and finishes</li>
                      <li>&#8226; HOA and architectural review compliance</li>
                      <li>&#8226; Local building permit expertise</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Near Me SEO Content */}
          <div className="bg-card border rounded-lg p-8">
            <h3 className="text-2xl font-bold text-text-primary mb-4">
              Looking for &quot;{serviceName} contractors near me&quot; in {location.name}?
            </h3>
            <div className="prose max-w-none text-text-secondary">
              <p className="mb-4">
                When searching for &quot;{serviceName} near me&quot; or &quot;local {serviceName} contractors,&quot; {location.name} homeowners
                trust La Vaca General Contractors for premium renovations throughout {location.county}. Our licensed and
                insured team specializes in {serviceName} projects that meet {location.name}&apos;s high standards.
              </p>

              <p className="mb-4">
                We serve all {location.name} zip codes including {location.zipCodes.join(', ')} and surrounding areas.
                Whether you&apos;re in {location.neighborhoods.slice(0, 3).join(', ')}, or nearby communities like{' '}
                {location.nearbyAreas.slice(0, 3).join(', ')}, we&apos;re your local {serviceName} experts.
              </p>

              <div className="grid md:grid-cols-3 gap-4 mt-6">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <Users className="h-6 w-6 text-primary mx-auto mb-2" />
                  <div className="font-semibold">Population</div>
                  <div className="text-sm">{location.demographics.population.toLocaleString()}</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <DollarSign className="h-6 w-6 text-primary mx-auto mb-2" />
                  <div className="font-semibold">Median Income</div>
                  <div className="text-sm">{location.demographics.medianIncome}</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <Home className="h-6 w-6 text-primary mx-auto mb-2" />
                  <div className="font-semibold">Avg Home Value</div>
                  <div className="text-sm">{location.demographics.avgHomeValue}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Service Area Coverage */}
          <div className="mt-8 text-center">
            <h4 className="text-lg font-semibold text-text-primary mb-4">
              We Also Serve These {location.county} Communities:
            </h4>
            <div className="flex flex-wrap justify-center gap-2">
              {location.nearbyAreas.map((area, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium"
                >
                  {area}, NJ
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LocalSEOContent;
