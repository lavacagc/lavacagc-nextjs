// CMS Page types

export interface HeroSection {
  type: 'hero';
  heading: string;
  subheading: string;
  ctaText: string;
  ctaLink: string;
  backgroundImage: string;
}

export interface BeforeAfterItem {
  beforeImage: string;
  afterImage: string;
  caption: string;
}

export interface BeforeAfterSection {
  type: 'before-after';
  heading: string;
  items: BeforeAfterItem[];
}

export interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

export interface FeaturesSection {
  type: 'features';
  heading: string;
  items: FeatureItem[];
}

export interface TestimonialItem {
  quote: string;
  author: string;
  rating: number;
}

export interface TestimonialsSection {
  type: 'testimonials';
  heading: string;
  items: TestimonialItem[];
}

export interface TextSection {
  type: 'text';
  heading: string;
  content: string;
}

export interface CTASection {
  type: 'cta';
  heading: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  phone: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}

export interface FAQSection {
  type: 'faq';
  heading: string;
  items: FAQItem[];
}

export interface GalleryImage {
  src: string;
  alt: string;
  caption: string;
}

export interface GallerySection {
  type: 'gallery';
  heading: string;
  images: GalleryImage[];
}

export type CMSSection =
  | HeroSection
  | BeforeAfterSection
  | FeaturesSection
  | TestimonialsSection
  | TextSection
  | CTASection
  | FAQSection
  | GallerySection;

export type CMSSectionType = CMSSection['type'];

export interface CMSPage {
  id: string;
  slug: string;
  title: string;
  meta_description: string | null;
  status: 'draft' | 'published';
  page_type: 'landing' | 'resource' | 'campaign';
  sections: CMSSection[];
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export const SECTION_TYPE_LABELS: Record<CMSSectionType, string> = {
  'hero': 'Hero Banner',
  'before-after': 'Before & After',
  'features': 'Features Grid',
  'testimonials': 'Testimonials',
  'text': 'Text Content',
  'cta': 'Call to Action',
  'faq': 'FAQ',
  'gallery': 'Image Gallery',
};

export function createDefaultSection(type: CMSSectionType): CMSSection {
  switch (type) {
    case 'hero':
      return { type: 'hero', heading: '', subheading: '', ctaText: 'Get Free Estimate', ctaLink: '/contact', backgroundImage: '' };
    case 'before-after':
      return { type: 'before-after', heading: '', items: [{ beforeImage: '', afterImage: '', caption: '' }] };
    case 'features':
      return { type: 'features', heading: '', items: [{ icon: 'Shield', title: '', description: '' }] };
    case 'testimonials':
      return { type: 'testimonials', heading: '', items: [{ quote: '', author: '', rating: 5 }] };
    case 'text':
      return { type: 'text', heading: '', content: '' };
    case 'cta':
      return { type: 'cta', heading: '', description: '', ctaText: 'Contact Us', ctaLink: '/contact', phone: '(201) 212-4917' };
    case 'faq':
      return { type: 'faq', heading: '', items: [{ question: '', answer: '' }] };
    case 'gallery':
      return { type: 'gallery', heading: '', images: [{ src: '', alt: '', caption: '' }] };
  }
}
