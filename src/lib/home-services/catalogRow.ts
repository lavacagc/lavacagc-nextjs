/**
 * One `public.home_services` row and its mapping to the `HomeService` the pages
 * render. Pure and import-light: the server read (catalogData.ts), the admin
 * route, the admin editor (types only) and the tests share it.
 */
import { SERVICE_ICONS, serviceQuestions, type HomeService, type HomeServiceContent, type L, type ServiceFaqItem, type ServiceIconName, type Trade } from './catalog';

export interface HomeServiceRow {
  slug: string;
  sort: number;
  active: boolean;
  trade: Trade;
  icon: string;
  image: string | null;
  starting_price_cents: number;
  price_display_en: string;
  price_display_es: string;
  price_unit_en: string;
  price_unit_es: string;
  price_note_en: string | null;
  price_note_es: string | null;
  minimum_cents: number | null;
  name_en: string;
  name_es: string;
  description_en: string;
  description_es: string;
  included_en: string[];
  included_es: string[];
  raises_en: string[];
  raises_es: string[];
  seo_title_en: string;
  seo_title_es: string;
  seo_description_en: string;
  seo_description_es: string;
  seo_keywords: string[];
  faq: ServiceFaqItem[];
  updated_at: string | null;
  updated_by: string | null;
}

/** Every column, for `select=`: the reads name their columns rather than `*`. */
export const HOME_SERVICE_COLUMNS = [
  'slug', 'sort', 'active', 'trade', 'icon', 'image', 'starting_price_cents',
  'price_display_en', 'price_display_es', 'price_unit_en', 'price_unit_es', 'price_note_en', 'price_note_es',
  'minimum_cents', 'name_en', 'name_es', 'description_en', 'description_es',
  'included_en', 'included_es', 'raises_en', 'raises_es',
  'seo_title_en', 'seo_title_es', 'seo_description_en', 'seo_description_es', 'seo_keywords', 'faq',
  'updated_at', 'updated_by',
].join(',');

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []);

/** Pair the English and Spanish lists by position; a missing Spanish line falls back to English through `t()`. */
function zipLines(en: unknown, es: unknown): L[] {
  const esLines = strings(es);
  return strings(en).map((line, i) => ({ en: line, es: esLines[i] ?? '' }));
}

const lOrUndefined = (en: string | null, es: string | null): L | undefined => (en || es ? { en: en ?? '', es: es ?? '' } : undefined);

function faqItems(value: unknown): ServiceFaqItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ServiceFaqItem =>
      Boolean(item) && typeof item.q?.en === 'string' && typeof item.a?.en === 'string',
  ).map((item) => ({ q: { en: item.q.en, es: item.q.es ?? '' }, a: { en: item.a.en, es: item.a.es ?? '' } }));
}

const iconName = (value: string): ServiceIconName =>
  (SERVICE_ICONS as readonly string[]).includes(value) ? (value as ServiceIconName) : 'house';

export function rowToService(row: HomeServiceRow): HomeService {
  return {
    slug: row.slug,
    sort: row.sort,
    active: row.active,
    trade: row.trade,
    icon: iconName(row.icon),
    ...(row.image ? { image: row.image } : {}),
    startingPriceCents: row.starting_price_cents,
    priceDisplay: { en: row.price_display_en, es: row.price_display_es },
    priceUnit: { en: row.price_unit_en, es: row.price_unit_es },
    ...(lOrUndefined(row.price_note_en, row.price_note_es) ? { priceNote: lOrUndefined(row.price_note_en, row.price_note_es) } : {}),
    ...(row.minimum_cents ? { minimumCents: row.minimum_cents } : {}),
    name: { en: row.name_en, es: row.name_es },
    description: { en: row.description_en, es: row.description_es },
    included: zipLines(row.included_en, row.included_es),
    raisesPrice: zipLines(row.raises_en, row.raises_es),
    questions: serviceQuestions(row.slug),
    seo: {
      title: { en: row.seo_title_en, es: row.seo_title_es },
      description: { en: row.seo_description_en, es: row.seo_description_es },
      keywords: strings(row.seo_keywords),
    },
    faq: faqItems(row.faq),
  };
}

/** A seed entry as the row the migration inserted for it (sort is 1-based, every row active). */
export function contentToRow(content: HomeServiceContent, sort: number): HomeServiceRow {
  return {
    slug: content.slug,
    sort,
    active: true,
    trade: content.trade,
    icon: content.icon,
    image: content.image ?? null,
    starting_price_cents: content.startingPriceCents,
    price_display_en: content.priceDisplay.en,
    price_display_es: content.priceDisplay.es,
    price_unit_en: content.priceUnit.en,
    price_unit_es: content.priceUnit.es,
    price_note_en: content.priceNote?.en ?? null,
    price_note_es: content.priceNote?.es ?? null,
    minimum_cents: content.minimumCents ?? null,
    name_en: content.name.en,
    name_es: content.name.es,
    description_en: content.description.en,
    description_es: content.description.es,
    included_en: content.included.map((x) => x.en),
    included_es: content.included.map((x) => x.es),
    raises_en: content.raisesPrice.map((x) => x.en),
    raises_es: content.raisesPrice.map((x) => x.es),
    seo_title_en: content.seo.title.en,
    seo_title_es: content.seo.title.es,
    seo_description_en: content.seo.description.en,
    seo_description_es: content.seo.description.es,
    seo_keywords: content.seo.keywords,
    faq: content.faq,
    updated_at: null,
    updated_by: null,
  };
}
