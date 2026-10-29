/**
 * The fixed shape of the home services: the seven slugs, the trade each one
 * routes to, the three tap questions the request flow asks for each, the
 * counties, the timing options and the language helpers.
 *
 * Prices and every customer-facing word about a service (name, description,
 * included, raises, SEO copy, FAQ) are NOT here. They live in the
 * `home_services` table, edited in the admin under Services & Prices
 * (docs/phase-2/acceptance-criteria.md, CAT; decision 004 Q7), and are read on
 * the server through `getCatalog()` in catalogData.ts. Client components get
 * them as props from the page, so the copy never ships in a JavaScript bundle.
 * The day-one rows are `HOME_SERVICES_SEED` in catalogSeed.ts, which seeded the
 * table; prices are never an A/B variable (decision 005).
 *
 * The slug set is fixed in code on purpose: the admin edits content, not the
 * set, so request validation, sitemap paths and bid routing stay code-checked.
 *
 * Import-light on purpose: no React, no Supabase, so server routes, the sub
 * offer email and client components can all import it.
 */

export type Lang = 'en' | 'es';
export type L = Record<Lang, string>;

/** A trade = who gets the bid request. One service maps to one trade. */
export type Trade =
  | 'cabinet_painting'
  | 'hvac'
  | 'duct_cleaning'
  | 'home_cleaning'
  | 'exterior_painting'
  | 'gutter_cleaning'
  | 'drywall';

export const TRADE_LABEL: Record<Trade, L> = {
  cabinet_painting: { en: 'Cabinet painting', es: 'Pintura de gabinetes' },
  hvac: { en: 'HVAC service', es: 'Servicio de HVAC' },
  duct_cleaning: { en: 'Duct cleaning', es: 'Limpieza de ductos' },
  home_cleaning: { en: 'Home cleaning', es: 'Limpieza de casa' },
  exterior_painting: { en: 'Exterior painting', es: 'Pintura exterior' },
  gutter_cleaning: { en: 'Gutter cleaning', es: 'Limpieza de canaletas' },
  drywall: { en: 'Drywall', es: 'Reparación de drywall' },
};

/** The counties the home services serve; Union since decision 006 Q21 (2026-10-29). */
export const COUNTIES = ['Essex', 'Morris', 'Bergen', 'Union'] as const;
export type County = (typeof COUNTIES)[number];

/** The seven services, in the order the landing page lists them. */
export const SERVICE_SLUGS = [
  'cabinet-repainting',
  'hvac-cleaning',
  'duct-and-vent-cleaning',
  'home-cleaning',
  'exterior-painting',
  'gutter-cleaning',
  'drywall-patching',
] as const;
export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

/** Who gets the bid request for each service (one service = one trade). */
export const SERVICE_TRADE: Record<ServiceSlug, Trade> = {
  'cabinet-repainting': 'cabinet_painting',
  'hvac-cleaning': 'hvac',
  'duct-and-vent-cleaning': 'duct_cleaning',
  'home-cleaning': 'home_cleaning',
  'exterior-painting': 'exterior_painting',
  'gutter-cleaning': 'gutter_cleaning',
  'drywall-patching': 'drywall',
};

export const SERVICE_ICONS = ['paint-roller', 'fan', 'wind', 'sparkles', 'house', 'cloud-rain', 'hammer'] as const;
export type ServiceIconName = (typeof SERVICE_ICONS)[number];

export interface ServiceQuestionOption {
  value: string;
  label: L;
}

export interface ServiceQuestion {
  key: string;
  label: L;
  options: ServiceQuestionOption[];
}

export interface ServiceFaqItem {
  q: L;
  a: L;
}

/** Everything about a service that the admin edits: one `home_services` row. */
export interface HomeServiceContent {
  /** URL slug: /home-services/<slug>. Also the key stored in home_service_requests.services. */
  slug: string;
  trade: Trade;
  name: L;
  /** Lucide icon name rendered by the card (no photography exists for these yet). */
  icon: ServiceIconName;
  /** Optional photo under /public; cards render the icon panel when absent. */
  image?: string;
  /** Starting price in cents. For per-unit prices this is the unit price. */
  startingPriceCents: number;
  /** How the price is displayed, e.g. "$1,995" or "$2.95 / sq ft". */
  priceDisplay: L;
  /** What the starting price covers, one short line. */
  priceUnit: L;
  /** Optional second price line (gutters: two story). */
  priceNote?: L;
  /** Minimum job total in cents, when the service is priced per unit. */
  minimumCents?: number;
  /** Two-line card description from the build spec. */
  description: L;
  /** "What's included" sheet. */
  included: L[];
  /** "What raises the price" sheet. */
  raisesPrice: L[];
  seo: {
    title: L;
    description: L;
    keywords: string[];
  };
  faq: ServiceFaqItem[];
}

