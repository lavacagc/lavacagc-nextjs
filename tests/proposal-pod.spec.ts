import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseProposalCsv, parsePriceCents, MAX_LINES } from '../src/lib/proposals/csv';
import {
  categorizeLine, iconForCategory, PROPOSAL_CATEGORIES, UNRECOGNIZED_CATEGORY,
} from '../src/lib/proposals/categories';
import { newProposalToken } from '../src/lib/proposals/token';

/**
 * Proposal Page Pod - Slice 1: schema + CSV contract + category registry
 * (spec WEB-020/WEB-021; owner-approved plan of 2026-08-03, all five decisions
 * on record in the plan artifact).
 *
 * No UI and no route ship in this slice, so these are pure-function and
 * source-contract assertions - the same shape home-care-records.spec.ts used
 * for its schema slice. The load-bearing claims: money parses to integer
 * cents with no float arithmetic, the wrong CSV (the estimator's internal
 * cost sheet) is rejected loudly, unknown line titles fail safe to locked,
 * and the three tables are deny-by-default.
 */

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const VALID_CSV = [
  'title,description,price',
  'Demolition & prep,"Gut to studs, disposal, protection",4800',
  'Plumbing rough-in,"Relocate drain, new valves","$3,650.00"',
  'Tile - heated floor upgrade,Porcelain + electric radiant mat,2900.50',
  'Vanity - double sink,"60"" semi-custom, quartz top",3400',
].join('\n');

test('AC1: a valid 3-column export parses to positioned lines in integer cents', () => {
  const res = parseProposalCsv(VALID_CSV);
  expect(res.errors).toEqual([]);
  expect(res.lines).toHaveLength(4);
  expect(res.lines.map((l) => l.position)).toEqual([0, 1, 2, 3]);
  expect(res.lines[0].priceCents).toBe(480000);
  expect(res.lines[1].priceCents).toBe(365000);
  expect(res.lines[2].priceCents).toBe(290050);
});

test('AC2: RFC 4180 quoting survives - embedded commas and doubled quotes', () => {
  const res = parseProposalCsv(VALID_CSV);
  expect(res.errors).toEqual([]);
  expect(res.lines[0].description).toBe('Gut to studs, disposal, protection');
  expect(res.lines[3].description).toBe('60" semi-custom, quartz top');
});

test('AC2b: a quote mid-field is data, not a wrapper - inch marks survive intact', () => {
  // The corruption this guards: treating the inch marks as field quoting parsed
  // to a clean 3-column row, deleted both quotes, and reported ok.
  const res = parseProposalCsv('title,description,price\nTile 12" x 24" porcelain,Sets in thinset,2900');
  expect(res.errors).toEqual([]);
  expect(res.lines[0].title).toBe('Tile 12" x 24" porcelain');
  expect(res.lines[0].priceCents).toBe(290000);

  // A field that really does open with a quote and never closes it fails loudly
  // rather than swallowing the rest of the file.
  const unterminated = parseProposalCsv('title,description,price\n"Cabinets,,1000\nTile,,2000');
  expect(unterminated.ok).toBe(false);
  expect(unterminated.errors[0]).toContain('Row 2');
  expect(unterminated.errors[0]).toContain('never closed');
});

test('AC2d: a quoted field that closes mid-column fails loudly, never absorbs the rest', () => {
  // The same corruption from the other side: a title that OPENS with an inch
  // mark and got wrapped. Absorbing the remainder shipped `3/4 plywood
  // subfloor"` in a clean 3-column row, at the right price, reporting ok.
  const subfloor = parseProposalCsv('title,description,price\n"3/4" plywood subfloor",Sets flat,2900');
  expect(subfloor.ok).toBe(false);
  expect(subfloor.lines).toEqual([]);
  expect(subfloor.errors[0]).toContain('Row 2');

  const vanity = parseProposalCsv('title,description,price\nCabinets,,1000\n"36" wide vanity",Shaker,3400');
  expect(vanity.ok).toBe(false);
  expect(vanity.errors[0]).toContain('Row 3');

  // A field that opens a quote and never closes it runs on until some later
  // stray quote ends it. The row to go fix is the one the quote OPENED on
  // (2), not the line the parser happened to notice on (4).
  const runOn = parseProposalCsv('title,description,price\nA,"unclosed,1000\nB,,2000\nC,"x",3000');
  expect(runOn.ok).toBe(false);
  expect(runOn.errors[0]).toContain('Row 2');
  expect(runOn.errors[0]).not.toContain('Row 4');

  // A file can carry both quote faults at once, and the two are independent:
  // row 2 closes mid-column, row 3 opens a quote that never closes. Testing
  // "never closed" first named row 3 and walked the admin past their first
  // mistake, costing a second fix-and-reimport round trip to find it.
  const bothFaults = parseProposalCsv('title,description,price\nA,"36" wide vanity",100\nB,"unclosed,200');
  expect(bothFaults.ok).toBe(false);
  expect(bothFaults.lines).toEqual([]);
  expect(bothFaults.errors[0]).toContain('Row 2');
  expect(bothFaults.errors[0]).not.toContain('Row 3');

  // Correctly doubled, the same value is accepted and keeps its inch mark.
  const doubled = parseProposalCsv('title,description,price\n"36"" wide vanity",Shaker,3400');
  expect(doubled.errors).toEqual([]);
  expect(doubled.lines[0].title).toBe('36" wide vanity');
});

