'use client'

import React from 'react';
import Script from 'next/script';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Star, DollarSign } from 'lucide-react';

interface PricingOption {
  name: string;
  price: {
    min: number;
    max?: number;
    unit: string;
    currency?: string;
  };
  description: string;
  features: string[];
  popular?: boolean;
  timeline?: string;
}

interface PricingTableProps {
  title: string;
  subtitle?: string;
  options: PricingOption[];
  className?: string;
  businessName?: string;
}

const PricingTable: React.FC<PricingTableProps> = ({
  title,
  subtitle,
  options,
  className = "",
  businessName = "La Vaca General Contractors"
}) => {
  // Generate pricing schema for rich results
  const pricingSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": title,
    "description": subtitle,
    "brand": {
      "@type": "Brand",
      "name": businessName
    },
    "offers": options.map(option => ({
      "@type": "Offer",
      "name": option.name,
      "description": option.description,
      "price": option.price.min,
      "highPrice": option.price.max,
      "priceCurrency": option.price.currency || "USD",
      "availability": "https://schema.org/InStock",
      "priceValidUntil": new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      "seller": {
        "@type": "Organization",
        "name": businessName
      }
    }))
  };

  const formatPrice = (option: PricingOption) => {
    const { min, max, unit, currency = "USD" } = option.price;
    const symbol = currency === "USD" ? "$" : currency;

    if (max && max !== min) {
      return `${symbol}${min.toLocaleString()} - ${symbol}${max.toLocaleString()}`;
    }
    return `${symbol}${min.toLocaleString()}`;
  };

  return (
    <section className={`py-16 ${className}`}>
      <Script
        id="pricing-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingSchema) }}
      />

      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 text-text-primary">{title}</h2>
          {subtitle && (
            <p className="text-xl text-text-secondary max-w-3xl mx-auto">{subtitle}</p>
          )}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {options.map((option, index) => (
            <Card
              key={index}
              className={`
                relative overflow-hidden transition-all duration-300 hover:shadow-elegant
                ${option.popular ? 'ring-2 ring-primary shadow-lg scale-105' : ''}
              `}
            >
              {option.popular && (
                <Badge className="absolute top-4 right-4 bg-primary text-white">
                  <Star className="h-3 w-3 mr-1" />
                  Most Popular
                </Badge>
              )}

              <CardHeader className="text-center pb-4">
                <CardTitle className="text-xl font-bold text-text-primary mb-2">
                  {option.name}
                </CardTitle>
                <div className="mb-4">
                  <div className="flex items-center justify-center mb-2">
                    <DollarSign className="h-6 w-6 text-primary" />
                    <span className="text-3xl font-bold text-primary">
                      {formatPrice(option)}
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary">
                    per {option.price.unit}
                  </p>
                  {option.timeline && (
                    <p className="text-xs text-text-secondary mt-1">
                      Timeline: {option.timeline}
                    </p>
                  )}
                </div>
                <p className="text-text-secondary text-sm leading-relaxed">
                  {option.description}
                </p>
              </CardHeader>

              <CardContent>
                <ul className="space-y-3 mb-6">
                  {option.features.map((feature, featureIndex) => (
                    <li
                      key={featureIndex}
                      className="flex items-start space-x-3"
                    >
                      <CheckCircle className="h-5 w-5 text-accent-emerald flex-shrink-0 mt-0.5" />
                      <span className="text-text-secondary text-sm leading-relaxed">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`
                    w-full
                    ${option.popular
                      ? 'bg-gradient-to-r from-primary to-accent-tangerine hover:shadow-elegant'
                      : 'variant-outline border-primary text-primary hover:bg-primary/10'
                    }
                  `}
                  size="lg"
                >
                  Get Free Estimate
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-text-secondary text-sm">
            * Prices are estimates and may vary based on project complexity, materials, and specific requirements.
            Contact us for a detailed quote tailored to your project.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PricingTable;