/** A service as the pages render it: the table row plus the questions from code. */
export interface HomeService extends HomeServiceContent {
  sort: number;
  active: boolean;
  /** Exactly three tap groups per service (grill decision 001 Q4). */
  questions: ServiceQuestion[];
}

const yesNo = (key: string, label: L): ServiceQuestion => ({
  key,
  label,
  options: [
    { value: 'yes', label: { en: 'Yes', es: 'Sí' } },
    { value: 'no', label: { en: 'No', es: 'No' } },
  ],
});

const stories = (): ServiceQuestion => ({
  key: 'stories',
  label: { en: 'How many stories?', es: '¿Cuántos pisos?' },
  options: [
    { value: '1', label: { en: '1', es: '1' } },
    { value: '2', label: { en: '2', es: '2' } },
    { value: '3+', label: { en: '3+', es: '3+' } },
  ],
});

/** The three tap groups the request flow asks for each service. */
export const SERVICE_QUESTIONS: Record<ServiceSlug, ServiceQuestion[]> = {
  'cabinet-repainting': [
    {
      key: 'doors',
      label: { en: 'Doors and drawers', es: 'Puertas y cajones' },
      options: [
        { value: 'up_to_25', label: { en: 'Up to 25', es: 'Hasta 25' } },
        { value: '26_40', label: { en: '26 to 40', es: '26 a 40' } },
        { value: '40_plus', label: { en: '40+', es: '40+' } },
      ],
    },
    {
      key: 'color_change',
      label: { en: 'Color', es: 'Color' },
      options: [
        { value: 'same', label: { en: 'Same color', es: 'Mismo color' } },
        { value: 'new', label: { en: 'New color', es: 'Color nuevo' } },
      ],
    },
    yesNo('island', { en: 'Island included?', es: '¿Incluye isla?' }),
  ],
  'hvac-cleaning': [
    {
      key: 'systems',
      label: { en: 'Systems', es: 'Sistemas' },
      options: [
        { value: '1', label: { en: '1', es: '1' } },
        { value: '2', label: { en: '2', es: '2' } },
        { value: '3+', label: { en: '3+', es: '3+' } },
      ],
    },
    {
      key: 'age',
      label: { en: 'System age', es: 'Edad del sistema' },
      options: [
        { value: 'under_10', label: { en: 'Under 10 years', es: 'Menos de 10 años' } },
        { value: '10_20', label: { en: '10 to 20 years', es: '10 a 20 años' } },
        { value: 'over_20', label: { en: '20+ years', es: 'Más de 20 años' } },
      ],
    },
    {
      key: 'last_service',
      label: { en: 'Last serviced', es: 'Último servicio' },
      options: [
        { value: 'under_1y', label: { en: 'Within a year', es: 'Hace menos de un año' } },
        { value: '1_3y', label: { en: '1 to 3 years ago', es: 'Hace 1 a 3 años' } },
        { value: 'longer', label: { en: 'Longer or not sure', es: 'Más tiempo o no sé' } },
      ],
    },
  ],
  'duct-and-vent-cleaning': [
    {
      key: 'sqft',
      label: { en: 'Home size', es: 'Tamaño de la casa' },
      options: [
        { value: 'under_1500', label: { en: 'Under 1,500 sq ft', es: 'Menos de 1,500 pies²' } },
        { value: '1500_3000', label: { en: '1,500 to 3,000', es: '1,500 a 3,000' } },
        { value: 'over_3000', label: { en: '3,000+', es: '3,000+' } },
      ],
    },
    {
      key: 'vents',
      label: { en: 'Vents', es: 'Rejillas' },
      options: [
        { value: 'up_to_10', label: { en: 'Up to 10', es: 'Hasta 10' } },
        { value: '11_20', label: { en: '11 to 20', es: '11 a 20' } },
        { value: 'over_20', label: { en: '20+', es: '20+' } },
      ],
    },
    yesNo('pets', { en: 'Pets in the home?', es: '¿Mascotas en casa?' }),
  ],
  'home-cleaning': [
    {
      key: 'bedrooms',
      label: { en: 'Bedrooms', es: 'Recámaras' },
      options: [
        { value: '1_2', label: { en: '1 to 2', es: '1 a 2' } },
        { value: '3', label: { en: '3', es: '3' } },
        { value: '4+', label: { en: '4+', es: '4+' } },
      ],
    },
    {
      key: 'bathrooms',
      label: { en: 'Bathrooms', es: 'Baños' },
      options: [
        { value: '1', label: { en: '1', es: '1' } },
        { value: '2', label: { en: '2', es: '2' } },
        { value: '3+', label: { en: '3+', es: '3+' } },
      ],
    },
    {
      key: 'frequency',
      label: { en: 'How often', es: 'Frecuencia' },
      options: [
        { value: 'one_time', label: { en: 'One time', es: 'Una vez' } },
        { value: 'recurring', label: { en: 'Recurring', es: 'Recurrente' } },
      ],
    },
  ],
  'exterior-painting': [
    stories(),
    {
      key: 'siding',
      label: { en: 'Siding', es: 'Revestimiento' },
      options: [
        { value: 'vinyl', label: { en: 'Vinyl or aluminum', es: 'Vinilo o aluminio' } },
        { value: 'wood', label: { en: 'Wood', es: 'Madera' } },
        { value: 'stucco', label: { en: 'Stucco or other', es: 'Estuco u otro' } },
      ],
    },
    yesNo('trim_doors', { en: 'Trim and doors included?', es: '¿Incluye molduras y puertas?' }),
  ],
  'gutter-cleaning': [
    stories(),
    yesNo('guards', { en: 'Gutter guards?', es: '¿Protectores de canaleta?' }),
    {
      key: 'last_cleaned',
      label: { en: 'Last cleaned', es: 'Última limpieza' },
      options: [
        { value: 'under_1y', label: { en: 'Within a year', es: 'Hace menos de un año' } },
        { value: '1_2y', label: { en: '1 to 2 years ago', es: 'Hace 1 a 2 años' } },
        { value: 'longer', label: { en: 'Longer or not sure', es: 'Más tiempo o no sé' } },
      ],
    },
  ],
  'drywall-patching': [
    {
      key: 'patches',
      label: { en: 'How many patches?', es: '¿Cuántos parches?' },
      options: [
        { value: '1', label: { en: '1', es: '1' } },
        { value: '2_3', label: { en: '2 to 3', es: '2 a 3' } },
        { value: '4+', label: { en: '4+', es: '4+' } },
      ],
    },
    {
      key: 'size',
      label: { en: 'Largest patch', es: 'Parche más grande' },
      options: [
        { value: 'under_6', label: { en: 'Under 6 in', es: 'Menos de 6 pulg' } },
        { value: '6_12', label: { en: '6 to 12 in', es: '6 a 12 pulg' } },
        { value: 'over_12', label: { en: 'Over 12 in', es: 'Más de 12 pulg' } },
      ],
    },
    yesNo('paint_match', { en: 'Need the paint matched?', es: '¿Necesita igualar la pintura?' }),
  ],
};

