/**
 * Server-side lead-payload sanitizer.
 *
 * public.leads was created directly in the Supabase dashboard - its DDL is not
 * in this repo - and it enforces constraints a form payload can violate:
 *
 *   - NOT NULL: first_name, last_name, email, phone, inquiry_type
 *   - CHECK:    leads_inquiry_type_check            (estimate | contact | exit_intent)
 *               leads_contact_time_preference_check (anytime | morning | afternoon |
 *                                                    evening | weekends | specific | NULL)
 *   - Types:    square_footage / score / visit_count are integers,
 *               first_seen is timestamptz
 *   - Unknown columns make PostgREST reject the whole insert (PGRST204)
 *
 * (Verified empirically against production on 2026-07-12. project_type,
 * project_timeline, budget_range, preferred_contact_method, tier and
 * current_project_status are plain TEXT with no CHECK.)
 *
 * Any violation means Postgres rejects the row and THE LEAD IS LOST - that is
 * how a Home Care booking with no phone number died with 23502: the form
 * offers "email or phone", but the column says NOT NULL. This module makes
 * every payload that satisfies the real business rule ("at least one contact
 * method") insertable: required columns get safe fallbacks, values a
 * constraint would reject are mapped or dropped, and every adjustment is
 * reported so a misbehaving form still gets noticed (via the form-error
 * alert) without costing the lead.
 *
 * "Not provided" is stored as '' for email/phone (the columns are NOT NULL,
 * and '' behaves exactly like null for every JS consumer: both are falsy).
 */

export const LEAD_INQUIRY_TYPES = ['estimate', 'contact', 'exit_intent'] as const;
export const LEAD_CONTACT_TIME_PREFERENCES = [
  'anytime',
  'morning',
  'afternoon',
  'evening',
  'weekends',
  'specific',
] as const;

/** Neutral fallback when a form sends a missing/unknown inquiry_type. */
const FALLBACK_INQUIRY_TYPE = 'contact';

// Writable public.leads columns. id / created_at / updated_at / archived_at
// are server-managed and never accepted from a payload. If a new column is
// added to the table, it must be added here too or the sanitizer will drop it
// (loudly, via an adjustment note in the owner alert).
const TEXT_COLUMNS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'address',
  'city',
  'zip_code',
  'inquiry_type',
  'project_type',
  'project_timeline',
  'budget_range',
  'message',
  'current_project_status',
  'preferred_contact_method',
  'tier',
  'source',
  'visitor_id',
  'referrer',
  'contact_time_preference',
  'contact_time_details',
  'contact_timezone',
  // Captured by the tokenized intake flow (WEB-015/016). No lead form sends
  // these; they arrive as the lead answers, and are mirrored onto the row.
  'scope_tier',
  'scope_detail',
  'finish_level',
  'price_reaction',
  // Written by the intake scorer at completion (WEB-01A), never by a form.
  'intake_bucket',
  'routed_to',
  'routing_reason',
] as const;
const INTEGER_COLUMNS = ['square_footage', 'score', 'visit_count', 'price_anchor_shown', 'intake_score'] as const;
const TIMESTAMP_COLUMNS = ['first_seen'] as const;
const ARRAY_COLUMNS = ['scoring_reasons', 'intake_signals'] as const;

const ALL_COLUMNS = new Set<string>([
  ...TEXT_COLUMNS,
  ...INTEGER_COLUMNS,
  ...TIMESTAMP_COLUMNS,
  ...ARRAY_COLUMNS,
]);

export interface LeadSanitizeResult {
  /** Insert-safe row for POST /rest/v1/leads. */
  lead: Record<string, unknown>;
  /**
   * Human-readable notes for every value that had to be changed or dropped.
   * Empty for a well-formed payload. Non-empty means a form is sending
   * non-standard data - save the lead, then alert the owner.
   */
  adjustments: string[];
}

export function sanitizeLeadForInsert(fields: Record<string, unknown>): LeadSanitizeResult {
  const lead: Record<string, unknown> = {};
  const adjustments: string[] = [];

  for (const col of TEXT_COLUMNS) {
    const raw = fields[col];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== 'string') {
      adjustments.push(`${col}: dropped non-string value (${typeof raw})`);
      continue;
    }
    // Postgres text columns reject NUL bytes (22P05) - one U+0000 pasted from
    // a PDF would otherwise kill the whole insert. Strip silently.
    const trimmed = raw.replace(/\u0000/g, '').trim();
    if (trimmed) lead[col] = trimmed;
  }

  for (const col of INTEGER_COLUMNS) {
    const raw = fields[col];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'string' && raw.trim() === '') continue;
    const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
    if (Number.isFinite(num)) {
      lead[col] = Math.trunc(num);
    } else {
      adjustments.push(`${col}: dropped non-numeric value ${JSON.stringify(raw)}`);
    }
  }

  for (const col of TIMESTAMP_COLUMNS) {
    const raw = fields[col];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'string' && !Number.isNaN(Date.parse(raw))) {
      lead[col] = raw;
    } else {
      adjustments.push(`${col}: dropped unparseable timestamp ${JSON.stringify(raw)}`);
    }
  }

  for (const col of ARRAY_COLUMNS) {
    const raw = fields[col];
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      lead[col] = raw.filter((v) => typeof v === 'string');
    } else {
      adjustments.push(`${col}: dropped non-array value`);
    }
  }

  for (const key of Object.keys(fields)) {
    if (!ALL_COLUMNS.has(key) && fields[key] !== undefined && fields[key] !== null) {
      adjustments.push(`${key}: dropped unknown column`);
    }
  }

  // NOT NULL contact columns. The business rule "email OR phone" is enforced
  // by the caller BEFORE insert; here the missing one becomes '' so the row
  // satisfies the schema.
  if (typeof lead.email !== 'string') lead.email = '';
  if (typeof lead.phone !== 'string') lead.phone = '';

  // NOT NULL name columns. Every live form sends both (the Home Care booking
  // form even duplicates first → last), so a fallback firing means a form
  // regressed - save the lead anyway and let the adjustment note surface it.
  if (typeof lead.first_name !== 'string') {
    lead.first_name = 'Visitor';
    adjustments.push('first_name: missing, defaulted to "Visitor"');
  }
  if (typeof lead.last_name !== 'string') {
    lead.last_name = lead.first_name;
    adjustments.push(`last_name: missing, defaulted to first_name ("${lead.first_name}")`);
  }

  // NOT NULL + CHECK-constrained inquiry_type.
  const inquiry = lead.inquiry_type;
  if (typeof inquiry !== 'string' || !(LEAD_INQUIRY_TYPES as readonly string[]).includes(inquiry)) {
    if (inquiry !== undefined) {
      adjustments.push(
        `inquiry_type: ${JSON.stringify(inquiry)} not in [${LEAD_INQUIRY_TYPES.join(', ')}], mapped to "${FALLBACK_INQUIRY_TYPE}"`
      );
    } else {
      adjustments.push(`inquiry_type: missing, defaulted to "${FALLBACK_INQUIRY_TYPE}"`);
    }
    lead.inquiry_type = FALLBACK_INQUIRY_TYPE;
  }

  // Nullable but CHECK-constrained contact_time_preference.
  const ctp = lead.contact_time_preference;
  if (ctp !== undefined && !(LEAD_CONTACT_TIME_PREFERENCES as readonly string[]).includes(ctp as string)) {
    adjustments.push(
      `contact_time_preference: dropped ${JSON.stringify(ctp)} (not in [${LEAD_CONTACT_TIME_PREFERENCES.join(', ')}])`
    );
    delete lead.contact_time_preference;
  }

  return { lead, adjustments };
}
