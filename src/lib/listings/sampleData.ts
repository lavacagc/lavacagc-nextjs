/**
 * DEV-ONLY sample listings.
 *
 * Used solely so the /buy-and-remodel pages are reviewable locally BEFORE the
 * `listings` migration is applied to Supabase. Guarded by
 * `process.env.NODE_ENV === 'development'` at every call site, so it never
 * runs in a Vercel production build (NODE_ENV='production') and never affects
 * real data — the moment the DB returns rows, these are ignored.
 *
 * Images are inline SVG data: URIs (allowed by the CSP img-src), so no
 * network/host config is needed for the preview.
 */

export const IS_DEV = process.env.NODE_ENV === 'development';

const ph = (label: string, color: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='600'><rect width='100%' height='100%' fill='${color}'/><text x='50%' y='50%' font-family='Inter,sans-serif' font-size='34' fill='white' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`,
  )}`;

export interface SampleListing {
  id: string;
  slug: string;
  external_id: string | null;
  mls_number: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  county: string | null;
  state: string;
  zip: string | null;
  list_price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_size: string | null;
  year_built: number | null;
  property_type: string | null;
  short_description: string | null;
  est_remodel_budget_low: number | null;
  est_remodel_budget_high: number | null;
  est_arv: number | null;
  recommended_scope: string | null;
  highlights: string[] | null;
  photo_urls: string[] | null;
  listing_url: string | null;
  status: string;
  featured: boolean | null;
}

export const SAMPLE_LISTINGS: SampleListing[] = [
  {
    id: 'sample-1',
    slug: '12-maple-avenue-ridgewood-07450',
    external_id: 'NNJ-001',
    mls_number: '3891234',
    address_line1: '12 Maple Avenue',
    address_line2: null,
    city: 'Ridgewood',
    county: 'Bergen',
    state: 'NJ',
    zip: '07450',
    list_price: 525000,
    beds: 4,
    baths: 2.5,
    sqft: 2400,
    lot_size: '0.34 acres',
    year_built: 1968,
    property_type: 'single-family',
    short_description:
      'Solid mid-century colonial on a quiet, tree-lined street. Great bones, generous room sizes, and a dated kitchen and baths that are ready for a full transformation.',
    est_remodel_budget_low: 120000,
    est_remodel_budget_high: 180000,
    est_arv: 850000,
    recommended_scope: 'whole-home',
    highlights: ['Great bones', 'Large level lot', 'Top-rated school district', 'Walk to train'],
    photo_urls: [ph('12 Maple Ave', '%23002855'), ph('Kitchen', '%23146356'), ph('Backyard', '%23EE9639')],
    listing_url: 'https://example.com/listing/12-maple',
    status: 'available',
    featured: true,
  },
  {
    id: 'sample-2',
    slug: '88-park-street-montclair-07042',
    external_id: 'NNJ-002',
    mls_number: null,
    address_line1: '88 Park Street',
    address_line2: null,
    city: 'Montclair',
    county: 'Essex',
    state: 'NJ',
    zip: '07042',
    list_price: 689000,
    beds: 3,
    baths: 2,
    sqft: 1850,
    lot_size: '0.18 acres',
    year_built: 1925,
    property_type: 'single-family',
    short_description:
      'Charming 1920s home with original details intact. The kitchen and primary bath need a refresh to bring it into the modern era.',
    est_remodel_budget_low: 85000,
    est_remodel_budget_high: 130000,
    est_arv: 950000,
    recommended_scope: 'kitchen',
    highlights: ['Original woodwork', 'Walk to downtown', 'Deep lot'],
    photo_urls: [ph('88 Park St', '%23146356'), ph('Living room', '%23002855')],
    listing_url: null,
    status: 'available',
    featured: false,
  },
  {
    id: 'sample-3',
    slug: '5-oak-court-livingston-07039',
    external_id: 'NNJ-003',
    mls_number: null,
    address_line1: '5 Oak Court',
    address_line2: null,
    city: 'Livingston',
    county: 'Essex',
    state: 'NJ',
    zip: '07039',
    list_price: 615000,
    beds: 4,
    baths: 3,
    sqft: 2650,
    lot_size: '0.41 acres',
    year_built: 1979,
    property_type: 'single-family',
    short_description: 'Spacious split-level on a cul-de-sac. Unfinished basement offers big upside for added living space.',
    est_remodel_budget_low: 95000,
    est_remodel_budget_high: 140000,
    est_arv: 880000,
    recommended_scope: 'basement',
    highlights: ['Cul-de-sac', 'Unfinished basement', 'Two-car garage'],
    photo_urls: [ph('5 Oak Court', '%23EE9639')],
    listing_url: null,
    status: 'pending',
    featured: false,
  },
];

export interface SampleRendering {
  section: string;
  before_url: string;
  after_url: string;
  sort_order: number;
}

/** DEV-only before/after renderings keyed by listing slug. */
export const SAMPLE_RENDERINGS: Record<string, SampleRendering[]> = {
  '12-maple-avenue-ridgewood-07450': [
    { section: 'kitchen', before_url: ph('Kitchen — before', '%23334155'), after_url: ph('Kitchen — after', '%23146356'), sort_order: 0 },
    { section: 'bathroom', before_url: ph('Bath — before', '%23334155'), after_url: ph('Bath — after', '%23EE9639'), sort_order: 1 },
  ],
  '88-park-street-montclair-07042': [
    { section: 'kitchen', before_url: ph('Kitchen — before', '%23334155'), after_url: ph('Kitchen — after', '%23002855'), sort_order: 0 },
  ],
};

export const SAMPLE_PARTNER = {
  name: 'Jane Doe',
  brokerage: 'Northern NJ Realty Group',
  phone: '(201) 555-0142',
  email: 'jane@example.com',
  photo_url: ph('JD', '%23002855'),
  bio: 'Bergen & Essex County specialist who knows which homes are worth the remodel. Happy to walk any of these with you.',
};
