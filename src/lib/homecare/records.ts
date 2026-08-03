/**
 * La Vaca Home Care - "My Home Systems" fact registry (pure, testable).
 *
 * A homeowner can save durable facts they discover while doing checklist tasks -
 * where the water main shut-off is, the HVAC filter size - so they never
 * re-learn them and La Vaca can act faster. Each fact has a canonical `key`
 * that is DECOUPLED from the task key, so one saved value surfaces on every task
 * that references it (the starter `locate_water_shutoff` and the winter
 * `water_shutoff` both map to `water_main_shutoff`).
 *
 * This is the single source of truth for what may be captured and the shape of
 * each fact's structured detail. Every write goes through validateFactDetail()
 * so unknown facts or fields never reach the sensitive `home_records` table.
 * It mirrors the sanitize-on-write discipline of SYSTEM_QUESTIONS/sanitizeSystems
 * in profile.ts.
 *
 * Slice 1 added the registry + validation; Slice 2 added the homeowner write
 * route (api/home-care/record) plus the first-save consent constants below;
 * Slice 3 added the inline capture UI on the checklist (HomeCareRecordCapture,
 * prefilled via readHomeRecords in homeRecords.ts); Slice 4 adds the "My Home"
 * recap on the checklist - a collapsed summary of every saved detail with
 * view/edit/delete controls (delete via DELETE api/home-care/record), honoring
 * the "view or delete anytime" half of the consent promise; Slice 5 lifts
 * factValueSummary (below) into this pure registry so the recap and the booking
 * owner-alert rider (readBookedHomeDetails in homeRecords.ts) render a saved
 * detail identically. Per owner decision, v1 captures locations + a few
 * appliance details (brand/model/install year/filter size) but NOT serial
 * numbers.
 */

export type FactKind = 'location' | 'appliance';

export interface FactField {
  key: string;
  label: string;
  type: 'text' | 'year';
  /** Max length for text fields (ignored for year). */
  max?: number;
  placeholder?: string;
}

export interface HomeFact {
  /** Canonical fact slug, stored in home_records.fact_key. Decoupled from task keys. */
  key: string;
  label: string;
  kind: FactKind;
  /** Prompt shown in the capture panel. */
  prompt: string;
  /** Structured fields for 'appliance' facts. 'location' facts capture free-text `note` only. */
  fields: FactField[];
  /** Real maintenance_catalog / guide task keys whose row shows this fact's capture affordance. */
  taskKeys: string[];
}

/** Max length of a free-text location note. */
export const MAX_NOTE = 500;
const MIN_YEAR = 1900;

/**
 * Consent for saving sensitive home details. Logged to consent_logs on the
 * homeowner's first save (separate from the Home Care opt-in and any marketing
 * consent). The text is the single source of truth: the capture UI shows it and
 * the server logs this exact string, so the recorded consent matches what the
 * homeowner saw. v1 scope is locations + appliance makes/models (no photos, no
 * serial numbers); update this text when the photo slice ships.
 */
export const HOME_DETAILS_CONSENT_TYPE = 'home_care_home_details';
export const HOME_DETAILS_CONSENT_TEXT =
  "I'm choosing to save details about my home, like where my water, gas, and electrical shut-offs are and my appliance makes and models, so La Vaca's team can help faster when I book service. I understand La Vaca staff who work on my home can see these details, that I can view or delete them anytime from my Home Care account, and that they're deleted when I leave the program.";

// Registry. Every taskKey below is a real, verified maintenance_catalog key.
export const HOME_FACTS: HomeFact[] = [
  // --- Locations (free-text note; no structured detail) ---
  {
    key: 'water_main_shutoff',
    label: 'Water main shut-off',
    kind: 'location',
    prompt: 'Where is it? (a sentence is plenty)',
    fields: [],
    taskKeys: ['locate_water_shutoff', 'water_shutoff'],
  },
  {
    key: 'gas_shutoff',
    label: 'Gas shut-off & meter',
    kind: 'location',
    prompt: 'Where are the gas meter and shut-off valve?',
    fields: [],
    taskKeys: ['find_gas_shutoff'],
  },
  {
    key: 'electrical_panel',
    label: 'Electrical panel',
    kind: 'location',
    prompt: 'Where is the main breaker panel?',
    fields: [],
    taskKeys: ['label_breaker_panel'],
  },
  {
    key: 'outdoor_faucet_shutoffs',
    label: 'Outdoor faucet shut-offs',
    kind: 'location',
    prompt: 'Where are the indoor shut-off valves for the outdoor faucets?',
    fields: [],
    taskKeys: ['winterize_faucets'],
  },
  {
    key: 'ac_condenser_disconnect',
    label: 'A/C condenser disconnect',
    kind: 'location',
    prompt: 'Where is the outdoor A/C power disconnect?',
    fields: [],
    taskKeys: ['rinse_ac_condenser'],
  },
  {
    key: 'air_handler',
    label: 'Air handler & condensate line',
    kind: 'location',
    prompt: 'Where is the air handler and its condensate drain?',
    fields: [],
    taskKeys: ['flush_ac_condensate'],
  },
  // --- Appliances (structured detail; no serial numbers in v1) ---
  {
    key: 'hvac_filter',
    label: 'HVAC filter size',
    kind: 'appliance',
    prompt: 'What size is your HVAC filter?',
    fields: [{ key: 'filter_size', label: 'Filter size', type: 'text', max: 20, placeholder: '20x25x1' }],
    taskKeys: ['know_hvac_filter', 'replace_hvac_filter'],
  },
  {
    key: 'hvac_system',
    label: 'Heating & cooling system',
    kind: 'appliance',
    prompt: 'A few details help us bring the right parts.',
    fields: [
      { key: 'brand', label: 'Brand', type: 'text', max: 60, placeholder: 'Carrier' },
      { key: 'model', label: 'Model', type: 'text', max: 60 },
      { key: 'install_year', label: 'Installed (year)', type: 'year', placeholder: '2016' },
    ],
    taskKeys: ['hvac_furnace_tuneup', 'hvac_ac_tuneup'],
  },
  {
    key: 'water_heater',
    label: 'Water heater',
    kind: 'appliance',
    prompt: 'A few details help us bring the right parts.',
    fields: [
      { key: 'brand', label: 'Brand', type: 'text', max: 60, placeholder: 'Rheem' },
      { key: 'model', label: 'Model', type: 'text', max: 60 },
      { key: 'install_year', label: 'Installed (year)', type: 'year', placeholder: '2018' },
    ],
    taskKeys: ['flush_water_heater'],
  },
];

