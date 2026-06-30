/**
 * La Vaca Home Care — progressive profiling.
 *
 * Homeowners toggle which systems their home has; that sharpens the checklist
 * from "everyone's list" to "their list". Pure filter so it's testable and
 * reusable by both the checklist page and the newsletter cron.
 */

/** The systems we ask about (they vary home to home). Keys match catalog applies_to. */
export const ASKABLE_SYSTEMS = [
  { key: 'hvac', label: 'Central A/C or forced-air heating' },
  { key: 'sump_pump', label: 'Sump pump' },
  { key: 'deck', label: 'Deck or wood patio' },
  { key: 'fireplace', label: 'Fireplace / chimney' },
  { key: 'lawn', label: 'Sprinkler / irrigation system' },
  { key: 'driveway', label: 'Asphalt driveway' },
] as const;

export type SystemKey = (typeof ASKABLE_SYSTEMS)[number]['key'];

// Systems virtually every home has — their tasks always show, never gated.
const UNIVERSAL = new Set(['all', 'roof', 'water_heater', 'windows', 'exterior', 'plumbing', 'gutters']);
const ASKABLE_KEYS = new Set<string>(ASKABLE_SYSTEMS.map((s) => s.key));

export type HomeSystems = Partial<Record<SystemKey, boolean>>;

/** Keep only the boolean askable-system keys from arbitrary input. */
export function sanitizeSystems(input: unknown): HomeSystems {
  const out: HomeSystems = {};
  if (input && typeof input === 'object') {
    for (const { key } of ASKABLE_SYSTEMS) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === 'boolean') out[key] = v;
    }
  }
  return out;
}

/**
 * Filter catalog tasks to a homeowner's systems. With no profile yet (null/empty),
 * returns everything (so they see the full list + a prompt to personalize).
 */
export function filterTasksForProfile<T extends { applies_to: string[] }>(
  tasks: T[],
  systems: HomeSystems | null | undefined,
): T[] {
  if (!systems || Object.keys(systems).length === 0) return tasks;
  return tasks.filter((t) =>
    t.applies_to.some((a) => UNIVERSAL.has(a) || (ASKABLE_KEYS.has(a) && systems[a as SystemKey] === true)),
  );
}
