'use client'

import React, { useEffect } from 'react';
import Script from 'next/script';

interface SpeakableContent {
  selector?: string;
  text?: string;
}

interface SpeakableSchemaProps {
  speakableContent: SpeakableContent[];
  pageType?: 'Article' | 'WebPage' | 'FAQPage' | 'HowTo';
  title?: string;
  description?: string;
}

const SpeakableSchema: React.FC<SpeakableSchemaProps> = ({
  speakableContent,
  pageType = 'WebPage',
  title,
  description
}) => {
  const speakableSchema = {
    "@context": "https://schema.org",
    "@type": pageType,
    ...(title && { "name": title }),
    ...(description && { "description": description }),
    "speakable": {
      "@type": "SpeakableSpecification",
      "xpath": speakableContent
        .filter(content => content.selector)
        .map(content => content.selector),
      ...(speakableContent.some(content => content.text) && {
        "content": speakableContent
          .filter(content => content.text)
          .map(content => content.text)
      })
    }
  };

  return (
    <Script
      id="speakable-schema"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(speakableSchema) }}
    />
  );
};

// Higher-order component to automatically add speakable markup
export const withSpeakableContent = <P extends object>(
  Component: React.ComponentType<P>
) => {
  return function WrappedComponent(props: P) {
    useEffect(() => {
      if (typeof document === 'undefined') return;

      // Add speakable class to key elements
      const speakableSelectors = [
        'h1',
        'h2',
        '[data-speakable="true"]',
        '.speakable-content',
        'p:first-of-type'
      ];

      speakableSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          if (!element.getAttribute('data-speakable-processed')) {
            element.setAttribute('data-speakable', 'true');
            element.setAttribute('data-speakable-processed', 'true');
          }
        });
      });
    }, []);

    return (
      <>
        <SpeakableSchema
          speakableContent={[
            { selector: "/html/body//h1" },
            { selector: "/html/body//h2" },
            { selector: "/html/body//*[@data-speakable='true']" },
            { selector: "/html/body//.speakable-content" }
          ]}
          pageType="WebPage"
        />
        <Component {...props} />
      </>
    );
  };
};

export default SpeakableSchema;