test('AC2f: padding around a quoted field is separator on both sides, not part of the value', () => {
  // A hand-edited file writes `a, "b, c",d`. Holding the space against it kept
  // the wrapper as data: the value shipped with stray quotes around it when it
  // had no comma, and failed on the column count when it did.
  const padded = parseProposalCsv('title,description,price\nCabinets, "Shaker white soft close",1000');
  expect(padded.errors).toEqual([]);
  expect(padded.lines[0].description).toBe('Shaker white soft close');

  const paddedComma = parseProposalCsv('title,description,price\nTile, "a, b",100');
  expect(paddedComma.errors).toEqual([]);
  expect(paddedComma.lines[0].description).toBe('a, b');

  // The mirror hand-edit, `a,"b, c" ,d`. Rejecting the whole file over one
  // space after the closing quote - while accepting the same space before the
  // opening one - failed the same estimate depending on which side the admin
  // padded, and told them a value was running on when the remainder was blank.
  const trailing = parseProposalCsv('title,description,price\nTile,"a, b" ,100');
  expect(trailing.errors).toEqual([]);
  expect(trailing.lines[0].description).toBe('a, b');
  expect(trailing.lines[0].priceCents).toBe(10000);

  const bothSides = parseProposalCsv('title,description,price\nTile, "a, b" ,100');
  expect(bothSides.errors).toEqual([]);
  expect(bothSides.lines[0].description).toBe('a, b');

  // Including a quoted last column, where the padding runs to the line end.
  const atLineEnd = parseProposalCsv('title,description,price\nTile,,"100" \nCabinets,,200');
  expect(atLineEnd.errors).toEqual([]);
  expect(atLineEnd.lines[0].priceCents).toBe(10000);
  expect(atLineEnd.lines).toHaveLength(2);

  // ... and at end-of-file, on a CRLF export.
  const crlfEof = parseProposalCsv('title,description,price\r\nTile,,"100" \r\n');
  expect(crlfEof.errors).toEqual([]);
  expect(crlfEof.lines[0].priceCents).toBe(10000);

  // Whitespace is the ONLY thing tolerated after a closing quote. Real text is
  // the inch-mark corruption, and stays the loud failure.
  const runsOn = parseProposalCsv('title,description,price\nTile,"a, b" x,100');
  expect(runsOn.ok).toBe(false);
  expect(runsOn.lines).toEqual([]);
  expect(runsOn.errors[0]).toContain('Row 2');

  // The inch-mark rule is untouched: there is real text before that quote.
  const inches = parseProposalCsv('title,description,price\nTile 12" x 24" porcelain,,2900');
  expect(inches.errors).toEqual([]);
  expect(inches.lines[0].title).toBe('Tile 12" x 24" porcelain');

  // And a padded field that closes mid-column is still the loud failure.
  const ambiguous = parseProposalCsv('title,description,price\n "36" wide vanity",Shaker,3400');
  expect(ambiguous.ok).toBe(false);
  expect(ambiguous.lines).toEqual([]);
  expect(ambiguous.errors[0]).toContain('Row 2');
});

test('AC2e: newlines inside a quoted field normalize, so a CRLF export carries no stray CR', () => {
  const res = parseProposalCsv('title,description,price\r\nCabinets,"Shaker white\r\nsoft-close",1000\r\n');
  expect(res.errors).toEqual([]);
  expect(res.lines[0].description).toBe('Shaker white\nsoft-close');
  expect(res.lines[0].description).not.toContain('\r');

  // The row counter still tracks the file, so a later error names the real line.
  const later = parseProposalCsv('title,description,price\r\nCabinets,"one\r\ntwo",1000\r\nTile,,TBD\r\n');
  expect(later.ok).toBe(false);
  expect(later.errors[0]).toContain('Row 4');
});

