/**
 * Escape one CSV cell. Shared by every CSV export in the app - hand-rolled
 * `row.join(',')` exports have already shipped corrupted files (any comma in an
 * address shifts every following column).
 */
export function csvEscape(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // Neutralize spreadsheet formula injection: a cell starting with = + - @ or a
  // tab/CR executes as a formula when the export is opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
