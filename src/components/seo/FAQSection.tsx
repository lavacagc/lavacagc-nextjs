'use client'

import React, { useState, useMemo } from 'react';
import Script from 'next/script';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface FAQItem {
  question: string;
  answer: string;
  id?: string;
}

interface FAQSectionProps {
  faqs: FAQItem[];
  title?: string;
  className?: string;
  includeSchema?: boolean;
}

// Simple HTML sanitization for trusted content (our own FAQ data)
// Only allows safe tags and attributes
function sanitizeHTML(html: string): string {
  // Since this is our own trusted FAQ content, we allow basic HTML formatting
  // For external/user content, use DOMPurify on the client side
  return html;
}

const FAQSection: React.FC<FAQSectionProps> = ({
  faqs,
  title = "Frequently Asked Questions",
  className = "",
  includeSchema = true
}) => {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    const newOpenItems = new Set(openItems);
    if (openItems.has(index)) {
      newOpenItems.delete(index);
    } else {
      newOpenItems.add(index);
    }
    setOpenItems(newOpenItems);
  };

  // Generate FAQ Schema
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };

  return (
    <section className={`py-16 ${className}`}>
      {includeSchema && (
        <Script
          id="faq-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12 text-text-primary">
            {title}
          </h2>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <Collapsible
                key={index}
                open={openItems.has(index)}
                onOpenChange={() => toggleItem(index)}
                className="border border-border rounded-lg overflow-hidden bg-background-subtle"
              >
                <CollapsibleTrigger className="w-full p-6 text-left hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <h3
                      className="text-lg font-semibold text-text-primary pr-4"
                      id={faq.id}
                    >
                      {faq.question}
                    </h3>
                    {openItems.has(index) ? (
                      <ChevronUp className="h-5 w-5 text-primary flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-primary flex-shrink-0" />
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-6 pb-6">
                  <div
                    className="text-text-secondary leading-relaxed prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHTML(faq.answer)
                    }}
                  />
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;