export function isServiceSlug(value: unknown): value is ServiceSlug {
  return typeof value === 'string' && (SERVICE_SLUGS as readonly string[]).includes(value);
}

/** The questions for a slug; empty for anything that is not a service. */
export function serviceQuestions(slug: string): ServiceQuestion[] {
  return isServiceSlug(slug) ? SERVICE_QUESTIONS[slug] : [];
}

/** The trade a slug routes to; undefined for anything that is not a service. */
export function serviceTrade(slug: string): Trade | undefined {
  return isServiceSlug(slug) ? SERVICE_TRADE[slug] : undefined;
}

/** Pick the string for a language, falling back to English. */
export function t(text: L | undefined, lang: Lang): string {
  if (!text) return '';
  return text[lang] || text.en;
}

/** Validate a lang query/cookie value. Anything else is English. */
export function toLang(value: unknown): Lang {
  return value === 'es' ? 'es' : 'en';
}

export const TIMING_OPTIONS: Array<{ value: 'this_week' | 'two_weeks' | 'flexible'; label: L }> = [
  { value: 'this_week', label: { en: 'This week', es: 'Esta semana' } },
  { value: 'two_weeks', label: { en: 'Next two weeks', es: 'Próximas dos semanas' } },
  { value: 'flexible', label: { en: 'Flexible', es: 'Flexible' } },
];

/** Service names by slug, as `describeAnswers` takes them (catalogData's `getServiceNames()` builds one). */
export type ServiceNames = Partial<Record<string, L>>;

/**
 * Render a request's answers as readable lines for alerts, emails and the admin.
 * Names come from the table (pass `getServiceNames()`); a slug with no name
 * prints as the slug. Unknown keys are kept verbatim so nothing a homeowner
 * tapped is dropped.
 */
export function describeAnswers(
  services: string[],
  answers: Record<string, Record<string, string>>,
  lang: Lang = 'en',
  names: ServiceNames = {},
): string[] {
  const lines: string[] = [];
  for (const slug of services) {
    const questions = serviceQuestions(slug);
    const serviceAnswers = answers[slug] ?? {};
    const parts: string[] = [];
    for (const [key, value] of Object.entries(serviceAnswers)) {
      const question = questions.find((q) => q.key === key);
      const option = question?.options.find((o) => o.value === value);
      // A label that is a question ("How many stories?") reads as "How many stories: 2".
      const label = (question ? t(question.label, lang) : key).replace(/^¿+|\?+$/g, '');
      parts.push(`${label}: ${option ? t(option.label, lang) : value}`);
    }
    const name = names[slug];
    lines.push(`${name ? t(name, lang) : slug}${parts.length ? ' - ' + parts.join(', ') : ''}`);
  }
  return lines;
}
