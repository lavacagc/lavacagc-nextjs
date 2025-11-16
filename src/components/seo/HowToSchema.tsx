'use client'

import React from 'react';
import Script from 'next/script';
import { Clock, DollarSign, Wrench, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface HowToStep {
  name: string;
  text: string;
  image?: string;
  url?: string;
  tool?: string;
  supply?: string;
  estimatedCost?: {
    currency: string;
    value: number;
  };
}

interface HowToSchemaProps {
  name: string;
  description: string;
  steps: HowToStep[];
  totalTime?: string;
  estimatedCost?: {
    currency: string;
    value: number;
  };
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Professional';
  tools?: string[];
  materials?: string[];
  showVisual?: boolean;
  className?: string;
}

const HowToSchema: React.FC<HowToSchemaProps> = ({
  name,
  description,
  steps,
  totalTime,
  estimatedCost,
  difficulty,
  tools = [],
  materials = [],
  showVisual = true,
  className = ""
}) => {
  // Generate HowTo structured data
  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": name,
    "description": description,
    ...(totalTime && { "totalTime": totalTime }),
    ...(estimatedCost && {
      "estimatedCost": {
        "@type": "MonetaryAmount",
        "currency": estimatedCost.currency,
        "value": estimatedCost.value
      }
    }),
    "step": steps.map((step, index) => ({
      "@type": "HowToStep",
      "position": index + 1,
      "name": step.name,
      "text": step.text,
      ...(step.image && { "image": step.image }),
      ...(step.url && { "url": step.url }),
      ...(step.tool && {
        "tool": {
          "@type": "HowToTool",
          "name": step.tool
        }
      }),
      ...(step.supply && {
        "supply": {
          "@type": "HowToSupply",
          "name": step.supply
        }
      }),
      ...(step.estimatedCost && {
        "estimatedCost": {
          "@type": "MonetaryAmount",
          "currency": step.estimatedCost.currency,
          "value": step.estimatedCost.value
        }
      })
    })),
    ...(tools.length > 0 && {
      "tool": tools.map(tool => ({
        "@type": "HowToTool",
        "name": tool
      }))
    }),
    ...(materials.length > 0 && {
      "supply": materials.map(material => ({
        "@type": "HowToSupply",
        "name": material
      }))
    })
  };

  const getDifficultyColor = (level?: string) => {
    switch (level) {
      case 'Beginner':
        return 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20';
      case 'Intermediate':
        return 'bg-accent-tangerine/10 text-accent-tangerine border-accent-tangerine/20';
      case 'Advanced':
        return 'bg-accent-sunset/10 text-accent-sunset border-accent-sunset/20';
      case 'Professional':
        return 'bg-primary/10 text-primary border-primary/20';
      default:
        return 'bg-muted/10 text-text-secondary border-border';
    }
  };

  return (
    <section className={className}>
      <Script
        id="howto-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />

      {showVisual && (
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4 text-text-primary speakable-content">
                {name}
              </h2>
              <p className="text-xl text-text-secondary mb-6 leading-relaxed speakable-content">
                {description}
              </p>

              <div className="flex flex-wrap justify-center gap-4 mb-8">
                {totalTime && (
                  <Badge variant="secondary" className="flex items-center space-x-2">
                    <Clock className="h-4 w-4" />
                    <span>{totalTime}</span>
                  </Badge>
                )}
                {estimatedCost && (
                  <Badge variant="secondary" className="flex items-center space-x-2">
                    <DollarSign className="h-4 w-4" />
                    <span>{estimatedCost.currency} {estimatedCost.value.toLocaleString()}</span>
                  </Badge>
                )}
                {difficulty && (
                  <Badge className={getDifficultyColor(difficulty)}>
                    {difficulty}
                  </Badge>
                )}
              </div>
            </div>

            {/* Tools and Materials */}
            {(tools.length > 0 || materials.length > 0) && (
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                {tools.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center text-lg">
                        <Wrench className="h-5 w-5 mr-2 text-primary" />
                        Tools Required
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {tools.map((tool, index) => (
                          <li key={index} className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-accent-emerald" />
                            <span className="text-text-secondary">{tool}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {materials.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center text-lg">
                        <CheckCircle className="h-5 w-5 mr-2 text-primary" />
                        Materials Needed
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {materials.map((material, index) => (
                          <li key={index} className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-accent-emerald" />
                            <span className="text-text-secondary">{material}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Steps */}
            <div className="space-y-6">
              {steps.map((step, index) => (
                <Card key={index} className="overflow-hidden">
                  <CardContent className="p-6">
                    <div className="flex items-start space-x-4">
                      <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center font-bold flex-shrink-0">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold mb-2 text-text-primary speakable-content">
                          {step.name}
                        </h3>
                        <p className="text-text-secondary leading-relaxed mb-4 speakable-content">
                          {step.text}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {step.tool && (
                            <Badge variant="outline" className="text-xs">
                              Tool: {step.tool}
                            </Badge>
                          )}
                          {step.supply && (
                            <Badge variant="outline" className="text-xs">
                              Supply: {step.supply}
                            </Badge>
                          )}
                          {step.estimatedCost && (
                            <Badge variant="outline" className="text-xs">
                              Cost: {step.estimatedCost.currency} {step.estimatedCost.value}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default HowToSchema;
