/**
 * La Vaca Home Care - service-quote intake helpers (pure, testable).
 *
 * Where the services on a quote come from, in order of preference:
 *
 *  1. The lead the customer actually submitted. A Home Care booking writes its
 *     task keys into the lead message as `(tasks: clean_gutters,clean_dryer_vent)`
 *     - the structured `services` array is stripped before insert so it never
 *     reaches the leads table, which makes that marker the durable record.
 *  2. Their past requests, if you want to quote something older.
 *  3. The bookable catalog, for a walk-in who was never a Home Care member.
 *
 * Plus the history that makes a quote persuasive: when they last had each of
 * these done, which the checklist has been recording in
 * `homeowner_maintenance.completed_at` since launch and has never surfaced.
 */

/** A catalog row as the quote tool reads it. */
export interface ServiceCatalogRow {
  key: string;
  title: string;
  blurb: string;
  bookable: boolean;
  priority: number;
  est_cost_low?: number | null;
  est_cost_high?: number | null;
}

/** A completion row, as selected for the last-done lookup. */
export interface CompletionRow {
  task_key: string;
  status: string;
  completed_at?: string | null;
  completed_by?: string | null;
}

/**
 * Pull task keys out of a Home Care lead message.
 *
 * Matches `(tasks: a,b,c)` case-insensitively and tolerates spacing. Returns
 * `[]` for any message without the marker - a contact-form lead, say - rather
 * than guessing.
 */
export function parseTaskKeys(message: string | null | undefined): string[] {
  if (!message) return [];
  const m = /\(tasks:\s*([^)]*)\)/i.exec(message);
  if (!m) return [];
  return [...new Set(
    m[1]
      .split(',')
      .map((k) => k.trim())
      .filter((k) => /^[a-z0-9_]+$/i.test(k)),
  )];
}

/**
 * Resolve keys to catalog rows, preserving the order the customer asked for.
 * An unknown key is dropped: a stale key from an old lead should not render an
 * empty line on a quote.
 */
export function resolveServices(keys: string[], catalog: ServiceCatalogRow[]): ServiceCatalogRow[] {
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  return keys.map((k) => byKey.get(k)).filter((c): c is ServiceCatalogRow => !!c);
}

/** The dropdown for a customer with no lead: bookable services, highest priority first. */
export function bookableCatalog(catalog: ServiceCatalogRow[]): ServiceCatalogRow[] {
  return catalog.filter((c) => c.bookable).sort((a, b) => b.priority - a.priority);
}

/**
 * Most recent completion per task key.
 *
 * Only `status='done'` rows count - `booked` and `snoozed` are intentions, not
 * history. A task done in several seasons returns the newest, and rows with no
 * timestamp are ignored rather than being treated as "done at the epoch".
 */
export function lastDoneFor(rows: CompletionRow[]): Map<string, { at: Date; by: string }> {
  const out = new Map<string, { at: Date; by: string }>();
  for (const r of rows) {
    if (r.status !== 'done' || !r.completed_at) continue;
    const at = new Date(r.completed_at);
    if (Number.isNaN(at.getTime())) continue;
    const prev = out.get(r.task_key);
    if (!prev || at.getTime() > prev.at.getTime()) {
      out.set(r.task_key, { at, by: r.completed_by === 'lavaca' ? 'lavaca' : 'homeowner' });
    }
  }
  return out;
}

/** "last done Oct 2025" / "last done Oct 2025 by La Vaca" - for the admin picker. */
export function lastDoneLabel(entry: { at: Date; by: string } | undefined): string {
  if (!entry) return 'no record';
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][entry.at.getUTCMonth()];
  const stamp = `${month} ${entry.at.getUTCFullYear()}`;
  return entry.by === 'lavaca' ? `last done ${stamp} by La Vaca` : `last done ${stamp}`;
}

/** Default scope sentence from the chosen services, for the quote email. */
export function scopeSummaryFrom(services: { title: string }[]): string {
  const titles = services.map((s) => s.title);
  if (titles.length === 0) return '';
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
}
