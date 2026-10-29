/**
 * Where experiments can run: every (page, element) some page component reads
 * through withExperiment (or, for the homepage buttons, the hero CTA), and the
 * payload slots it applies. The create route refuses anything not listed, so
 * the agent cannot start an experiment nobody renders (it would count no
 * views and never conclude).
 *
 * Adding a surface is a code change: wire withExperiment into the page, then
 * list it here with the slots it reads.
 */
import type { PayloadSlot } from './types';

export interface Surface {
  page: string;
  element: string;
  slots: readonly PayloadSlot[];
  /** Copy must come in English and Spanish (every surface on a bilingual page). */
  bilingual: boolean;
  /** For an `order` slot: the section ids, every one of which the order must name exactly once. */
  sections?: readonly string[];
  note: string;
}

/** The /home-services sections, in their default order. */
export const HOME_SERVICES_SECTIONS = ['services', 'how-it-works', 'trust', 'faq', 'home-care', 'closer'] as const;
export type HomeServicesSection = (typeof HOME_SERVICES_SECTIONS)[number];

export const SURFACES: readonly Surface[] = [
  {
    page: '/home-services',
    element: 'hero',
    slots: ['eyebrow', 'title', 'body', 'cta', 'image', 'imageAlt'],
    bilingual: true,
    note: 'The landing hero: eyebrow, H1 title, intro body, the main button label, and an optional image under /public.',
  },
  {
    page: '/home-services',
    element: 'services-heading',
    slots: ['heading', 'intro'],
    bilingual: true,
    note: 'The heading and intro above the service cards.',
  },
  {
    page: '/home-services',
    element: 'sections',
    slots: ['order'],
    bilingual: false,
    sections: HOME_SERVICES_SECTIONS,
    note: 'The order of the sections below the hero.',
  },
  {
    page: '/',
    element: 'hero-primary',
    slots: ['wording', 'subtext', 'color'],
    bilingual: false,
    note: 'The homepage primary button (Phase 1 CTA test). English only; edited in the Experiments tab.',
  },
  {
    page: '/',
    element: 'hero-secondary',
    slots: ['wording', 'subtext', 'color'],
    bilingual: false,
    note: 'The homepage secondary button (Phase 1 CTA test). English only; edited in the Experiments tab.',
  },
];

export function findSurface(page: string, element: string): Surface | undefined {
  return SURFACES.find((s) => s.page === page && s.element === element);
}
