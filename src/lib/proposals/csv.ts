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
  /**
   * Registry category slug, the only thing proposal_lines stores of the
   * verdict. The icon is NOT copied here: it is derived from this slug through
   * `iconForCategory` where it is rendered, so there is one source of truth to
   * drift from.
   */
  category: string;
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

/** One raw row plus the file line it starts on, so errors name the real line. */
interface RawRow {
  lineNo: number;
  cells: string[];
}

/**
 * A quoting fault, named at the line the offending quote OPENED on - the line
 * to go fix, which is not necessarily the line the parser noticed on.
 *
 * `unterminated`: the field opened and ran to end-of-file without its closing
 * quote. `dangling`: the field closed and the row carried on with more
 * characters.
 */
interface QuoteFault {
  kind: 'unterminated' | 'dangling';
  lineNo: number;
}

interface SplitCsvResult {
  rows: RawRow[];
  /**
   * The EARLIEST quoting fault in the file, or null when there is none. A file
   * can carry both kinds at once, and then the dangling one is always the
   * earlier: the scan leaves quote mode where a field closes mid-column, so any
   * field left unterminated afterwards can only have OPENED at or after that
   * line. Dangling therefore wins outright, and the choice belongs here, where
   * the scan knows both, rather than to the order the caller tests them in.
   */
  quoteFault: QuoteFault | null;
}

/**
 * A row that is a blank file line: one cell, nothing in it. A `,,` row is NOT
 * this - it has the column count of real data and an empty title, and it has to
 * reach validation rather than vanish.
 */
function isBlankLine(cells: string[]): boolean {
  return cells.length === 1 && cells[0].trim() === '';
}

/**
 * Whitespace that is not a line break: the padding a hand-edited file leaves
 * around a quoted field. The same class `cell.trim()` recognizes on the opening
 * side, so both ends of a field tolerate exactly the same thing.
 */
function isPad(ch: string): boolean {
  return ch !== undefined && ch !== '\n' && ch !== '\r' && ch.trim() === '';
}

/**
 * RFC 4180 field splitting: quoted fields may contain commas, doubled quotes
 * and newlines. Returns rows of raw string cells. Tiny and dependency-free on
 * purpose - the contract is three known columns, not arbitrary CSV.
 *
 * A `"` opens a field only where the field so far is blank. Once there is text
 * in it the quote is data: `Tile 12" x 24" porcelain` is a line title this
 * business writes constantly, and treating its inch marks as field quoting
 * silently deleted them and shipped a corrupted title at the right price.
 *
 * Blank means whitespace, not strictly empty as RFC 4180 reads it. `a, "b, c",d`
 * is what a hand-edited file looks like, and holding the padding against it kept
 * the quote characters as data - the value shipped with stray quotes around it
 * when it had no comma, and failed on the column count when it did. The padding
 * is separator, so it is dropped with the quote.
 *
 * That holds on BOTH sides of the field: `a,"b, c" ,d` is the same hand-edit
 * seen from the other end, so whitespace between the closing quote and the
 * comma or the line break is separator too, and is skipped. Whitespace is the
 * only thing tolerated there.
 *
 * Anything else after the closing quote of a quoted field is the corruption
 * this parser refuses. `"36" wide vanity",Shaker,3400` is the inch-mark
 * corruption from the other side - a title that opens with a measurement and
 * got wrapped - and absorbing the remainder shipped `36 wide vanity"` at the
 * right price. It is reported, not repaired: only the admin knows whether the
 * quote or the wrapping was the mistake. The judgement is theirs because real
 * text is genuinely ambiguous; a run of spaces never is.
 *
 * Both quoting faults are reported at the line the quote OPENED on, not where
 * the parser noticed. A field that opens a quote and never closes it runs on
 * until some later stray quote ends it, and naming that later line sends the
 * admin to a row that is not the problem.
 *
 * A file can carry both faults at once, and then the DANGLING one is reported,
 * because it is always the earlier of the two: quote mode ends where a field
 * closes mid-column, so a field left unterminated later in the file can only
 * have opened at or after the line the dangling one opened on. The admin fixes
 * the file top-down, and naming the later fault would send them past their
 * first mistake and back round for a second import to find it.
 *
 * Newlines inside a quoted field normalize to \n. Excel writes CRLF (the BOM
 * handling below is there for the same exports), and a raw \r kept mid-value
 * renders as a stray character on the client page.
 *
 * Rows carry the 1-based file line they START on - counted across newlines
 * inside quoted fields too - because the admin fixes the file, not the
 * importer, and a row number that does not match their editor sends them to
 * the wrong line.
 */