test('AC2c: blank and empty rows fail with the row number the admin sees in their editor', () => {
  // Interior blank line on file line 3; the bad price is on file line 4.
  const res = parseProposalCsv('title,description,price\nCabinets,,1000\n\nTile,,TBD\n');
  expect(res.ok).toBe(false);
  expect(res.errors.some((e) => e.startsWith('Row 3') && e.includes('blank'))).toBe(true);
  expect(res.errors.some((e) => e.startsWith('Row 4') && e.includes('TBD'))).toBe(true);

  // ",," is a malformed data row, not whitespace: dropping it silently is the
  // dropped line this parser exists to prevent.
  const empty = parseProposalCsv('title,description,price\nCabinets,,1000\n,,\n');
  expect(empty.ok).toBe(false);
  expect(empty.errors[0]).toContain('Row 3');
  expect(empty.errors[0]).toContain('empty title');

  // A trailing newline is still punctuation, not a row.
  expect(parseProposalCsv('title,description,price\nCabinets,,1000\n\n').ok).toBe(true);

  // `""` is an empty value the admin WROTE, so it is a one-column data row and
  // must fail on the column count exactly as a bare `x` there does. A quoted
  // empty field leaves both scanner buffers empty, so testing those alone
  // dropped the row entirely and the file imported one line short - silently,
  // which is the one outcome this parser exists to refuse.
  const quotedEmptyLast = parseProposalCsv('title,description,price\nTile,,100\n""');
  expect(quotedEmptyLast.ok, 'a `""` last row is data, not a blank line').toBe(false);
  expect(quotedEmptyLast.lines).toHaveLength(0);
  expect(quotedEmptyLast.errors[0]).toContain('Row 3');
  expect(quotedEmptyLast.errors[0]).toContain('got 1');
  // Same row, same verdict, wherever it sits and however it is padded.
  expect(parseProposalCsv('title,description,price\nTile,,100\n"" ').errors[0]).toContain('Row 3');
  const quotedEmptyInterior = parseProposalCsv('title,description,price\n""\nTile,,100');
  expect(quotedEmptyInterior.ok).toBe(false);
  expect(quotedEmptyInterior.errors[0]).toContain('Row 2');
  // ... while a quoted empty CELL in a well-formed row is just an empty value.
  const quotedCell = parseProposalCsv('title,description,price\nTile,"",100');
  expect(quotedCell.ok).toBe(true);
  expect(quotedCell.lines[0].description).toBe('');
});

test('AC3: money is string-split, never floated, and dirty prices fail with their row number', () => {
  // The parseFloat trap this guards against: 19.99 * 100 === 1998.9999999...
  expect(parsePriceCents('19.99')).toBe(1999);
  expect(parsePriceCents('$12,345.67')).toBe(1234567);
  expect(parsePriceCents('0')).toBe(0);
  expect(parsePriceCents('12345.678')).toBeNull();
  expect(parsePriceCents('-500')).toBeNull();
  expect(parsePriceCents('TBD')).toBeNull();

  const res = parseProposalCsv('title,description,price\nCabinets,,TBD');
  expect(res.ok).toBe(false);
  expect(res.errors[0]).toContain('Row 2');
});

test('AC3b: malformed thousands grouping fails, it is never reinterpreted', () => {
  // Stripping every comma first read each of these as a different, plausible
  // number: "3,00" as $300.00 - a 100x misread of $3.00 - and "12,34.56" as
  // $1234.56. A typo in a hand-corrected file must reach the admin, not a client.
  expect(parsePriceCents('3,00')).toBeNull();
  expect(parsePriceCents('12,34.56')).toBeNull();
  expect(parsePriceCents('1,0,0')).toBeNull();
  expect(parsePriceCents(',100')).toBeNull();
  expect(parsePriceCents('1,')).toBeNull();

  // Correct grouping, and no grouping at all, both still parse.
  expect(parsePriceCents('12,345.67')).toBe(1234567);
  expect(parsePriceCents('1,234,567.89')).toBe(123456789);
  expect(parsePriceCents('1234567')).toBe(123456700);

  const res = parseProposalCsv('title,description,price\nCabinets,,"3,00"');
  expect(res.ok).toBe(false);
  expect(res.errors[0]).toContain('Row 2');
});

test('AC4: the internal cost sheet is rejected loudly - the wrong-file guard', () => {
  // Header shaped like the estimator's internal export (crew/day-rate columns).
  const costSheet = 'Task,Scope,Name,Qty,Unit,Days,Crew,DayRate,Materials,Labor,Total,Notes\n'
    + 'Task,Bath,Demo,1,job,2,2,850,300,3400,3700,';
  const res = parseProposalCsv(costSheet);
  expect(res.ok).toBe(false);
  expect(res.lines).toEqual([]);
  expect(res.errors[0]).toContain('title, description, price');
  expect(res.errors[0].toLowerCase()).toContain('cost-sheet');
});

