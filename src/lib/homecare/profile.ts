/**
 * La Vaca Home Care — homeowner stage + progressive profiling.
 *
 * Two dimensions personalize a homeowner's plan:
 *  1. STAGE — where they are with this home (just bought, established, new build,
 *     selling). Drives which one-time "essentials" set they see and the intro copy.
 *  2. SYSTEMS — which things their home actually has (deck, lawn, central HVAC,
 *     pool, …), with a few smart follow-ups. Sharpens the seasonal checklist from
 *     "everyone's list" to "their list".
 *
 * Pure + testable so the checklist page, the setup wizard, and the newsletter cron
 * all personalize identically.
 */

/* ── Stage ─────────────────────────────────────────────────────────────────── */

export type Stage = 'just_bought' | 'established' | 'new_construction' | 'selling';

export interface StageDef {
  key: Stage;
  label: string;
  tagline: string;
  /** One-liner shown on the "your program" step. */
  intro: string;
}

export const STAGES: StageDef[] = [
  {
    key: 'just_bought',
    label: 'Just bought this home',
    tagline: 'New to this house',
    intro:
      "Congrats on the new place! We'll start you with a one-time “New Homeowner Essentials” set — shut-offs, re-keying, a baseline tune-up — then layer in the seasonal upkeep so nothing slips.",
  },
  {
    key: 'established',
    label: 'Established owner',
    tagline: 'Keep up the routine',
    intro:
      "You know your home — we'll keep you on top of the seasonal routine so the small stuff never turns into the expensive stuff.",
  },
  {
    key: 'new_construction',
    label: 'Newly built',
    tagline: 'New construction',
    intro:
      "A new build needs a lighter touch early on — settling checks, warranty-era reminders, and the seasonal basics so you protect the investment from day one.",
  },
  {
    key: 'selling',
    label: 'Getting ready to sell',
    tagline: 'Pre-listing prep',
    intro:
      "Let's get it show-ready. We'll prioritize curb appeal, quick-win repairs, and the things inspectors flag — alongside the seasonal must-dos.",
  },
];

export function getStage(key: string | null | undefined): StageDef | null {
  return STAGES.find((s) => s.key === key) ?? null;
}

/** Legacy homeowner_type ('first_time'|'experienced') → stage, for older rows. */
export function stageFromLegacyType(t: string | null | undefined): Stage | null {
  if (t === 'first_time') return 'just_bought';
  if (t === 'experienced') return 'established';
  return null;
}

/** The stages that get the one-time "essentials" (starter) tasks. */
export function stageShowsStarter(stage: Stage | null): boolean {
  return stage === 'just_bought' || stage === 'new_construction';
}

/* ── Systems (with smart follow-ups) ───────────────────────────────────────── */

export interface FollowUp {
  key: string; // stored under systems[key] as a string value
  label: string;
  options: { value: string; label: string }[];
}

export interface SystemQuestion {
  key: string; // boolean; matches catalog applies_to
  label: string; // "Do you have …"
  hint?: string;
  followups?: FollowUp[]; // asked only when the system is toggled on
}

export const SYSTEM_QUESTIONS: SystemQuestion[] = [
  {
    key: 'hvac',
    label: 'Central heating or cooling',
    hint: 'Forced-air furnace, central A/C, or a heat pump',
    followups: [
      {
        key: 'hvac_type',
        label: 'What type?',
        options: [
          { value: 'gas_furnace', label: 'Gas furnace' },
          { value: 'heat_pump', label: 'Heat pump' },
          { value: 'boiler', label: 'Boiler / radiators' },
          { value: 'electric', label: 'Electric' },
          { value: 'not_sure', label: 'Not sure' },
        ],
      },
      {
        key: 'hvac_age',
        label: 'Roughly how old?',
        options: [
          { value: 'lt5', label: 'Under 5 yrs' },
          { value: '5_10', label: '5–10 yrs' },
          { value: '10_15', label: '10–15 yrs' },
          { value: 'gt15', label: '15+ yrs' },
          { value: 'not_sure', label: 'Not sure' },
        ],
      },
    ],
  },
  {
    key: 'lawn',
    label: 'A lawn / grass',
    followups: [
      {
        key: 'sprinklers',
        label: 'In-ground sprinklers?',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
    ],
  },
  {
    key: 'deck',
    label: 'A deck or wood porch',
    followups: [
      {
        key: 'deck_material',
        label: 'Wood or composite?',
        options: [
          { value: 'wood', label: 'Wood' },
          { value: 'composite', label: 'Composite' },
        ],
      },
    ],
  },
  {
    key: 'sump_pump',
    label: 'A basement sump pump',
    followups: [
      {
        key: 'sump_backup',
        label: 'Battery backup?',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'not_sure', label: 'Not sure' },
        ],
      },
    ],
  },
  {
    key: 'fireplace',
    label: 'A fireplace or chimney',
    followups: [
      {
        key: 'fireplace_type',
        label: 'What kind?',
        options: [
          { value: 'wood', label: 'Wood-burning' },
          { value: 'gas', label: 'Gas' },
        ],
      },
    ],
  },
  { key: 'driveway', label: 'An asphalt driveway' },
  { key: 'pool', label: 'A pool or hot tub' },
  { key: 'septic', label: 'A septic system (not public sewer)' },
  { key: 'garage', label: 'A garage with an automatic door' },
];