function splitCsv(text: string): SplitCsvResult {
  const rows: RawRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let lineNo = 1;
  let rowLineNo = 1;
  let quoteOpenedAt = 0;
  let danglingAt = 0;
  // Normalize BOM away so the header check does not fail on an Excel export.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else {
          let j = i + 1;
          while (isPad(src[j])) j++;
          const after = src[j];
          const closes = after === undefined || after === ',' || after === '\n' || after === '\r';
          // Padding is separator: consume it so the next pass lands on the
          // delimiter and none of it reaches the value.
          if (closes) i = j - 1;
          else if (danglingAt === 0) danglingAt = quoteOpenedAt;
          inQuotes = false;
        }
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        lineNo++;
        cell += '\n';
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      inQuotes = true;
      cell = '';
      quoteOpenedAt = lineNo;
    } else if (ch === ',') {
      cells.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      cells.push(cell); cell = '';
      rows.push({ lineNo: rowLineNo, cells }); cells = [];
      lineNo++;
      rowLineNo = lineNo;
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || cells.length > 0) { cells.push(cell); rows.push({ lineNo: rowLineNo, cells }); }
  // A trailing newline is punctuation, not a row. Interior blank lines are NOT
  // dropped: dropping them renumbered every later error.
  while (rows.length > 0 && isBlankLine(rows[rows.length - 1].cells)) rows.pop();

  // Dangling first, and unconditionally: it cannot be the later of the two.
  const quoteFault: QuoteFault | null = danglingAt > 0
    ? { kind: 'dangling', lineNo: danglingAt }
    : inQuotes ? { kind: 'unterminated', lineNo: quoteOpenedAt } : null;
  return { rows, quoteFault };
}

/**
 * "$12,345.67" -> 1234567. Null when the value is not clean money.
 * String arithmetic only: parseFloat('19.99') * 100 is 1998.9999999999998,
 * and this table stores the number a client will be quoted.
 *
 * Thousands separators are validated BEFORE they are stripped: they must group
 * the dollars in exact threes, or there must be none at all. Stripping every
 * comma first read "3,00" as $300.00 and "12,34.56" as $1234.56 - a hand-typed
 * slip in the file silently becoming a different, plausible number is exactly
 * the wrong-money-as-right-money failure the rest of this parser refuses.
 */
export function parsePriceCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\$/, '').trim();
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) return null;
  const dollars = m[1].replace(/,/g, '');
  const centsPart = (m[2] ?? '').padEnd(2, '0');
  const cents = Number(dollars) * 100 + Number(centsPart);
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

export function parseProposalCsv(text: string): ProposalCsvResult {
  // Every failure exit goes through here, so `lines` is empty on all of them by
  // construction. A partially parsed estimate is the wrong money this module
  // exists to refuse, and one exit forgetting `lines: []` would ship it.
  const fail = (...messages: string[]): ProposalCsvResult => ({ ok: false, lines: [], errors: messages });

  const errors: string[] = [];
  const { rows, quoteFault } = splitCsv(text ?? '');
  if (quoteFault !== null) {
    if (quoteFault.kind === 'unterminated') {
      return fail(
        `Row ${quoteFault.lineNo}: a quoted value opens here and is never closed. `
        + 'Every " that opens a field needs a matching " that closes it, and a '
        + 'quote inside a value must be doubled ("").',
      );
    }
    return fail(
      `Row ${quoteFault.lineNo}: a quoted value ends part-way through the column and `
      + 'the rest of it runs on. A " that closes a field must be followed by a '
      + 'comma or the end of the line, and a quote inside a value must be '
      + 'doubled ("") - `"36"" wide vanity"`, not `"36" wide vanity"`.',
    );
  }
  if (rows.length === 0) return fail('The file is empty.');

  const header = rows[0].cells.map((c) => c.trim().toLowerCase());
  const expected = PROPOSAL_CSV_HEADER;
  const headerOk = header.length === expected.length && expected.every((h, i) => header[i] === h);
  if (!headerOk) {
    return fail(
      `Unexpected header "${rows[0].cells.join(', ')}". This importer takes the estimator's `
      + `proposal export with exactly the columns: ${expected.join(', ')}. `
      + 'The internal cost-sheet export is deliberately not accepted here.',
    );
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) return fail('No lines after the header.');
  if (dataRows.length > MAX_LINES) {
    return fail(`${dataRows.length} lines - the cap is ${MAX_LINES}. Is this the right file?`);
  }

  const lines: ParsedProposalLine[] = [];
  dataRows.forEach(({ lineNo: rowNo, cells }) => {
    if (isBlankLine(cells)) {
      errors.push(`Row ${rowNo}: blank line. Remove it - every row must be ${expected.join(',')}.`);
      return;
    }
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
      position: lines.length,
      title,
      description,
      priceCents,
      optional: verdict.optional,
      category: verdict.key,
    });
  });

  if (errors.length > 0) return fail(...errors);
  return { ok: true, lines, errors: [] };
}
