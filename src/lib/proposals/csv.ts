/**
 * Proposal Page Pod - the CSV import contract (spec WEB-020).
 *
 * The estimator produces a CLIENT-SAFE three-column export - title,
 * description, price - where price is the blended number (owner decision D1:
 * margin math stays in the estimator and never reaches this codebase). This
 * parser is the single chokepoint between that file and proposal_lines.
 *
 * The header row is REQUIRED and must be exactly title,description,price
 * (case-insensitive, any order is NOT accepted - the contract is positional
 * beyond the header check so a rearranged file fails loudly). This is the
 * wrong-file guard: the estimator's OTHER export - the internal cost sheet
 * with crew days and day rates - has a different header and must never import,
 * because its columns are the margin math this table exists to exclude.
 *
 * ANY invalid line fails the WHOLE parse. An estimate with a silently dropped
 * line is wrong money presented as right money; the admin fixes the file, not
 * the importer.
 *
 * Money parses to INTEGER CENTS. "$12,345.67" and "12345.67" are both
 * accepted; negatives, more than two decimals, and non-numbers are not.
 * Arithmetic never touches floats: dollars and cents are split as strings.
 */
import { categorizeLine } from './categories';

export interface ParsedProposalLine {
  position: number;
  title: string;
  description: string;
  priceCents: number;
  /** Registry verdict; the admin can override per line in the import preview. */
  optional: boolean;
  category: string;
  icon: string;
}

/**
 * One shape for both outcomes rather than a discriminated union: this repo
 * compiles with strictNullChecks off, where TypeScript does not narrow unions,
 * so a union here would force casts on every consumer. `ok` is the verdict;
 * `lines` is empty unless ok, `errors` is empty when ok.
 */
export interface ProposalCsvResult {
  ok: boolean;
  lines: ParsedProposalLine[];
  errors: string[];
}

export const PROPOSAL_CSV_HEADER = ['title', 'description', 'price'] as const;

/** Caps: a residential estimate does not have 500 lines; a file that does is the wrong file. */
export const MAX_LINES = 200;
export const MAX_TITLE_CHARS = 200;
export const MAX_DESCRIPTION_CHARS = 1000;
/** $10,000,000.00 - above any job La Vaca prices through this page. */
export const MAX_PRICE_CENTS = 1_000_000_000;

/**
 * RFC 4180 field splitting: quoted fields may contain commas, doubled quotes
 * and newlines. Returns rows of raw string cells. Tiny and dependency-free on
 * purpose - the contract is three known columns, not arbitrary CSV.
 */
function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  // Normalize BOM away so the header check does not fail on an Excel export.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  // Trailing fully-empty rows (a final newline) are not data.
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * "$12,345.67" -> 1234567. Null when the value is not clean money.
 * String arithmetic only: parseFloat('19.99') * 100 is 1998.9999999999998,
 * and this table stores the number a client will be quoted.
 */
export function parsePriceCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\$/, '').replace(/,/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const dollars = m[1];
  const centsPart = (m[2] ?? '').padEnd(2, '0');
  const cents = Number(dollars) * 100 + Number(centsPart);
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

export function parseProposalCsv(text: string): ProposalCsvResult {
  const errors: string[] = [];
  const rows = splitCsv(text ?? '');
  if (rows.length === 0) return { ok: false, lines: [], errors: ['The file is empty.'] };

  const header = rows[0].map((c) => c.trim().toLowerCase());
  const expected = PROPOSAL_CSV_HEADER;
  const headerOk = header.length === expected.length && expected.every((h, i) => header[i] === h);
  if (!headerOk) {
    return {
      ok: false,
      lines: [],
      errors: [
        `Unexpected header "${rows[0].join(', ')}". This importer takes the estimator's `
        + `proposal export with exactly the columns: ${expected.join(', ')}. `
        + 'The internal cost-sheet export is deliberately not accepted here.',
      ],
    };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) return { ok: false, lines: [], errors: ['No lines after the header.'] };
  if (dataRows.length > MAX_LINES) {
    return { ok: false, lines: [], errors: [`${dataRows.length} lines - the cap is ${MAX_LINES}. Is this the right file?`] };
  }

  const lines: ParsedProposalLine[] = [];
  dataRows.forEach((cells, idx) => {
    const rowNo = idx + 2; // 1-based, counting the header
    if (cells.length !== expected.length) {
      errors.push(`Row ${rowNo}: expected ${expected.length} columns, got ${cells.length}.`);
      return;
    }
    const [rawTitle, rawDescription, rawPrice] = cells;
    const title = rawTitle.trim();
    const description = rawDescription.trim();
    if (!title) { errors.push(`Row ${rowNo}: empty title.`); return; }
    if (title.length > MAX_TITLE_CHARS) { errors.push(`Row ${rowNo}: title longer than ${MAX_TITLE_CHARS} characters.`); return; }
    if (description.length > MAX_DESCRIPTION_CHARS) { errors.push(`Row ${rowNo}: description longer than ${MAX_DESCRIPTION_CHARS} characters.`); return; }
    const priceCents = parsePriceCents(rawPrice);
    if (priceCents === null) { errors.push(`Row ${rowNo}: "${rawPrice.trim()}" is not a clean price.`); return; }
    if (priceCents > MAX_PRICE_CENTS) { errors.push(`Row ${rowNo}: price above the $10,000,000 cap.`); return; }
    const verdict = categorizeLine(title);
    lines.push({
      position: idx,
      title,
      description,
      priceCents,
      optional: verdict.optional,
      category: verdict.key,
      icon: verdict.icon,
    });
  });

  if (errors.length > 0) return { ok: false, lines: [], errors };
  return { ok: true, lines, errors: [] };
}
