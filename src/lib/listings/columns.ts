/**
 * Single source of truth for the "Buy + Remodel" listings spreadsheet.
 *
 * Shared by:
 *   - the admin template generator (TEMPLATE_HEADERS + example/instructions rows)
 *   - the client-side parser (normalizeRow → NormalizedListing)
 *   - the server-side import route (NormalizedListingSchema re-validates)
 *
 * Keep this framework-light (pure TS + zod): it is imported in both a
 * 'use client' admin component and a server API route. No Node/DOM APIs here.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums (must mirror the CHECK constraints in the migration)
// ---------------------------------------------------------------------------
export const PROPERTY_TYPES = [
  'single-family',
  'multi-family',
  'townhouse',
  'condo',
  'land',
  'other',
] as const;

export const RECOMMENDED_SCOPES = [
  'kitchen',
  'bathroom',
  'basement',
  'addition',
  'whole-home',
  'general',
] as const;

export const LISTING_STATUSES = ['draft', 'available', 'pending', 'sold'] as const;

/** Scopes the /free-estimate page personalizes; others fall back to 'general'. */
const ESTIMATE_SERVICE_SCOPES = new Set(['kitchen', 'bathroom', 'basement', 'general']);

/** Map a listing's recommended_scope to a /free-estimate?service= value. */
export function scopeToEstimateService(scope?: string | null): string {
  if (scope && ESTIMATE_SERVICE_SCOPES.has(scope)) return scope;
  return 'general';
}

// ---------------------------------------------------------------------------
// Normalized row shape (what the client POSTs and the server validates)
// ---------------------------------------------------------------------------
export interface NormalizedListing {
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
  highlights: string[];
  photo_urls: string[];
  listing_url: string | null;
  featured: boolean;
  sort_order: number;
  status: string;
}

type ColumnKind =
  | 'text'
  | 'money'
  | 'int'
  | 'numeric'
  | 'bool'
  | 'zip'
  | 'array'
  | 'url'
  | 'urlArray'
  | 'enum:property'
  | 'enum:scope'
  | 'enum:status';

interface ListingColumn {
  /** Human-friendly spreadsheet header. */
  header: string;
  /** Target field on NormalizedListing (null = derived/not stored from sheet). */
  field: keyof NormalizedListing;
  kind: ColumnKind;
  required?: boolean;
  example: string;
  hint: string;
}

// ---------------------------------------------------------------------------
// Column definitions (order = template column order)
// ---------------------------------------------------------------------------
export const LISTING_COLUMNS: ListingColumn[] = [
  { header: 'External ID', field: 'external_id', kind: 'text', example: 'NNJ-001', hint: 'Optional. Your own stable id; used to match re-uploads. Leave blank to auto-match on address.' },
  { header: 'MLS #', field: 'mls_number', kind: 'text', example: '3891234', hint: 'Optional, informational.' },
  { header: 'Address', field: 'address_line1', kind: 'text', required: true, example: '12 Maple Avenue', hint: 'Required. Street address.' },
  { header: 'Unit / Apt', field: 'address_line2', kind: 'text', example: '', hint: 'Optional unit/apt.' },
  { header: 'City', field: 'city', kind: 'text', required: true, example: 'Ridgewood', hint: 'Required.' },
  { header: 'County', field: 'county', kind: 'text', example: 'Bergen', hint: 'Optional.' },
  { header: 'State', field: 'state', kind: 'text', example: 'NJ', hint: 'Optional, defaults to NJ.' },
  { header: 'Zip', field: 'zip', kind: 'zip', example: '07450', hint: 'Optional, 5 digits.' },
  { header: 'List Price', field: 'list_price', kind: 'money', required: true, example: '$525,000', hint: 'Required. Asking price in dollars; $ and commas OK.' },
  { header: 'Beds', field: 'beds', kind: 'int', example: '4', hint: 'Optional, whole number.' },
  { header: 'Baths', field: 'baths', kind: 'numeric', example: '2.5', hint: 'Optional, half-baths allowed (e.g. 2.5).' },
  { header: 'Sq Ft', field: 'sqft', kind: 'int', example: '2400', hint: 'Optional living area.' },
  { header: 'Lot Size', field: 'lot_size', kind: 'text', example: '0.34 acres', hint: 'Optional, free text.' },
  { header: 'Year Built', field: 'year_built', kind: 'int', example: '1968', hint: 'Optional, 4-digit year.' },
  { header: 'Property Type', field: 'property_type', kind: 'enum:property', example: 'single-family', hint: `One of: ${PROPERTY_TYPES.join(', ')}. Unknown -> other.` },
  { header: 'Description', field: 'short_description', kind: 'text', example: 'Solid mid-century colonial on a quiet street, dated kitchen and baths.', hint: 'Optional short blurb (max 600 chars).' },
  { header: 'Est Remodel Budget Low', field: 'est_remodel_budget_low', kind: 'money', required: true, example: '$120,000', hint: 'Required. Low end of Lavaca remodel estimate.' },
  { header: 'Est Remodel Budget High', field: 'est_remodel_budget_high', kind: 'money', required: true, example: '$180,000', hint: 'Required. Must be >= low.' },
  { header: 'After-Remodel Value (ARV)', field: 'est_arv', kind: 'money', example: '$850,000', hint: 'Optional projected value after remodel.' },
  { header: 'Recommended Scope', field: 'recommended_scope', kind: 'enum:scope', example: 'whole-home', hint: `One of: ${RECOMMENDED_SCOPES.join(', ')}. Unknown -> general.` },
  { header: 'Highlights', field: 'highlights', kind: 'array', example: 'Great bones | Large lot | Top school district', hint: 'Optional. Separate items with a pipe |.' },
  { header: 'Photo URLs', field: 'photo_urls', kind: 'urlArray', required: true, example: 'https://photos.example.com/1.jpg | https://photos.example.com/2.jpg', hint: 'Required (at least 1). Separate links with a pipe |. Must start with https://' },
  { header: 'Listing URL', field: 'listing_url', kind: 'url', example: 'https://realtor.example.com/listing/123', hint: 'Optional link to the MLS/realtor listing.' },
  { header: 'Featured', field: 'featured', kind: 'bool', example: 'no', hint: 'Optional. yes/true/1/x to feature on the page.' },
  { header: 'Sort Order', field: 'sort_order', kind: 'int', example: '0', hint: 'Optional. Lower numbers appear first.' },
  { header: 'Status', field: 'status', kind: 'enum:status', example: 'available', hint: `One of: ${LISTING_STATUSES.join(', ')}. Defaults to available on import.` },
];

