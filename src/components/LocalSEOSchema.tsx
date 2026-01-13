// Server-side Local SEO Schema component
// Outputs location-specific JSON-LD schema for search engines

import { LocationData } from '@/data/locationData';
import { generateLocationSchema, BUSINESS_INFO } from './StructuredData';

interface LocalSEOSchemaProps {
  location: LocationData;
  service?: string;
}

/**
 * Server component that renders location-specific structured data
 * Used on /locations/[city] and /locations/[city]/services/[service] pages
 */
const LocalSEOSchema: React.FC<LocalSEOSchemaProps> = ({ location, service }) => {
  if (!location) {
    return null;
  }

  // Generate location-specific schema
  const locationSchema = generateLocationSchema(location, service);

  // Generate breadcrumb schema for the location page
  const breadcrumbItems = [
    { name: 'Home', url: BUSINESS_INFO.url },
    { name: 'Locations', url: `${BUSINESS_INFO.url}/locations` },
    { name: location.name, url: `${BUSINESS_INFO.url}/locations/${location.slug}` },
  ];

  if (service) {
    const serviceName = service
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    breadcrumbItems.push({
      name: serviceName,
      url: `${BUSINESS_INFO.url}/locations/${location.slug}/services/${service}`,
    });
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  // Generate service area schema
  const serviceAreaSchema = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service
      ? `${service
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')} in ${location.name}, NJ`
      : `Home Remodeling in ${location.name}, NJ`,
    provider: {
      '@type': 'GeneralContractor',
      '@id': `${BUSINESS_INFO.url}/#organization`,
      name: BUSINESS_INFO.name,
    },
    areaServed: {
      '@type': 'City',
      name: location.name,
      containedInPlace: {
        '@type': 'AdministrativeArea',
        name: location.county,
      },
    },
    serviceType: service
      ? service
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      : 'Home Remodeling',
    description: `Professional ${
      service
        ? service
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
            .toLowerCase()
        : 'home remodeling'
    } services in ${location.name}, ${location.county}. Serving ${location.neighborhoods
      .slice(0, 2)
      .join(', ')} and surrounding areas.`,
  };

  return (
    <>
      {/* Location-specific LocalBusiness schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(locationSchema) }}
      />
      {/* Breadcrumb schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {/* Service Area schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceAreaSchema) }}
      />
    </>
  );
};

export default LocalSEOSchema;