test('AC5: finish keywords go optional, structure stays locked, unknown fails safe to locked', () => {
  expect(categorizeLine('Vanity - double sink').optional).toBe(true);
  expect(categorizeLine('Tile - heated floor upgrade').optional).toBe(true);
  expect(categorizeLine('Cabinet refacing').optional).toBe(true);
  expect(categorizeLine('Appliance package').optional).toBe(true);
  expect(categorizeLine('Demolition & prep').optional).toBe(false);
  expect(categorizeLine('Plumbing rough-in').optional).toBe(false);
  expect(categorizeLine('Permit & inspection').optional).toBe(false);
  // The fail-safe: nothing the registry knows -> locked.
  const unknown = categorizeLine('Zorble calibration');
  expect(unknown.optional).toBe(false);
  expect(unknown.key).toBe(UNRECOGNIZED_CATEGORY.key);

  // STRUCTURE WINS whenever a structural keyword is there as a whole word, no
  // matter how short it is against the finish noun beside it. Ranking keywords
  // by length instead unlocked every one of these, because "demo"/"gut"/
  // "debris"/"valve" are shorter than "cabinet"/"countertop"/"backsplash"/
  // "faucet"/"refrigerator" - the client got a toggle on the demolition.
  for (const locked of [
    'Demolition of old cabinets',
    'Gut kitchen cabinets',
    'Demo of existing vanity',
    'Debris removal - old countertops',
    'Demo backsplash',
    'Demo old counter top',
    'Valve and faucet replacement',
    'Refrigerator water supply line',
    // Taking-out work is written as a verb at least as often as a noun, and
    // every one of these titles also names a finish. A registry that knew only
    // "demolition" read the finish and handed the client a toggle on the demo.
    'Remove existing tile',
    'Removal of existing vanity',
    'Remove old cabinets',
    'Cabinet removal',
    'Removing old backsplash',
    'Strip out backsplash',
    'Rip out shower door',
    'Haul away old countertops',
    'Existing sink removal',
    'Tear out vanity',
    'Demolish existing wall',
    // Protection is prep, and it is the finish it protects that gets named.
    'Protect existing cabinets during work',
    'Protective covering over countertops',
    // Mechanical scope: a duct run, a roof penetration, a gas line, a drain
    // relocation. Every one of these titles also names the appliance or fixture
    // the work serves, and a registry with no word for venting, ducting or
    // moving a service read that noun and handed the client a toggle that
    // deletes the hole in the roof.
    'Range hood vent to exterior',
    'Hood ductwork through roof',
    'Vent hood exhaust duct',
    'Bath exhaust vent to roof',
    'Ductwork rerouting',
    'Vent stack rework',
    'Flue liner replacement',
    'Refrigerator water line',
    'Relocate range gas line',
    'Move gas line for range',
    'Move sink plumbing',
    'Shift toilet 12 inches',
    'Reroute waste line in ceiling',
    // LAYER 1: a verb of manner locks on its own, whatever it names. Gating the
    // lock on plumbing scope - so the verb only counted beside a plumbing noun -
    // left the finish noun as the only surviving hit and handed the client a
    // toggle on every one of these. Moving an outlet is electrical rough-in,
    // relocating a hood is a duct run and a hole in the roof, moving a vanity is
    // moving the drain. None of them is the client's to drop.
    'Move backsplash outlet',
    'Relocate outlet above countertop',
    'Relocate recessed lighting',
    'Relocate vent hood',
    'Relocate hood',
    'Move existing vanity',
    'Relocate medicine cabinet',
    'Move countertop slab',
    'Moving cabinets to garage',
    'Relocate towel bar',
    'Move refrigerator',
    'Relocate dishwasher',
    // The trade named plainly. "plumbing" and "electrical" only licensed a verb
    // before - they produced no hit of their own - so the fixture, light or
    // appliance in the same title answered for the whole line and the client
    // got a toggle on the rough-in.
    'Plumbing for farmhouse sink',
    'Plumbing work for new vanity',
    'New plumbing to island sink',
    'Electrical for undercabinet lighting',
    'Electrical rough for recessed lights',
    'Electrical work for new range',
    'Update electrical at backsplash outlets',
    'Rough carpentry at soffit',
    'Rough opening at soffit',
    // The fittings and the pipework, named without the trade. These words sat
    // in a second list that licensed a verb but produced no hit of its own, so
    // the finish noun in the same title answered for the whole line and the
    // client got a toggle that deletes a circuit, a receptacle or a pipe run.
    'New outlets at backsplash',
    'Add outlet for microwave',
    'Outlet and switch at vanity',
    'Receptacle above countertop',
    'Switch and dimmer for recessed lights',
    'Panel upgrade for new appliances',
    'New gas piping to range',
    'Pipe new water supply to island sink',
    'Trench and pipe for island sink',
    'Dedicated circuit for range',
    'Wire new dishwasher circuit',
    'Vanity plumbing connections',
    // The removal verbs in the particle form the estimator actually wrote.
    // Listing only "strip out"/"rip out"/"tear-out"/"haul away" locked those
    // exact phrasings and unlocked every neighbouring one, because the verb was
    // then no hit at all and the finish noun was the only one left.
    'Strip existing tile',
    'Strip and re-tile shower surround',
    'Rip up existing floor tile',
    'Tear off old backsplash',
    'Tear down existing vanity wall',
    'Haul out old vanity',
    'Pull out old cabinets',
    'Take out existing countertop',
    'Take down upper cabinets',
    'Dispose of old tile',
    // Substrate: what goes under or behind the finish, named after the finish.
    'Level floor under tile',
    'Backer board for tile',
    'Cement board behind tile',
    'Waterproof shower pan',
    // ... including making it good again, which is the same work written as a
    // verb: "framing" the noun never matched "Reframe", and nothing at all
    // matched a patch or a repair.
    'Reframe opening for refrigerator',
    'Reframe wall for new vanity',
    'Patch and repair wall behind vanity',
    // Painting and finish carpentry: two trades on essentially every proposal,
    // and the registry had no word for either. Both follow a finish and get
    // named after it, so the finish noun was the only hit and the client got a
    // toggle on work that happens whatever they choose - dropping the tile
    // upgrade does not stop the walls needing paint or the base going back on.
    'Prime and paint walls after tile',
    'Painting - two coats after tile',
    'Repaint bathroom after new tile',
    'Paint vanity and trim',
    'Touch up paint at cabinets',
    'Skim coat walls behind cabinets',
    'Caulk and seal at countertop',
    'Baseboard after floor tile',
    'Trim and casing around new vanity',
    'Crown molding at cabinets',
    'Shoe molding after tile',
    // Putting a fixture back is the tradesman's return trip, priced because the
    // finish went in. The finish is the selection; the return trip is not.
    'Reset toilet after tile',
    'Reinstall toilet after new tile',
  ]) {
    expect(categorizeLine(locked).optional, `"${locked}" must stay locked`).toBe(false);
  }
  expect(categorizeLine('Cabinet removal').key).toBe('demolition');
  expect(categorizeLine('Protect existing cabinets during work').key).toBe('prep');
  expect(categorizeLine('Range hood vent to exterior').key).toBe('mechanical');
  expect(categorizeLine('Move sink plumbing').key).toBe('plumbing_rough');
  expect(categorizeLine('Relocate range gas line').key).toBe('plumbing_rough');
  expect(categorizeLine('Shift toilet 12 inches').key).toBe('plumbing_rough');
  expect(categorizeLine('Plumbing for farmhouse sink').key).toBe('plumbing_rough');
  expect(categorizeLine('Electrical for undercabinet lighting').key).toBe('electrical_rough');
  // "rough" with no trade beside it is structural work, trade unstated - and a
  // trade named anywhere in the title claims the better slug off it.
  expect(categorizeLine('Rough opening at soffit').key).toBe(UNRECOGNIZED_CATEGORY.key);
  expect(categorizeLine('Electrical rough for recessed lights').key).toBe('electrical_rough');
  expect(categorizeLine('Rough carpentry at soffit').key).toBe('carpentry');
  expect(categorizeLine('Strip existing tile').key).toBe('demolition');
  expect(categorizeLine('Pull out old cabinets').key).toBe('demolition');
  expect(categorizeLine('Level floor under tile').key).toBe('prep');
  expect(categorizeLine('Waterproof shower pan').key).toBe('prep');
  expect(categorizeLine('New outlets at backsplash').key).toBe('electrical_rough');
  expect(categorizeLine('Receptacle above countertop').key).toBe('electrical_rough');
  expect(categorizeLine('Panel upgrade for new appliances').key).toBe('electrical_rough');
  expect(categorizeLine('Trench and pipe for island sink').key).toBe('plumbing_rough');
  expect(categorizeLine('New gas piping to range').key).toBe('plumbing_rough');
  expect(categorizeLine('Prime and paint walls after tile').key).toBe('painting');
  expect(categorizeLine('Caulk and seal at countertop').key).toBe('painting');
  expect(categorizeLine('Baseboard after floor tile').key).toBe('carpentry');
  expect(categorizeLine('Trim and casing around new vanity').key).toBe('carpentry');
  expect(categorizeLine('Reframe opening for refrigerator').key).toBe('prep');
  expect(categorizeLine('Patch and repair wall behind vanity').key).toBe('prep');
  // Putting the toilet back is the plumber's trip, so it wears their slug.
  expect(categorizeLine('Reset toilet after tile').key).toBe('plumbing_rough');
});