export const TEMPLATE_HEADERS = LISTING_COLUMNS.map((c) => c.header);
export const TEMPLATE_EXAMPLE_ROW = LISTING_COLUMNS.map((c) => c.example);
export const INSTRUCTIONS_ROWS: string[][] = [
  ['Column', 'Required?', 'Notes'],
  ...LISTING_COLUMNS.map((c) => [c.header, c.required ? 'REQUIRED' : 'optional', c.hint]),
];

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------
function s(raw: unknown): string {
  return raw == null ? '' : String(raw).trim();
}

function normalizeMoney(raw: unknown): number | null {
  const v = s(raw).replace(/[$,\s]/g, '');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function normalizeInt(raw: unknown): number | null {
  const v = s(raw).replace(/[,\s]/g, '');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeNumeric(raw: unknown): number | null {
  const v = s(raw).replace(/[,\s]/g, '');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeBool(raw: unknown): boolean {
  return /^(yes|true|1|x|y)$/i.test(s(raw));
}

function normalizeZip(raw: unknown): string | null {
  const digits = s(raw).replace(/\D/g, '').slice(0, 5);
  return digits || null;
}

function splitPipes(raw: unknown): string[] {
  return s(raw)
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
}

function normalizeEnum(raw: unknown, allowed: readonly string[], fallback: string | null): string | null {
  const v = s(raw).toLowerCase().replace(/\s+/g, '-');
  if (!v) return fallback;
  return (allowed as readonly string[]).includes(v) ? v : fallback;
}

function textOrNull(raw: unknown, max = 2000): string | null {
  const v = s(raw).slice(0, max);
  return v || null;
}

/** lowercase, alnum + single dashes, trimmed. */
export function slugify(base: string): string {
  return s(base)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'listing';
}

/** Build the deterministic slug base (external_id > mls_number > address+city+zip). */
export function deriveSlug(row: Pick<NormalizedListing, 'external_id' | 'mls_number' | 'address_line1' | 'city' | 'zip'>): string {
  const base =
    row.external_id ||
    row.mls_number ||
    [row.address_line1, row.city, row.zip].filter(Boolean).join('-');
  return slugify(base);
}

// ---------------------------------------------------------------------------
// Row parsing (client). Keys matched case-insensitively against headers.
// ---------------------------------------------------------------------------
const HEADER_KEY = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');

/** Normalize a raw sheet record (keyed by header text) into a NormalizedListing. */
export function normalizeRow(record: Record<string, unknown>): NormalizedListing {
  // Build a case-insensitive lookup of the incoming record's keys.
  const lookup = new Map<string, unknown>();
  for (const [k, v] of Object.entries(record)) lookup.set(HEADER_KEY(k), v);

  const out = {} as Record<keyof NormalizedListing, unknown>;
  for (const col of LISTING_COLUMNS) {
    const raw = lookup.get(HEADER_KEY(col.header));
    switch (col.kind) {
      case 'money':
        out[col.field] = normalizeMoney(raw);
        break;
      case 'int':
        out[col.field] = normalizeInt(raw);
        break;
      case 'numeric':
        out[col.field] = normalizeNumeric(raw);
        break;
      case 'bool':
        out[col.field] = normalizeBool(raw);
        break;
      case 'zip':
        out[col.field] = normalizeZip(raw);
        break;
      case 'array':
      case 'urlArray':
        out[col.field] = splitPipes(raw);
        break;
      case 'enum:property':
        out[col.field] = normalizeEnum(raw, PROPERTY_TYPES, 'other');
        break;
      case 'enum:scope':
        out[col.field] = normalizeEnum(raw, RECOMMENDED_SCOPES, 'general');
        break;
      case 'enum:status':
        out[col.field] = normalizeEnum(raw, LISTING_STATUSES, 'available') || 'available';
        break;
      case 'url':
      case 'text':
      default:
        out[col.field] = col.field === 'short_description' ? textOrNull(raw, 600) : textOrNull(raw);
        break;
    }
  }

  // Defaults for fields that must be non-null.
  out.state = (out.state as string | null) || 'NJ';
  out.sort_order = (out.sort_order as number | null) ?? 0;
  out.featured = Boolean(out.featured);
  out.highlights = (out.highlights as string[]) ?? [];
  out.photo_urls = (out.photo_urls as string[]) ?? [];
  out.status = (out.status as string) || 'available';

  return out as unknown as NormalizedListing;
}

// ---------------------------------------------------------------------------
// Zod schema (server re-validation — never trust the client)
// ---------------------------------------------------------------------------
const httpsUrl = z.string().refine((u) => /^https?:\/\//i.test(u), 'must be an http(s) URL');

export const NormalizedListingSchema = z
  .object({
    external_id: z.string().max(120).nullable(),
    mls_number: z.string().max(120).nullable(),
    address_line1: z.preprocess((v) => v ?? '', z.string().min(1, 'Address is required').max(300)),
    address_line2: z.string().max(120).nullable(),
    city: z.preprocess((v) => v ?? '', z.string().min(1, 'City is required').max(120)),
    county: z.string().max(120).nullable(),
    state: z.string().max(40),
    zip: z.string().max(10).nullable(),
    list_price: z.number().int().positive('List Price is required').nullable().refine((v) => v !== null, 'List Price is required'),
    beds: z.number().int().nonnegative().nullable(),
    baths: z.number().nonnegative().nullable(),
    sqft: z.number().int().nonnegative().nullable(),
    lot_size: z.string().max(120).nullable(),
    year_built: z.number().int().min(1800).max(2100).nullable(),
    property_type: z.enum(PROPERTY_TYPES).nullable(),
    short_description: z.string().max(600).nullable(),
    est_remodel_budget_low: z.number().int().nonnegative('Est Remodel Budget Low is required').nullable().refine((v) => v !== null, 'Est Remodel Budget Low is required'),
    est_remodel_budget_high: z.number().int().nonnegative('Est Remodel Budget High is required').nullable().refine((v) => v !== null, 'Est Remodel Budget High is required'),
    est_arv: z.number().int().nonnegative().nullable(),
    recommended_scope: z.enum(RECOMMENDED_SCOPES).nullable(),
    highlights: z.array(z.string().max(200)).max(20),
    photo_urls: z.array(httpsUrl).min(1, 'At least one Photo URL is required').max(30),
    listing_url: z.union([httpsUrl, z.literal('')]).nullable(),
    featured: z.boolean(),
    sort_order: z.number().int(),
    status: z.enum(LISTING_STATUSES),
  })
  .refine(
    (r) =>
      r.est_remodel_budget_low === null ||
      r.est_remodel_budget_high === null ||
      r.est_remodel_budget_high >= r.est_remodel_budget_low,
    { message: 'Est Remodel Budget High must be >= Low', path: ['est_remodel_budget_high'] },
  );

export type ValidatedListing = z.infer<typeof NormalizedListingSchema>;

/** First human-readable error for a normalized row, or null if valid. */
export function validateRow(row: NormalizedListing): string | null {
  const result = NormalizedListingSchema.safeParse(row);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? 'Invalid row';
}
