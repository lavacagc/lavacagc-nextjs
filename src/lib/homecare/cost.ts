/**
 * La Vaca Home Care - the one cost label every surface renders.
 *
 * The monthly email and the live checklist page read the same
 * `maintenance_catalog.est_cost_low/high` columns, and each used to format them
 * itself. They disagreed: for a zero floor the email said "Consult with our
 * team" while the page said "up to $375" for the very same row, so a member who
 * clicked the email's CTA landed on a different price than the email quoted.
 * One function, both callers - the same reason the seasonal-reset rule lives in
 * `isRowCurrent` rather than being written out on each side.
 *
 * Pure and client-safe: `HomeCareChecklistClient` is a 'use client' component,
 * so nothing server-only may be imported here.
 */

/** Short enough to sit as one segment of the "badge · cost · blurb" meta line. */
export const CONSULT_COST = 'Consult with our team';

/** U+2013, the range dash. HTML email swaps it for `&ndash;`, text for a hyphen. */
export const COST_DASH = '–';

/**
 * "$150", "$150–$250", the consult copy when the catalog's low end is 0, or
 * null when there are no numbers worth quoting at all.
 *
 * A 0 low end is the catalog's way of saying "no meaningful floor" - four
 * active tasks carry one (roof_inspect, attic_check, winterize_faucets,
 * test_sump_pump) - not a price we can stand behind. Rendered literally it
 * gives "Inspect the roof · Pro job · $0–$375", which reads as a data error,
 * and quoting the ceiling alone anchors on a number for work nobody has
 * scoped. Both surfaces point those four at a conversation instead.
 */
export function costLabel(lo: number | null | undefined, hi: number | null | undefined): string | null {
  if (typeof lo !== 'number' || typeof hi !== 'number') return null;
  if (lo <= 0) return CONSULT_COST;
  return lo === hi ? `$${lo}` : `$${lo}${COST_DASH}$${hi}`;
}