test('AC5e: a locked word either locks or names a client selection - there is no third state', () => {
  // The defect this closes, structurally. A locked category used to carry a
  // SECOND vocabulary list beside its keywords, and that list decided nothing
  // but the slug. Words that name the work itself sat in it - "outlet",
  // "receptacle", "pipe" - so they licensed a verb and produced no hit, and a
  // title like "New outlets at backsplash" had the finish noun as its only
  // surviving hit. The client got a toggle on the circuit.
  //
  // There is no second list now: the vocabulary that licenses a verb is
  // `keywords` plus `serves`, folded in code. `keywords` lock. `serves` is
  // label-only, and is safe to be label-only for exactly one reason - every
  // entry names a CLIENT SELECTION, which is what the optional categories exist
  // to hand over. This is that reason, asserted rather than left to review.
  const optionalKeywords = new Set<string>();
  for (const cat of PROPOSAL_CATEGORIES) {
    if (cat.optional) for (const keyword of cat.keywords) optionalKeywords.add(keyword);
  }
  let labelOnly = 0;
  for (const cat of PROPOSAL_CATEGORIES) {
    for (const finish of cat.serves) {
      labelOnly++;
      expect(
        optionalKeywords.has(finish),
        `"${finish}" labels ${cat.key} without locking, so it must be an optional category's `
        + 'keyword - a word that names WORK belongs in `keywords`, or the finish beside it '
        + 'answers for the line',
      ).toBe(true);
    }
  }
  expect(labelOnly, 'the label-only vocabulary should not quietly empty out').toBeGreaterThan(0);
  // Nothing licenses a verb on an OPTIONAL category: a verb of manner locks
  // (Layer 1), so a category that could not lock has no business claiming one.
  for (const cat of PROPOSAL_CATEGORIES) {
    if (cat.optional) {
      expect(cat.scopedKeywords, `${cat.key} is optional and must not claim a verb`).toHaveLength(0);
      expect(cat.serves, `${cat.key} is optional and serves nothing`).toHaveLength(0);
    }
  }
});

