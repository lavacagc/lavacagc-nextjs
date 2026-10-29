/**
 * Admin-side model of a home services request: row types, statuses, the
 * town-to-county map, the append-only notes format and the 30-day summary.
 *
 * Pure on purpose (no Supabase, no React): the admin API routes compute with
 * it and the admin components render with it, so the list filter, the detail
 * panel and the summary card all agree on what "Essex" or "close rate" means.
 */
import { describeAnswers, getService, type County, type Lang, type Trade } from './catalog';
import { countyForZip } from './countyZips';

export const REQUEST_STATUSES = ['held', 'new', 'contacted', 'bid_sent', 'assigned', 'won', 'lost'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  held: 'Held',
  new: 'New',
  contacted: 'Contacted',
  bid_sent: 'Bid sent',
  assigned: 'Assigned',
  won: 'Won',
  lost: 'Lost',
};

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && (REQUEST_STATUSES as readonly string[]).includes(value);
}

/** Hand-typed row of public.home_service_requests (types.ts is not regenerated). */
export interface HomeServiceRequestRow {
  id: string;
  lead_id: string | null;
  status: RequestStatus;
  services: string[];
  answers: Record<string, Record<string, string>>;
  language: 'en' | 'es';
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  town: string;
  zip: string;
  in_service_area: boolean;
  timing: 'this_week' | 'two_weeks' | 'flexible';
  notes: string;
  consent_sms: boolean;
  source: string;
  listing_id: string | null;
  utm: Record<string, string>;
  landing_path: string | null;
  cta_variant_primary: string | null;
  cta_variant_secondary: string | null;
  captcha_score: number | null;
  phone_verified: boolean;
  phone_verified_at: string | null;
  merged_count: number;
  customer_price_cents: number | null;
  lost_reason: string | null;
  won_at: string | null;
  admin_notes: string;
  specnook_job_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Every column the admin reads. The verification hash and counters stay server-side. */
export const REQUEST_ADMIN_COLUMNS = [
  'id', 'lead_id', 'status', 'services', 'answers', 'language', 'first_name', 'last_name', 'phone', 'email',
  'address', 'town', 'zip', 'in_service_area', 'timing', 'notes', 'consent_sms', 'source', 'listing_id', 'utm',
  'landing_path', 'cta_variant_primary', 'cta_variant_secondary', 'captcha_score', 'phone_verified',
  'phone_verified_at', 'merged_count', 'customer_price_cents', 'lost_reason', 'won_at', 'admin_notes',
  'specnook_job_id', 'created_at', 'updated_at',
].join(',');

/**
 * County for each town in SERVICE_AREAS (src/lib/leadScoring.ts). Bid
 * eligibility matches a sub's counties against this, so a town missing here
 * means "no county", and only subs with no county restriction get that offer.
 */
export const TOWN_COUNTY: Record<string, string> = {
  montclair: 'Essex',
  'west orange': 'Essex',
  livingston: 'Essex',
  'short hills': 'Essex',
  maplewood: 'Essex',
  millburn: 'Essex',
  verona: 'Essex',
  caldwell: 'Essex',
  'west caldwell': 'Essex',
  'essex fells': 'Essex',
  bloomfield: 'Essex',
  'cedar grove': 'Essex',
  chatham: 'Morris',
  madison: 'Morris',
  morristown: 'Morris',
  parsippany: 'Morris',
  'florham park': 'Morris',
  kinnelon: 'Morris',
  alpine: 'Bergen',
  'saddle river': 'Bergen',
  'ho-ho-kus': 'Bergen',
  summit: 'Union',
  rahway: 'Union',
  clifton: 'Passaic',
};

/** Every county the map can produce, for the admin filter. */
export const ALL_REQUEST_COUNTIES = Array.from(new Set(Object.values(TOWN_COUNTY)));

/** County for a town as typed ("West Orange, NJ", " montclair "). Null when unknown. */
export function countyForTown(town: string | null | undefined): string | null {
  if (!town) return null;
  const key = town.toLowerCase().replace(/,.*$/, '').replace(/\s+/g, ' ').trim();
  return TOWN_COUNTY[key] ?? null;
}

/**
 * County of a request: its ZIP first (the county-wide table the request flow
 * gates on, so "Upper Montclair 07043" is Essex), then its town, then a town
 * at the end of its address.
 */
export function countyForRequest(req: Pick<HomeServiceRequestRow, 'town' | 'address'> & { zip?: string | null }): string | null {
  const byZip = countyForZip(req.zip);
  if (byZip) return byZip;
  const direct = countyForTown(req.town);
  if (direct) return direct;
  // "12 Elm St, Montclair, NJ 07042" -> try each comma part.
  for (const part of (req.address || '').split(',')) {
    const hit = countyForTown(part);
    if (hit) return hit;
  }
  return null;
}

export function isServedCounty(county: string | null): county is County {
  return county === 'Essex' || county === 'Morris' || county === 'Bergen';
}

/** Trades on a request, one per service, in service order and de-duplicated. */
export function tradesForServices(services: string[]): Trade[] {
  const out: Trade[] = [];
  for (const slug of services) {
    const trade = getService(slug)?.trade;
    if (trade && !out.includes(trade)) out.push(trade);
  }
  return out;
}

/** The catalog slug a trade came from on this request (one service = one trade). */
export function serviceForTrade(services: string[], trade: string): string | undefined {
  return services.find((slug) => getService(slug)?.trade === trade);
}

/**
 * What a sub reads about the job for one trade: the homeowner's taps for that
 * service, in the sub's language. Never the homeowner's free-text notes - they
 * can hold gate codes, schedules or an address, and subs see the town only
 * until one wins. Alex reads the notes and paraphrases what matters.
 */
export function answerLinesFor(
  request: Pick<HomeServiceRequestRow, 'services' | 'answers'>,
  trade: string,
  lang: Lang,
): string[] {
  const slug = serviceForTrade(request.services, trade);
  return slug ? describeAnswers([slug], request.answers ?? {}, lang) : [];
}

/**
 * One admin_notes line. Notes are append-only text: every line carries its own
 * timestamp and author, and nothing ever rewrites an earlier line.
 */
export function noteLine(text: string, at: Date, by?: string | null): string {
  const stamp = at.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const who = by ? ` (${by})` : '';
  return `[${stamp}]${who} ${text.replace(/\s*\n\s*/g, ' ').trim()}`;
}

export function appendNote(existing: string, line: string): string {
  return existing ? `${existing.replace(/\s+$/, '')}\n${line}` : line;
}

/** Age as the list shows it: "12m", "5h", "3d". */
export function ageLabel(createdAt: string, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - new Date(createdAt).getTime());
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export interface RequestSummary {
  windowDays: number;
  total: number;
  bySource: Array<{ key: string; count: number }>;
  byService: Array<{ key: string; count: number }>;
  /** Requests at status new or later (everything but held). */
  qualified: number;
  won: number;
  /** won / qualified; null when nothing qualified yet. */
  closeRate: number | null;
}

/**
 * The dashboard card (AD7): counts by source and by service over the window,
 * and close rate = won / (requests with status new or later).
 * The caller passes rows already limited to the window.
 */
export function summarizeRequests(
  rows: Array<Pick<HomeServiceRequestRow, 'status' | 'services' | 'source'>>,
  windowDays = 30,
): RequestSummary {
  const bySource = new Map<string, number>();
  const byService = new Map<string, number>();
  let qualified = 0;
  let won = 0;
  for (const r of rows) {
    const src = r.source || 'direct';
    bySource.set(src, (bySource.get(src) ?? 0) + 1);
    for (const slug of r.services ?? []) byService.set(slug, (byService.get(slug) ?? 0) + 1);
    if (r.status !== 'held') qualified += 1;
    if (r.status === 'won') won += 1;
  }
  const sorted = (m: Map<string, number>) =>
    Array.from(m, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return {
    windowDays,
    total: rows.length,
    bySource: sorted(bySource),
    byService: sorted(byService),
    qualified,
    won,
    closeRate: qualified > 0 ? won / qualified : null,
  };
}

export function mapsUrl(address: string, town?: string, zip?: string): string {
  const parts = [address, town, zip ? `NJ ${zip}` : ''].filter((p) => p && p.trim());
  // Do not repeat the town when the address already ends with it.
  const query = address && town && address.toLowerCase().includes(town.toLowerCase())
    ? [address, zip && !address.includes(zip) ? zip : ''].filter(Boolean).join(' ')
    : parts.join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Digits only, for tel: and sms: links. */
export function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}
