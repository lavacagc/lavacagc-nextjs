// Server-side structured data component for SEO
// This replaces the client-side SEOSchema.tsx which Google cannot crawl

import { LocationData } from '@/data/locationData';

interface StructuredDataProps {
  type?: 'organization' | 'localBusiness' | 'service' | 'location';
  location?: LocationData;
  service?: {
    name: string;
    description: string;
    slug: string;
  };
}

// Base business information - single source of truth for NAP
export const BUSINESS_INFO = {
  name: 'La Vaca General Contractors, LLC',
  alternateName: 'La Vaca General Contractors',
  description: 'Premium home remodeling contractor specializing in luxury kitchen, bathroom, basement & whole home renovations in Northern New Jersey',
  url: 'https://www.lavacagc.com',
  logo: 'https://www.lavacagc.com/logo.png',
  telephone: '(201) 212-4917',
  telephoneE164: '+12012124917',
  email: 'info@lavacagc.com',
  address: {
    streetAddress: '',
    addressLocality: 'West Orange',
    addressRegion: 'NJ',
    postalCode: '07052',
    addressCountry: 'US',
  },
  geo: {
    latitude: 40.798611,
    longitude: -74.239167,
  },
  license: 'HIC# 13VH13373800',
  priceRange: '$$$',
  foundingDate: '2024',
  serviceAreas: [
    { name: 'Essex County', state: 'NJ' },
    { name: 'Bergen County', state: 'NJ' },
    { name: 'Morris County', state: 'NJ' },
    { name: 'Union County', state: 'NJ' },
  ],
  services: [
    'Kitchen Remodeling',
    'Bathroom Renovation',
    'Basement Finishing',
    'Home Additions',
    'Whole Home Remodeling',
  ],
  socialProfiles: [
    'https://www.facebook.com/p/La-Vaca-General-Contractor-61563600601660/',
    'https://www.instagram.com/lavacagc/',
  ],
  aggregateRating: {
    ratingValue: '5.0',
    reviewCount: '12',
    bestRating: '5',
    worstRating: '1',
  },
  openingHours: [
    { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '18:00' },
    { days: ['Saturday'], opens: '09:00', closes: '14:00' },
  ],
} as const;

// Generate LocalBusiness schema (for sitewide use)
export function generateLocalBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'GeneralContractor',
    '@id': `${BUSINESS_INFO.url}/#organization`,
    name: BUSINESS_INFO.name,
    alternateName: BUSINESS_INFO.alternateName,
    description: BUSINESS_INFO.description,
    url: BUSINESS_INFO.url,
    logo: {
      '@type': 'ImageObject',
      url: BUSINESS_INFO.logo,
      width: 800,
      height: 800,
    },
    image: BUSINESS_INFO.logo,
    telephone: BUSINESS_INFO.telephone,
    email: BUSINESS_INFO.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: BUSINESS_INFO.address.addressLocality,
      addressRegion: BUSINESS_INFO.address.addressRegion,
      postalCode: BUSINESS_INFO.address.postalCode,
      addressCountry: BUSINESS_INFO.address.addressCountry,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: BUSINESS_INFO.geo.latitude,
      longitude: BUSINESS_INFO.geo.longitude,
    },
    areaServed: BUSINESS_INFO.serviceAreas.map((area) => ({
      '@type': 'AdministrativeArea',
      name: `${area.name}, ${area.state}`,
    })),
    hasCredential: {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'NJ Home Improvement Contractor License',
      name: BUSINESS_INFO.license,
      recognizedBy: {
        '@type': 'Organization',
        name: 'State of New Jersey',
      },
    },
    serviceType: BUSINESS_INFO.services,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: BUSINESS_INFO.aggregateRating.ratingValue,
      reviewCount: BUSINESS_INFO.aggregateRating.reviewCount,
      bestRating: BUSINESS_INFO.aggregateRating.bestRating,
      worstRating: BUSINESS_INFO.aggregateRating.worstRating,
    },
    openingHoursSpecification: BUSINESS_INFO.openingHours.map((schedule) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: schedule.days,
      opens: schedule.opens,
      closes: schedule.closes,
    })),
    priceRange: BUSINESS_INFO.priceRange,
    paymentAccepted: ['Cash', 'Check', 'Credit Card', 'Financing Available'],
    sameAs: BUSINESS_INFO.socialProfiles,
    foundingDate: BUSINESS_INFO.foundingDate,
    knowsAbout: [
      'Kitchen Remodeling',
      'Bathroom Renovation',
      'Basement Finishing',
      'Home Additions',
      'General Contracting',
      'Home Improvement',
      'Residential Construction',
    ],
  };
}

