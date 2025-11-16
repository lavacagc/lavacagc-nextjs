'use client'

import React, { useEffect } from 'react';

interface SEOSchemaProps {
  title?: string;
  description?: string;
  type?: string;
}

const SEOSchema = ({ title, description, type }: SEOSchemaProps = {}) => {
  useEffect(() => {
    const localBusinessSchema = {
      "@context": "https://schema.org",
      "@type": type || "GeneralContractor",
      "name": "La Vaca General Contractors, LLC",
      "alternateName": "La Vaca General Contractors",
      "description": description || "Premium home remodeling contractor specializing in luxury kitchen, bathroom, basement & whole home renovations in Northern New Jersey",
      "url": window.location.origin,
      "logo": `${window.location.origin}/src/assets/logo.png`,
      "image": `${window.location.origin}/src/assets/logo.png`,
      "telephone": "(201) 212-4917",
      "email": "alex@lavacagc.com",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "West Orange",
        "addressRegion": "NJ",
        "addressCountry": "US"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": 40.9176,
        "longitude": -74.1718
      },
      "areaServed": [
        {
          "@type": "City",
          "name": "Alpine",
          "containedInPlace": {
            "@type": "State",
            "name": "New Jersey"
          }
        },
        {
          "@type": "City", 
          "name": "Short Hills",
          "containedInPlace": {
            "@type": "State",
            "name": "New Jersey"
          }
        },
        {
          "@type": "City",
          "name": "Saddle River", 
          "containedInPlace": {
            "@type": "State",
            "name": "New Jersey"
          }
        },
        {
          "@type": "City",
          "name": "Essex Fells",
          "containedInPlace": {
            "@type": "State", 
            "name": "New Jersey"
          }
        }
      ],
      "hasCredential": [
        {
          "@type": "EducationalOccupationalCredential",
          "credentialCategory": "License",
          "recognizedBy": {
            "@type": "Organization",
            "name": "State of New Jersey"
          }
        }
      ],
      "serviceType": [
        "Kitchen Remodeling",
        "Bathroom Renovation", 
        "Basement Finishing",
        "Whole Home Remodeling",
        "Custom Home Additions"
      ],
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "5.0",
        "ratingCount": "50",
        "bestRating": "5",
        "worstRating": "1"
      },
      "openingHours": "Mo-Fr 07:00-18:00, Sa 08:00-16:00",
      "paymentAccepted": ["Cash", "Check", "Credit Card", "Financing Available"],
      "priceRange": "$$$"
    };

    const serviceSchema = {
      "@context": "https://schema.org",
      "@type": "Service",
      "name": "Home Remodeling Services",
      "provider": {
        "@type": "GeneralContractor",
        "name": "La Vaca General Contractors, LLC"
      },
      "serviceType": "Home Remodeling",
      "description": "Professional home remodeling services including kitchen renovation, bathroom remodeling, basement finishing, and whole home renovations in Northern New Jersey",
      "areaServed": {
        "@type": "State",
        "name": "New Jersey"
      },
      "hasOfferCatalog": {
        "@type": "OfferCatalog",
        "name": "Home Remodeling Services",
        "itemListElement": [
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service",
              "name": "Kitchen Remodeling",
              "description": "Luxury kitchen renovations with custom cabinetry and premium finishes"
            }
          },
          {
            "@type": "Offer", 
            "itemOffered": {
              "@type": "Service",
              "name": "Bathroom Renovation",
              "description": "Spa-like bathroom transformations with modern fixtures and elegant design"
            }
          },
          {
            "@type": "Offer",
            "itemOffered": {
              "@type": "Service", 
              "name": "Basement Finishing",
              "description": "Complete basement renovations creating functional living and entertainment spaces"
            }
          }
        ]
      }
    };

    // Add schemas to document head
    const localBusinessScript = document.createElement('script');
    localBusinessScript.type = 'application/ld+json';
    localBusinessScript.textContent = JSON.stringify(localBusinessSchema);
    document.head.appendChild(localBusinessScript);

    const serviceScript = document.createElement('script');
    serviceScript.type = 'application/ld+json';  
    serviceScript.textContent = JSON.stringify(serviceSchema);
    document.head.appendChild(serviceScript);

    // Cleanup function
    return () => {
      document.head.removeChild(localBusinessScript);
      document.head.removeChild(serviceScript);
    };
  }, [title, description, type]);

  return null;
};

export default SEOSchema;