/**
 * @deprecated This client-side component has been replaced by server-side StructuredData.tsx
 *
 * IMPORTANT: This component uses 'use client' and injects JSON-LD via useEffect,
 * which means search engine crawlers CANNOT see the structured data during SSR.
 *
 * USE INSTEAD:
 * - For sitewide schema: StructuredData component in layout.tsx
 * - For location pages: LocalSEOSchema component
 * - For service pages: generateServiceSchema() from StructuredData.tsx
 *
 * This file is kept for backward compatibility but returns null.
 * All pages should be migrated to use the new server-side components.
 */
'use client'

interface SEOSchemaProps {
  title?: string;
  description?: string;
  type?: string;
}

/**
 * @deprecated Use StructuredData.tsx (server-side) instead
 * This component is kept for backward compatibility only
 */
const SEOSchema = ({ title, description, type }: SEOSchemaProps = {}) => {
  // DEPRECATED: Return null - schema is now rendered server-side via StructuredData.tsx in layout.tsx
  // See src/components/StructuredData.tsx for the new implementation
  return null;
};

export default SEOSchema;
