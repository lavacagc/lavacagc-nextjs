import { Metadata } from 'next';
import Script from 'next/script';

interface MobileSEOProps {
  title: string;
  description: string;
  mobileDescription?: string;
  canonicalUrl?: string;
  pageType?: 'website' | 'article' | 'service' | 'location';
  location?: string;
  service?: string;
}

// Generate mobile-optimized metadata for Next.js App Router
export const generateMobileSEOMetadata = ({
  title,
  description,
  mobileDescription,
  canonicalUrl,
  pageType = 'website',
}: MobileSEOProps): Metadata => {
  // Generate mobile-optimized description if not provided
  const optimizedMobileDescription = mobileDescription ||
    (description.length > 120 ?
      description.substring(0, 117) + '...' :
      description
    );

  return {
    title,
    description: optimizedMobileDescription,
    openGraph: {
      title,
      description: optimizedMobileDescription,
      type: pageType === 'article' ? 'article' : 'website',
      ...(canonicalUrl && { url: canonicalUrl }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: optimizedMobileDescription,
    },
    appleWebApp: {
      title: 'La Vaca GC',
      capable: true,
    },
    applicationName: 'La Vaca GC',
    other: {
      'HandheldFriendly': 'True',
      'MobileOptimized': '320',
    },
  };
};

// Component for local business schema (client-side rendering)
const MobileSEO: React.FC<MobileSEOProps> = ({
  canonicalUrl,
  location,
  service
}) => {
  // Add local business markup for mobile
  const localBusinessSchema = location || service ? {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": "La Vaca General Contractors",
    "telephone": "(201) 555-0123",
    "url": canonicalUrl || "https://ajsconstructionnj.com",
    ...(location && {
      "areaServed": {
        "@type": "City",
        "name": location,
        "containedInPlace": {
          "@type": "State",
          "name": "New Jersey"
        }
      }
    }),
    ...(service && {
      "serviceType": service,
      "priceRange": "$$$"
    })
  } : null;

  const breadcrumbSchema = (location || service) ? {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://ajsconstructionnj.com"
      },
      ...(service ? [{
        "@type": "ListItem",
        "position": 2,
        "name": service.charAt(0).toUpperCase() + service.slice(1),
        "item": `https://ajsconstructionnj.com/${service}`
      }] : []),
      ...(location ? [{
        "@type": "ListItem",
        "position": service ? 3 : 2,
        "name": location,
        "item": canonicalUrl || `https://ajsconstructionnj.com/locations/${location.toLowerCase().replace(/\s+/g, '-')}`
      }] : [])
    ]
  } : null;

  return (
    <>
      {localBusinessSchema && (
        <Script
          id="mobile-local-business-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        />
      )}
      {breadcrumbSchema && (
        <Script
          id="mobile-breadcrumb-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      )}
    </>
  );
};

export default MobileSEO;
