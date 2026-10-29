/**
 * FAQPage structured data for a blog post (ART10, SEO2).
 *
 * Pure and client-safe. A post with no usable FAQ gets null, so the page emits
 * no FAQPage at all rather than an empty one.
 */
import { readFaq } from './schemas';

export function faqPageJsonLd(faq: unknown, pageUrl: string): Record<string, unknown> | null {
  const items = readFaq(faq);
  if (items.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export { jsonLdScript } from '../jsonLd';
