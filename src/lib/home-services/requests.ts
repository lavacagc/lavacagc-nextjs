/**
 * Home services requests: the payload contract, dedupe, the leads row, and the
 * owner alert. Shared by POST /api/home-services/request and
 * POST /api/home-services/verify (which sends the deferred alert for a Held
 * request once its phone is confirmed), so both describe a request the same way.
 *
 * The contract is docs/home-services/acceptance-criteria.md, "Request flow API".
 * Server-only (imports the notify helpers).
 */
import { z } from 'zod';
import {
  describeAnswers,
  getService,
  isServiceSlug,
  SERVICE_SLUGS,
  t,
  TIMING_OPTIONS,
  type Lang,
} from './catalog';
import { normalizeZip, ZIP_RE } from './serviceArea';
import { sendTelegramLead } from '@/lib/notify/telegramLead';
import { sendNewLeadEmail } from '@/lib/notify/newLeadEmail';

export const MAX_REQUEST_BODY_BYTES = 32 * 1024;
/** Anything submitted faster than this after the sheet opened is a bot (grill 001 Q12). */
export const MIN_FILL_MS = 5000;
export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RECAPTCHA_ACTION = 'home_services_request';

export type Timing = 'this_week' | 'two_weeks' | 'flexible';
export type RequestStatus = 'held' | 'new' | 'contacted' | 'bid_sent' | 'assigned' | 'won' | 'lost';

const str = (max: number) => z.string().max(max);

export const RequestBodySchema = z.object({
  services: z.array(z.string().max(60)).min(1).max(SERVICE_SLUGS.length),
  answers: z.record(z.string().max(60), z.record(z.string().max(60), z.string().max(60))).default({}),
  address: str(300),
  zip: str(20),
  town: str(120).optional().nullable(),
  photo_ids: z.array(z.string().max(60)).max(10).default([]),
  draft_token: str(60).optional().nullable(),
  first_name: str(120),
  last_name: str(120).optional().nullable(),
  phone: str(40),
  email: str(320).optional().nullable(),
  timing: z.enum(['this_week', 'two_weeks', 'flexible']).default('flexible'),
  notes: str(2000).optional().nullable(),
  consent_sms: z.boolean(),
  lang: z.enum(['en', 'es']).default('en'),
  started_at: z.number().finite(),
  /**
   * Not in the original contract; additive. Epoch ms on the CLIENT clock when
   * Send was pressed. The timing check compares it with started_at (same clock)
   * so a homeowner whose phone clock is off by a minute is not silently dropped.
   * Absent, the server clock is used.
   */
  submitted_at: z.number().finite().optional().nullable(),
  honeypot: str(500).optional().nullable(),
  recaptchaToken: str(5000).optional().nullable(),
  recaptchaAction: str(100).optional().nullable(),
  recaptchaV2Token: str(5000).optional().nullable(),
});

export type RequestBody = z.infer<typeof RequestBodySchema>;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Digits only, US: 10 digits, a leading 1 dropped. Null when it cannot be a US number. */
export function phoneDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return null;
}

/** Services in catalog order, unknown slugs and duplicates removed. */
export function canonicalServices(services: string[]): string[] {
  const wanted = new Set(services.filter(isServiceSlug));
  return SERVICE_SLUGS.filter((slug) => wanted.has(slug));
}

/**
 * Only answers the catalog defines survive: a known question of a selected
 * service with one of that question's options. Anything else is dropped, so
 * the admin and the alerts never show text a client invented.
 */
export function canonicalAnswers(
  services: string[],
  answers: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const slug of services) {
    const service = getService(slug);
    const given = answers?.[slug];
    if (!service || !given) continue;
    const kept: Record<string, string> = {};
    for (const q of service.questions) {
      const value = given[q.key];
      if (typeof value === 'string' && q.options.some((o) => o.value === value)) kept[q.key] = value;
    }
    if (Object.keys(kept).length) out[slug] = kept;
  }
  return out;
}

/** Union of two answer sets; the newer submission wins a conflict. */
export function mergeAnswers(
  older: Record<string, Record<string, string>>,
  newer: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const slug of new Set([...Object.keys(older ?? {}), ...Object.keys(newer ?? {})])) {
    out[slug] = { ...(older?.[slug] ?? {}), ...(newer?.[slug] ?? {}) };
  }
  return out;
}

/** Lowercase, punctuation stripped, whitespace collapsed: "12 Main St." == "12  main st". */
export function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `<addr>|<zip>|<slugs sorted, joined by +>` (contract). */
export function dedupeKey(address: string, zip: string, services: string[]): string {
  return `${normalizeAddress(address)}|${normalizeZip(zip)}|${[...services].sort().join('+')}`;
}