// Generate Service schema for service pages
export function generateServiceSchema(service: { name: string; description: string; slug: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    provider: {
      '@type': 'GeneralContractor',
      '@id': `${BUSINESS_INFO.url}/#organization`,
      name: BUSINESS_INFO.name,
      url: BUSINESS_INFO.url,
      telephone: BUSINESS_INFO.telephone,
    },
    areaServed: {
      '@type': 'State',
      name: 'New Jersey',
    },
    serviceType: service.name,
    url: `${BUSINESS_INFO.url}/services/${service.slug}`,
  };
}

// Generate Location-specific LocalBusiness schema
export function generateLocationSchema(location: LocationData, service?: string) {
  const serviceName = service
    ? service
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : null;

  const pageUrl = service
    ? `${BUSINESS_INFO.url}/locations/${location.slug}/services/${service}`
    : `${BUSINESS_INFO.url}/locations/${location.slug}`;

  const description = serviceName
    ? `Professional ${serviceName.toLowerCase()} services in ${location.name}, ${location.county}. Licensed, insured, 5-star rated contractor serving ${location.neighborhoods.slice(0, 2).join(', ')} and surrounding areas.`
    : `Premier home remodeling contractor in ${location.name}, ${location.county}. Serving ${location.neighborhoods.slice(0, 2).join(', ')}, ${location.zipCodes[0]} and surrounding areas. Licensed, insured, 5-star rated.`;

  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${pageUrl}#localbusiness`,
    name: serviceName
      ? `${serviceName} in ${location.name} | ${BUSINESS_INFO.name}`
      : `${BUSINESS_INFO.name} - ${location.name}`,
    description,
    url: pageUrl,
    telephone: BUSINESS_INFO.telephone,
    email: BUSINESS_INFO.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: location.name,
      addressRegion: 'NJ',
      postalCode: location.zipCodes[0],
      addressCountry: 'US',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: location.coordinates.lat,
      longitude: location.coordinates.lng,
    },
    areaServed: [
      {
        '@type': 'City',
        name: location.name,
        containedInPlace: {
          '@type': 'AdministrativeArea',
          name: location.county,
        },
      },
      ...location.nearbyAreas.map((area) => ({
        '@type': 'City',
        name: area,
        containedInPlace: {
          '@type': 'State',
          name: 'New Jersey',
        },
      })),
    ],
    // aggregateRating intentionally NOT emitted here — the location entity
    // (@id ends in #localbusiness) is distinct from the org entity (@id
    // #organization, defined in generateLocalBusinessSchema above), but
    // emitting the same rating on both creates a duplicate AggregateRating
    // per page that Google's rich-results parser flags. The org-level rating
    // is the canonical source for the brand.
    priceRange: BUSINESS_INFO.priceRange,
    hasCredential: {
      '@type': 'EducationalOccupationalCredential',
      credentialCategory: 'NJ Home Improvement Contractor License',
      name: BUSINESS_INFO.license,
    },
    ...(serviceName && {
      makesOffer: {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: serviceName,
          description: `Professional ${serviceName.toLowerCase()} services in ${location.name}, NJ`,
        },
      },
    }),
  };
}

// Generate Breadcrumb schema
export function generateBreadcrumbSchema(
  items: { name: string; url: string }[]
): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// Server Component that renders JSON-LD script tags
export default function StructuredData({ type = 'organization', location, service }: StructuredDataProps) {
  let schema: object;

  switch (type) {
    case 'localBusiness':
    case 'organization':
      schema = generateLocalBusinessSchema();
      break;
    case 'service':
      if (!service) {
        schema = generateLocalBusinessSchema();
      } else {
        schema = generateServiceSchema(service);
      }
      break;
    case 'location':
      if (!location) {
        schema = generateLocalBusinessSchema();
      } else {
        schema = generateLocationSchema(location, service?.slug);
      }
      break;
    default:
      schema = generateLocalBusinessSchema();
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// Export individual schema generators for use in page-level metadata
export { generateLocalBusinessSchema as localBusinessSchema };