test('AC5d: a verb of manner locks on its own, and the subject noun only picks the slug', () => {
  // The two layers, and the whole point is that they are independent.
  //
  // LAYER 1 is the lock, and nothing gates it: every one of these is locked in
  // AC5 above on the strength of the verb alone. LAYER 2 is only which locked
  // category the line wears, because that slug drives the WEB-024 imagery on
  // the client page and the admin's documented override in the import preview
  // is the optional/locked badge, not the category.
  const outlet = categorizeLine('Relocate outlet and wiring');
  expect(outlet.key, 'relocating wiring is electrical, not plumbing').toBe('electrical_rough');
  expect(outlet.optional).toBe(false);
  expect(categorizeLine('Move backsplash outlet').key).toBe('electrical_rough');
  expect(categorizeLine('Relocate recessed lighting').key).toBe('electrical_rough');
  expect(categorizeLine('Move sink plumbing').key).toBe('plumbing_rough');
  expect(categorizeLine('Shift toilet 12 inches').key).toBe('plumbing_rough');
  expect(categorizeLine('Relocate vent hood').key).toBe('mechanical');
  // Bare "line" is in no plumbing list at all, or the word alone would put a
  // wrench on a duct run. The named runs - "gas line", "water line" - are
  // keywords, so they still answer plumbing without it.
  expect(categorizeLine('Move dryer vent line').key).toBe('mechanical');
  expect(categorizeLine('Relocate range gas line').key).toBe('plumbing_rough');
  // A verb naming no trade at all still LOCKS, and takes the generic slug - the
  // same one the unrecognized verdict carries, because it says the same thing.
  // "Move-in cleaning" locking is the accepted cost of Layer 1: one badge for
  // the admin to flip, against a toggle that deletes a gas line.
  for (const generic of [
    'Move-in cleaning', 'Moving and storage of furniture',
    'Relocate medicine cabinet', 'Move existing vanity', 'Relocate towel bar',
  ]) {
    const verdict = categorizeLine(generic);
    expect(verdict.key, `"${generic}" names no trade at all`).toBe(UNRECOGNIZED_CATEGORY.key);
    expect(verdict.optional, `"${generic}" still locks on the verb`).toBe(false);
  }
  // The subject noun is read anywhere in the title, not beside the verb, so a
  // line naming two trades takes the first in registry order. A wrong slug is
  // the most this layer can cost, and the line is locked either way.
  expect(categorizeLine('Install new sink and relocate lighting').optional).toBe(false);
  // A verb that is not scoped to any trade lets the real category answer:
  // rerouting ductwork is mechanical.
  expect(categorizeLine('Ductwork rerouting').key).toBe('mechanical');
});

test('AC5b: matching is word-aware - a swallowed keyword drops out, fragments never match', () => {
  // "disposal" is a demolition keyword, but here it is INSIDE the appliance
  // phrase "garbage disposal", so it is not evidence of demolition at all.
  // Locking this would strip the client's toggle on a kitchen appliance.
  const disposal = categorizeLine('Garbage disposal - InSinkErator');
  expect(disposal.key).toBe('appliances');
  expect(disposal.optional).toBe(true);
  // The same rule keeps the appliance a toggle where "vent" is part of its own
  // name: inside "vent hood" it is not evidence of duct work.
  const hood = categorizeLine('Vent hood - 36 inch stainless');
  expect(hood.key).toBe('appliances');
  expect(hood.optional).toBe(true);
  expect(categorizeLine('Range hood - stainless').key).toBe('appliances');
  // Containment is the whole exception: a structural keyword standing on its
  // own next to a longer finish phrase still wins.
  expect(categorizeLine('Demo of shower door').key).toBe('demolition');
  expect(categorizeLine('Refrigerator water supply line').key).toBe('plumbing_rough');
  // ... so the duct that same hood needs is structure, not a toggle.
  expect(categorizeLine('Vent hood ductwork to roof').optional).toBe(false);
  // ... while debris disposal is still demolition, and still locked.
  expect(categorizeLine('Disposal of demo debris').key).toBe('demolition');
  expect(categorizeLine('Disposal of demo debris').optional).toBe(false);

  // A keyword must never match inside a longer word: "range" is not "Arrange",
  // so this falls through to the locked fail-safe.
  const arrange = categorizeLine('Arrange delivery of materials');
  expect(arrange.key).toBe(UNRECOGNIZED_CATEGORY.key);
  expect(arrange.optional).toBe(false);

  // The removal verbs go in bare, but "pull" and "take" bare are the cabinet
  // hardware and "take delivery", so those two are listed as phrases. The
  // hardware stays the client's to drop.
  expect(categorizeLine('Cabinet pulls and knobs').optional).toBe(true);
  expect(categorizeLine('Hardware - matte black pulls').key).toBe('hardware');

  // Word-aware must not cost the registry its plurals.
  expect(categorizeLine('Cabinets - shaker white').key).toBe('cabinets');
  expect(categorizeLine('Cabinet pulls and knobs').key).toBe('cabinets');
  expect(categorizeLine('Backsplashes - subway').key).toBe('tile');

  // ... and the plural it tolerates is the one English forms from the keyword,
  // never a different word that happens to start with it. Offering every
  // keyword an "-es" as well as an "-s" read "stripes" as the demolition verb
  // "strip", which is fragment matching one letter further out.
  const stripes = categorizeLine('Tile stripes accent band');
  expect(stripes.key, '"stripes" is not the plural of "strip"').toBe('tile');
  expect(stripes.optional).toBe(true);
});