/** leads.project_timeline values the other forms already use. */
export function timelineFor(timing: Timing): 'asap' | 'planning' {
  return timing === 'flexible' ? 'planning' : 'asap';
}

export function timingLabel(timing: Timing, lang: Lang): string {
  return t(TIMING_OPTIONS.find((o) => o.value === timing)?.label, lang);
}

export function splitName(firstName: string, lastName?: string | null): { first: string; last: string } {
  const first = firstName.trim();
  const last = (lastName ?? '').trim();
  if (last) return { first, last };
  // The flow has one Name field; "Maria del Carmen Lopez" -> "Maria" + "del Carmen Lopez".
  const parts = first.split(/\s+/);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

export interface ValidatedRequest {
  services: string[];
  answers: Record<string, Record<string, string>>;
  address: string;
  zip: string;
  town: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  timing: Timing;
  notes: string;
  lang: Lang;
}

/** Business validation beyond the schema. Returns the cleaned request, or the reason it is unusable. */
export function validateRequest(body: RequestBody): { ok: true; value: ValidatedRequest } | { ok: false; reason: string } {
  const services = canonicalServices(body.services);
  if (services.length === 0) return { ok: false, reason: 'no known services' };
  const address = body.address.replace(/\u0000/g, '').trim();
  if (address.length < 3) return { ok: false, reason: 'address missing' };
  const zip = normalizeZip(body.zip);
  if (!ZIP_RE.test(zip)) return { ok: false, reason: 'zip invalid' };
  const { first, last } = splitName(body.first_name, body.last_name);
  if (!first) return { ok: false, reason: 'name missing' };
  const digits = phoneDigits(body.phone);
  if (!digits) return { ok: false, reason: 'phone invalid' };
  const email = (body.email ?? '').trim();
  if (email && !EMAIL_RE.test(email)) return { ok: false, reason: 'email invalid' };
  if (body.consent_sms !== true) return { ok: false, reason: 'consent missing' };
  return {
    ok: true,
    value: {
      services,
      answers: canonicalAnswers(services, body.answers ?? {}),
      address,
      zip,
      town: (body.town ?? '').trim(),
      firstName: first,
      lastName: last,
      phone: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
      email,
      timing: body.timing,
      notes: (body.notes ?? '').replace(/\u0000/g, '').trim(),
      lang: body.lang,
    },
  };
}

/** The durable, human-readable record of the request on the leads row (always English for Alex). */
export function leadMessage(req: Pick<ValidatedRequest, 'services' | 'answers' | 'timing' | 'notes' | 'lang'>): string {
  return [
    ...describeAnswers(req.services, req.answers, 'en'),
    `Timing: ${timingLabel(req.timing, 'en')}`,
    `Language: ${req.lang === 'es' ? 'Spanish' : 'English'}`,
    req.notes ? `Notes: ${req.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Fields for public.leads, BEFORE sanitizeLeadForInsert. Every key here is a
 * column the sanitizer accepts; `preferred_contact_method` is plain text with
 * no CHECK on the production table (leadSanitize.ts header), so 'text' is safe.
 */
export function leadFields(req: ValidatedRequest, source: string): Record<string, string> {
  return {
    first_name: req.firstName,
    // public.leads.last_name is NOT NULL; the Home Care form duplicates first
    // into last for the same reason, and that keeps the sanitizer quiet.
    last_name: req.lastName || req.firstName,
    email: req.email,
    phone: req.phone,
    address: req.address,
    city: req.town,
    zip_code: req.zip,
    inquiry_type: 'estimate',
    project_type: 'home_services',
    project_timeline: timelineFor(req.timing),
    preferred_contact_method: 'text',
    contact_timezone: 'America/New_York',
    source: `home_services:${source}`,
    message: leadMessage(req),
  };
}

/** The confirmation text the homeowner gets (when SMS is configured). */
export function confirmationSmsBody(lang: Lang, firstName: string, code?: string): string {
  const name = firstName.slice(0, 40);
  if (lang === 'es') {
    return `La Vaca: hola ${name}, recibimos su solicitud. Alex revisará sus fotos y le enviará un precio firme por texto.` +
      (code ? ` Su código de confirmación es ${code} (vence en 10 minutos).` : '') +
      ' Responda STOP para cancelar.';
  }
  return `La Vaca: hi ${name}, we got your request. Alex will look at your photos and text you a firm price.` +
    (code ? ` Your confirmation code is ${code} (expires in 10 minutes).` : '') +
    ' Reply STOP to opt out.';
}

/** What the owner alert needs about a stored request. */
export interface AlertableRequest {
  id: string;
  lead_id: string | null;
  services: string[];
  answers: Record<string, Record<string, string>>;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  town: string;
  zip: string;
  timing: Timing;
  notes: string;
  language: Lang;
  source: string;
  listing_id: string | null;
  phone_verified: boolean;
}

/**
 * Telegram rejects a message over 4096 characters outright, and a signed URL is
 * roughly 300, so ten of them would take the whole alert down. Telegram carries
 * the first few and points at the email, which carries all of them.
 */
export const TELEGRAM_PHOTO_LINKS = 3;

export function alertDetailLines(
  req: AlertableRequest,
  photoUrls: string[],
  opts: { smsConfigured: boolean; forTelegram: boolean; codeFailed?: boolean },
): string[] {
  const lines = [
    `Address: ${req.address}${req.town ? `, ${req.town}` : ''} ${req.zip}`.trim(),
    `Timing: ${timingLabel(req.timing, 'en')}`,
    `Language: ${req.language === 'es' ? 'Spanish' : 'English'}`,
  ];
  if (req.listing_id) lines.push(`Listing: ${req.listing_id}`);
  if (req.notes) lines.push(`Notes: ${req.notes}`);
  if (photoUrls.length === 0) {
    lines.push('Photos: none');
  } else {
    const shown = opts.forTelegram ? photoUrls.slice(0, TELEGRAM_PHOTO_LINKS) : photoUrls;
    shown.forEach((url, i) => lines.push(`Photo ${i + 1}: ${url}`));
    if (shown.length < photoUrls.length) lines.push(`+${photoUrls.length - shown.length} more photos in the email`);
  }
  if (opts.codeFailed) lines.push('Phone not verified (the code text failed to send)');
  else if (!opts.smsConfigured) lines.push('Phone not verified (SMS provider not configured)');
  else if (req.phone_verified) lines.push('Phone verified by text code');
  return lines;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | { status: 'timeout'; label: string }> {
  return Promise.race([
    promise,
    new Promise<{ status: 'timeout'; label: string }>((resolve) => setTimeout(() => resolve({ status: 'timeout', label }), ms)),
  ]);
}

export interface OwnerAlertResult {
  telegram: string;
  email: string;
}

/**
 * Telegram + email to the owner for one request. Each channel is capped like
 * the leads route (6 s and 4 s), never throws, and reports its status;
 * `skipped` is the normal answer where the credentials are not set.
 */
export async function sendOwnerAlert(
  req: AlertableRequest,
  photoUrls: string[],
  opts: { smsConfigured: boolean; codeFailed?: boolean; score?: number; tier?: 'hot' | 'warm' | 'cold'; geoTier?: string },
): Promise<OwnerAlertResult> {
  const name = `${req.first_name} ${req.last_name}`.trim();
  const services = describeAnswers(req.services, req.answers, 'en');
  const location = [req.town, req.zip].filter(Boolean).join(' ');
  const source = `home_services:${req.source}`;
  const [telegram, email] = await Promise.all([
    withTimeout(
      sendTelegramLead({
        name,
        email: req.email,
        phone: req.phone,
        projectType: 'Home Services',
        location,
        score: opts.score,
        tier: opts.tier,
        source,
        services,
        homeDetails: alertDetailLines(req, photoUrls, { smsConfigured: opts.smsConfigured, codeFailed: opts.codeFailed, forTelegram: true }),
        geoTier: opts.geoTier,
      }),
      6000,
      'telegram-lead',
    ).catch((err) => ({ status: 'error', error: String(err) })),
    withTimeout(
      sendNewLeadEmail({
        name,
        email: req.email,
        phone: req.phone,
        projectType: 'Home Services',
        location,
        source,
        tier: opts.tier,
        services,
        homeDetails: alertDetailLines(req, photoUrls, { smsConfigured: opts.smsConfigured, codeFailed: opts.codeFailed, forTelegram: false }),
        leadId: req.lead_id,
        geoTier: opts.geoTier,
      }),
      4000,
      'new-lead',
    ).catch((err) => ({ status: 'error', error: String(err) })),
  ]);
  const describe = (r: unknown) => {
    const v = r as { status?: string; reason?: string };
    return v?.reason ? `${v.status}:${v.reason}` : String(v?.status ?? 'unknown');
  };
  return { telegram: describe(telegram), email: describe(email) };
}

export { withTimeout };