/** Boolean system keys (the toggles). */
export const SYSTEM_KEYS = SYSTEM_QUESTIONS.map((q) => q.key);

/** "A few more details" — standalone personalization questions (not tied to a system). */
export const PROFILE_EXTRAS: FollowUp[] = [
  {
    key: 'year_band',
    label: 'About when was it built?',
    options: [
      { value: 'pre1960', label: 'Before 1960' },
      { value: '1960_1990', label: '1960–1990' },
      { value: '1990_2010', label: '1990–2010' },
      { value: 'post2010', label: '2010 or newer' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    key: 'priority',
    label: 'What matters most to you?',
    options: [
      { value: 'save_money', label: 'Save money long-term' },
      { value: 'avoid_emergencies', label: 'Avoid emergencies' },
      { value: 'curb_appeal', label: 'Keep it looking great' },
      { value: 'just_remind', label: 'Just remind me what to do' },
    ],
  },
];

/** Allowed follow-up value keys → their permitted values (for sanitizing). */
const FOLLOWUP_VALUES: Record<string, Set<string>> = (() => {
  const out: Record<string, Set<string>> = {};
  for (const q of SYSTEM_QUESTIONS) {
    for (const f of q.followups ?? []) out[f.key] = new Set(f.options.map((o) => o.value));
  }
  for (const f of PROFILE_EXTRAS) out[f.key] = new Set(f.options.map((o) => o.value));
  return out;
})();

export type SystemKey = string;
/** Stored profile systems: booleans for system keys + string follow-up answers. */
export type HomeSystems = Record<string, boolean | string>;

// Systems virtually every home has — their tasks always show, never gated.
const UNIVERSAL = new Set(['all', 'roof', 'water_heater', 'windows', 'exterior', 'plumbing', 'gutters']);
const SYSTEM_KEY_SET = new Set(SYSTEM_KEYS);

/** Keep only known boolean system keys + valid follow-up values from arbitrary input. */
export function sanitizeSystems(input: unknown): HomeSystems {
  const out: HomeSystems = {};
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    for (const key of SYSTEM_KEYS) {
      if (typeof obj[key] === 'boolean') out[key] = obj[key] as boolean;
    }
    for (const [fk, allowed] of Object.entries(FOLLOWUP_VALUES)) {
      const v = obj[fk];
      if (typeof v === 'string' && allowed.has(v)) out[fk] = v;
    }
  }
  return out;
}

/**
 * Does a `maintenance_catalog` response actually carry the column the stage
 * gate reads?
 *
 * The gate below is only as strong as `stages`, and PostgREST omits a key that
 * wasn't selected rather than returning null, so `filterTasksForProfile` reads
 * a forgotten `stages` as "applies to everyone". That is exactly how "get ready
 * to sell your house" became items 01 and 02 in every member's newsletter. The
 * type on each call site can't catch it (the response is an unchecked cast), so
 * every surface that fetches the catalog checks the shape it actually got and
 * fails loudly. One predicate rather than one per caller: a second copy is how
 * the email and the checklist page drifted apart in the first place.
 *
 * An empty catalog passes - there is nothing to leak, and each caller already
 * handles "no tasks" on its own terms.
 */
export function catalogCarriesStages(rows: readonly { stages?: string[] }[]): boolean {
  return rows.length === 0 || 'stages' in rows[0];
}

/**
 * Filter catalog tasks to a homeowner's systems + stage. With no systems yet
 * (null/empty) returns everything (full list + a prompt to personalize).
 */
export function filterTasksForProfile<T extends { applies_to: string[]; stages?: string[] }>(
  tasks: T[],
  systems: HomeSystems | null | undefined,
  stage?: Stage | null,
): T[] {
  return tasks.filter((t) => {
    // Stage gate: a task with a specific stages[] only shows for those stages.
    //
    // A member with NO stage yet sees only 'all' tasks. This fails closed on
    // purpose: the stage-specific tasks are pre-listing ("Consider a pre-listing
    // inspection") and new-construction ones, and showing "get ready to sell
    // your house" to someone who never said they're selling is worse than
    // showing them slightly less. Previously a null stage skipped the gate
    // entirely, so anyone who hadn't finished the questionnaire got all of them.
    if (Array.isArray(t.stages) && t.stages.length > 0 && !t.stages.includes('all')) {
      if (!stage || !t.stages.includes(stage)) return false;
    }
    // Systems gate: unset profile shows everything.
    if (!systems || Object.keys(systems).length === 0) return true;
    return t.applies_to.some(
      (a) => UNIVERSAL.has(a) || (SYSTEM_KEY_SET.has(a) && systems[a] === true),
    );
  });
}
