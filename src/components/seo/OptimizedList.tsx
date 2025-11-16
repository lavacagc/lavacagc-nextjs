'use client'

import React from 'react';
import Script from 'next/script';
import { CheckCircle, Star, ArrowRight, Zap } from 'lucide-react';

interface ListItem {
  text: string;
  description?: string;
  highlight?: boolean;
}

interface OptimizedListProps {
  items: ListItem[];
  title?: string;
  type?: 'bullet' | 'numbered' | 'checkmarks' | 'stars';
  variant?: 'simple' | 'detailed' | 'featured';
  className?: string;
  schemaType?: 'HowTo' | 'ItemList' | 'none';
}

const OptimizedList: React.FC<OptimizedListProps> = ({
  items,
  title,
  type = 'bullet',
  variant = 'simple',
  className = "",
  schemaType = 'ItemList'
}) => {
  const getIcon = (index: number) => {
    switch (type) {
      case 'checkmarks':
        return <CheckCircle className="h-5 w-5 text-accent-emerald flex-shrink-0" />;
      case 'stars':
        return <Star className="h-5 w-5 text-accent-tangerine flex-shrink-0" />;
      case 'numbered':
        return (
          <div className="h-6 w-6 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
            {index + 1}
          </div>
        );
      default:
        return <ArrowRight className="h-4 w-4 text-primary flex-shrink-0 mt-1" />;
    }
  };

  // Generate structured data based on schema type
  const generateSchema = () => {
    if (schemaType === 'none') return null;

    if (schemaType === 'HowTo') {
      return {
        "@context": "https://schema.org",
        "@type": "HowTo",
        "name": title,
        "step": items.map((item, index) => ({
          "@type": "HowToStep",
          "position": index + 1,
          "name": item.text,
          "text": item.description || item.text
        }))
      };
    }

    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": title,
      "numberOfItems": items.length,
      "itemListElement": items.map((item, index) => ({
        "@type": "ListItem",
        "position": index + 1,
        "name": item.text,
        "description": item.description
      }))
    };
  };

  const schema = generateSchema();

  return (
    <div className={className}>
      {schema && (
        <Script
          id={`list-schema-${title?.replace(/\s+/g, '-').toLowerCase() || 'default'}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      )}

      {title && (
        <h3 className="text-2xl font-bold mb-6 text-text-primary">{title}</h3>
      )}

      <ul className="space-y-4" role="list">
        {items.map((item, index) => (
          <li
            key={index}
            className={`
              flex items-start space-x-3 p-3 rounded-lg transition-colors
              ${item.highlight ? 'bg-primary/5 border border-primary/20' : ''}
              ${variant === 'detailed' ? 'bg-background-subtle border border-border' : ''}
              ${variant === 'featured' ? 'hover:bg-muted/30' : ''}
            `}
          >
            {getIcon(index)}
            <div className="flex-1 min-w-0">
              <div className={`
                font-medium text-text-primary
                ${item.highlight ? 'text-primary font-semibold' : ''}
                ${variant === 'simple' ? 'text-base' : 'text-lg'}
              `}>
                {item.text}
                {item.highlight && (
                  <Zap className="inline-block h-4 w-4 ml-1 text-accent-tangerine" />
                )}
              </div>
              {item.description && variant !== 'simple' && (
                <p className="text-text-secondary mt-1 text-sm leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default OptimizedList;