test('AC5c: the registry hands out copies - a per-line override cannot poison the fail-safe', () => {
  const verdict = categorizeLine('Zorble calibration');
  expect(verdict).not.toBe(UNRECOGNIZED_CATEGORY);
  // The documented consumer pattern: the admin flips one line in the preview.
  (verdict as { optional: boolean }).optional = true;
  // Every later unknown line must still come back locked.
  expect(categorizeLine('Blorp installation').optional).toBe(false);
  expect(UNRECOGNIZED_CATEGORY.optional).toBe(false);
  expect(categorizeLine('Vanity - double sink')).not.toBe(categorizeLine('Vanity - double sink'));
  // The registry itself is not a scratch object either.
  expect(Object.isFrozen(PROPOSAL_CATEGORIES)).toBe(true);
  expect(Object.isFrozen(PROPOSAL_CATEGORIES[0])).toBe(true);
  expect(Object.isFrozen(UNRECOGNIZED_CATEGORY)).toBe(true);
});

test('AC6: the registry is the only source of the WEB-024 icon', () => {
  for (const cat of PROPOSAL_CATEGORIES) {
    expect(cat.icon, `category ${cat.key} needs an icon`).toMatch(/^[a-z0-9-]+$/);
    expect(iconForCategory(cat.key)).toBe(cat.icon);
  }
  expect(UNRECOGNIZED_CATEGORY.icon).toMatch(/^[a-z0-9-]+$/);
  // An unknown slug resolves to the same icon as the unrecognized verdict.
  expect(iconForCategory('not-a-category')).toBe(UNRECOGNIZED_CATEGORY.icon);

  // The unrecognized verdict IS the registry's generic locked category, not a
  // second literal of it. Two copies could drift, and then one slug would answer
  // with two different icons: the registry's for "Move-in cleaning", which
  // matched a verb, and the constant's for "Zorble calibration", which matched
  // nothing at all.
  const generic = PROPOSAL_CATEGORIES.find((c) => c.key === UNRECOGNIZED_CATEGORY.key);
  expect(generic, 'the unrecognized slug must be a real registry category').toBeTruthy();
  expect(generic.icon).toBe(UNRECOGNIZED_CATEGORY.icon);
  expect(generic.optional).toBe(UNRECOGNIZED_CATEGORY.optional);
  expect(categorizeLine('Move-in cleaning').icon).toBe(categorizeLine('Zorble calibration').icon);

  // A parsed line stores the category slug and nothing else of the verdict:
  // a second copy of the icon on the row could only drift from the registry.
  const line = parseProposalCsv('title,description,price\nVanity - double sink,,3400').lines[0];
  expect(line.category).toBe('cabinets');
  expect(line).not.toHaveProperty('icon');
  expect(iconForCategory(line.category)).toBe('columns-3');
});