// Lookups built once from the registry.
const BY_KEY: Map<string, HomeFact> = new Map(HOME_FACTS.map((f) => [f.key, f]));
const BY_TASK: Map<string, HomeFact> = new Map();
for (const f of HOME_FACTS) {
  for (const tk of f.taskKeys) BY_TASK.set(tk, f);
}

/** The fact with this canonical key, or undefined. */
export function getFact(factKey: string): HomeFact | undefined {
  return BY_KEY.get(factKey);
}

/** The fact a given checklist/guide task should offer to capture, or undefined. */
export function getFactForTask(taskKey: string): HomeFact | undefined {
  return BY_TASK.get(taskKey);
}

/** Whether a task row should show a capture affordance. */
export function isCaptureTask(taskKey: string): boolean {
  return BY_TASK.has(taskKey);
}

/** A saved fact's value: free-text `note` (locations) and/or structured `detail` (appliances). */
export interface FactValue {
  note: string | null;
  detail?: Record<string, unknown> | null;
}

/**
 * One-line human summary of a saved fact's value. Shared by the checklist "My
 * Home" recap and the booking owner-alert rider (Slice 5), so both render a
 * saved detail identically. Location facts show their note; appliance facts join
 * their filled fields (then any note) with a middot separator. Pure - depends
 * only on the registry and the {note, detail} shape - so it stays importable by
 * both client and server.
 */
export function factValueSummary(fact: HomeFact, val: FactValue): string {
  if (fact.kind === 'location') return val.note ?? '';
  const parts = fact.fields
    .map((f) => val.detail?.[f.key])
    .filter((v) => v != null && v !== '')
    .map(String);
  const base = parts.join(' · ');
  if (val.note) return base ? `${base} · ${val.note}` : val.note;
  return base;
}

export interface FactValidation {
  ok: boolean;
  cleaned: Record<string, string | number>;
  error?: string;
}

/**
 * Validate + clean a fact's structured detail on the write path.
 *
 * An unknown `factKey` is rejected outright (the chokepoint that keeps junk
 * facts out of the sensitive table). Within a known fact, unknown fields are
 * dropped and known fields are capped/coerced rather than rejected - the same
 * lenient "never lose the save over one bad field" discipline as the lead
 * sanitizer. Location facts declare no fields, so their cleaned detail is {}.
 */
export function validateFactDetail(factKey: string, detail: unknown): FactValidation {
  const fact = BY_KEY.get(factKey);
  if (!fact) return { ok: false, cleaned: {}, error: `unknown fact_key: ${factKey}` };

  const cleaned: Record<string, string | number> = {};
  const src: Record<string, unknown> =
    detail && typeof detail === 'object' && !Array.isArray(detail) ? (detail as Record<string, unknown>) : {};
  const maxYear = new Date().getFullYear() + 1;

  for (const field of fact.fields) {
    const raw = src[field.key];
    if (raw == null || raw === '') continue;
    if (field.type === 'year') {
      const n = typeof raw === 'number' ? raw : parseInt(String(raw).trim(), 10);
      // Out-of-range / non-numeric years are dropped (lenient), not hard-failed.
      if (Number.isInteger(n) && n >= MIN_YEAR && n <= maxYear) cleaned[field.key] = n;
    } else {
      const s = String(raw).trim().slice(0, field.max ?? 200);
      if (s) cleaned[field.key] = s;
    }
  }
  return { ok: true, cleaned };
}

/** Trim + cap a free-text location note. */
export function sanitizeNote(note: unknown): string {
  return typeof note === 'string' ? note.trim().slice(0, MAX_NOTE) : '';
}