test('AC7: all three tables are deny-by-default - RLS on, zero policies, cents-only money', () => {
  const sql = read('supabase/migrations/20260824000000_proposals.sql');
  for (const t of ['proposals', 'proposal_lines', 'proposal_submissions']) {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    expect(sql).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`);
  }
  expect(sql).not.toMatch(/CREATE\s+POLICY/i);
  // Money is integer cents; a float/numeric money column must never appear.
  // Comments discuss those types by name, so only DDL lines are checked.
  const ddl = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  expect(ddl).toMatch(/price_cents\s+BIGINT/);
  expect(ddl).toMatch(/total_cents\s+BIGINT/);
  expect(ddl).not.toMatch(/NUMERIC|DECIMAL|FLOAT|REAL|MONEY/i);
});

test('AC7b: a submission snapshots the composition it agreed to (D4 survives a re-import)', () => {
  const sql = read('supabase/migrations/20260824000000_proposals.sql');
  // Only DDL: a comment promising the snapshot is what let bare ids stay green
  // here while the schema went on accepting them.
  const ddl = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  // Bare line ids would dangle the moment a CSV re-import replaces the rows.
  expect(ddl).not.toContain('included_line_ids');
  // The {id, title, price_cents} element shape is CHECKed per element by ONE
  // domain, so the API cannot persist a bare id and the two snapshot columns
  // cannot drift apart when the contract is next tightened. The clauses are read
  // out of the jsonpath the constraint actually runs, not matched loosely across
  // the file: a comment promising the shape is what let bare ids stay green here
  // once already.
  const at = ddl.indexOf('CREATE DOMAIN public.proposal_line_snapshot AS JSONB');
  expect(at, 'the snapshot shape belongs to one shared domain').toBeGreaterThan(-1);
  // Created unconditionally: a guard that asks only whether the NAME exists
  // cannot tell that the SHAPE moved on, so a database carrying an earlier
  // revision of this file would keep the weaker contract while the migration
  // tracker called it applied. Failing loudly on a second application is the
  // outcome worth having when the schema is the layer meant to outlive the code.
  expect(ddl, 'the snapshot domain must not be created behind an existence guard')
    .not.toMatch(/DO \$\$|pg_type/);
  const domain = ddl.slice(at);
  expect(domain).toMatch(/jsonb_typeof\(VALUE\)\s*=\s*'array'/);
  const [filter] = domain.match(/'\$\[\*\] \? \([^']*\)'/) || [];
  expect(filter, 'the domain needs a per-element jsonpath filter').toBeTruthy();
  expect(filter).toContain('@.id.type() == "string"');
  expect(filter).toContain('@.title.type() == "string"');
  expect(filter).toContain('@.price_cents.type() == "number"');
  expect(filter).toContain('@.price_cents >= 0');
  // The agreed composition is snapshotted WHOLE - every locked line as well as
  // the optional ones the client kept - so each element has to say which it was.
  // Without the marker the record cannot be read back apart, and without the
  // locked lines it was most of the money short of what was agreed.
  expect(filter, 'each snapshot element must mark whether the line was optional')
    .toContain('@.optional.type() == "boolean"');
  // JSONB is the one place agreed money escapes BIGINT, so the whole number is
  // demanded here too: without this clause {"price_cents": 1999.5} is a legal
  // snapshot and the browser's sum stops matching the server's re-sum.
  expect(filter, 'the domain must reject a fractional price_cents such as 1999.5')
    .toContain('@.price_cents.floor() == @.price_cents');
  // Both snapshot columns take the domain, so both carry the contract. A plain
  // JSONB column here would be one the check never reaches.
  expect(ddl).toMatch(/included_lines\s+public\.proposal_line_snapshot\s+NOT NULL/);
  expect(ddl).toMatch(/touched_lines\s+public\.proposal_line_snapshot\s*,/);
  // The domain constrains every element but never demands one, so "[]" cleared
  // NOT NULL and the shape check both. Since the composition is snapshotted
  // whole, every real submission carries the locked lines: an empty array is a
  // submission recording no agreement at all. The rule belongs to this column
  // alone - a client who touched nothing leaves touched_lines legitimately
  // empty, so the shared domain is the wrong place for it.
  const included = ddl.slice(ddl.indexOf('included_lines'), ddl.indexOf('total_cents'));
  expect(included, 'included_lines must reject an empty array')
    .toMatch(/CHECK \(jsonb_array_length\(included_lines\) >= 1\)/);
  const touched = ddl.slice(ddl.indexOf('touched_lines'), ddl.indexOf('ip_address'));
  expect(touched, 'touching nothing is a legitimate submission')
    .not.toContain('jsonb_array_length');
  // The total stays server-computed money, not a client number.
  expect(ddl).toMatch(/total_cents\s+BIGINT NOT NULL CHECK \(total_cents >= 0\)/);
});

test('AC8: the token is 32 random bytes base64url, the intake recipe', () => {
  const src = read('src/lib/proposals/token.ts');
  expect(src).toMatch(/randomBytes\(32\)\.toString\('base64url'\)/);
  expect(newProposalToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);

  // The column is CHECKed against that same recipe. The token is the whole
  // access control for a proposal - RLS denies the anon key outright - so plain
  // TEXT, which accepts '' and 'abc', leaves a guessable proposal one careless
  // writer away, and nothing in this slice writes the column yet.
  const ddl = read('supabase/migrations/20260824000000_proposals.sql')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  expect(ddl, 'a short or empty token must not be storable')
    .toMatch(/CHECK \(token ~ '\^\[A-Za-z0-9_-\]\{43\}\$'\)/);
});

test('AC9: caps hold - line count, title and description length', () => {
  const many = ['title,description,price',
    ...Array.from({ length: MAX_LINES + 1 }, (_, i) => `Line ${i},,100`)].join('\n');
  const res = parseProposalCsv(many);
  expect(res.ok).toBe(false);

  const longTitle = `title,description,price\n${'x'.repeat(201)},,100`;
  expect(parseProposalCsv(longTitle).ok).toBe(false);
});

test('AC10: no em dashes in the slice-1 modules or the tracked prose (house style)', () => {
  for (const p of [
    'src/lib/proposals/categories.ts',
    'src/lib/proposals/csv.ts',
    'src/lib/proposals/token.ts',
    'supabase/migrations/20260824000000_proposals.sql',
    // The standing instruction set every session loads; the rule holds there too.
    'CLAUDE.md',
  ]) {
    expect(read(p), `${p} must not contain an em dash`).not.toContain('—');
  }
});
