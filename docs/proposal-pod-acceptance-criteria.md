# Proposal page pod, slice 1 - acceptance criteria

Slice 1 of the proposal page pod, from section 3 of the website spec (`02-website-nextjs.md` - the owner's spec, held outside this repo, so this file is the tracked record of what WEB-020 and WEB-021 were built to).
Approved from the plan artifact of 3 Aug 2026, with five owner decisions taken on it before any code was written.

## What ships here, and what deliberately does not

Schema, the CSV import contract, and the category registry.
**No UI and no route.** The client proposal page, the admin import preview and the submit path are later slices.

- `supabase/migrations/20260824000000_proposals.sql` - `proposals`, `proposal_lines`, `proposal_submissions`, the shared snapshot domain, and the sum function the submission total is checked against.
- `src/lib/proposals/csv.ts` - the estimator import contract: `parseProposalCsv`, `parsePriceCents`, and the caps all three layers share.
- `src/lib/proposals/categories.ts` - the keyword registry: `categorizeLine`, `iconForCategory`, `PROPOSAL_CATEGORIES`, `UNRECOGNIZED_CATEGORY`.
- `src/lib/proposals/token.ts` - `newProposalToken`, in its own module so the proposal libraries never import the intake session and the server-only Supabase config it pulls with it.
- `tests/proposal-pod.spec.ts` - AC1 to AC10 below.

Nothing in this slice writes any of the three tables.
That is why so many of the rules below live in the schema rather than in the code that will eventually write it: a rule the first writer has to remember is a rule that fails silently the day somebody forgets.

## Owner decisions on record

- **D1** The AI Estimator (a separate repo) grows a client-safe three-column export - `title,description,price`, with the blended price already applied.
  The website must **never** import the internal cost sheet, whose crew days and day rates are the margin math this pod exists to exclude.
  That is what the parser's required-header guard enforces (AC4).
- **D2** Toggles are include or exclude per optional line. Nothing else is client-editable.
- **D3** Proposal links have no expiry. Revocation is an explicit admin act, recorded as `status = 'revoked'`.
- **D4** Re-submits are allowed. `proposal_submissions` keeps every submission rather than replacing one.
- **D5** The booking-link slot ships later, with the client page.

## AC1 - A valid export parses to positioned lines in integer cents

- The header row is required, and is exactly `title,description,price`, case-insensitive.
- Lines keep the file's order in a 0-based `position`, because the page renders the estimate in the order it was built.
- `$3,650.00` parses to `365000` and `2900.50` to `290050`. Money never leaves integer cents.

## AC2 - RFC 4180 quoting, including the shapes a hand-edited file has

Quoted fields may carry commas, doubled quotes and newlines.
Beyond that, the sub-criteria are all one defect class: a corrupted value that parses to a clean three-column row, at the right price, reporting success.

- **AC2b** A quote with text already in front of it is data, not a wrapper, so `Tile 12" x 24" porcelain` keeps both inch marks. Reading them as field quoting deleted them and shipped a corrupted title.
- **AC2d** A quoted field that closes part-way through its column is reported, never repaired: only the admin knows whether the quote or the wrapping was the mistake. Correctly doubled (`"36"" wide vanity"`), the same value is accepted.
- **AC2f** Whitespace around a quoted field is separator on **both** sides, so `a, "b, c" ,d` parses. Whitespace is the only thing tolerated after a closing quote; real text stays the loud failure.
- **AC2e** Newlines inside a quoted field normalize to `\n`, so an Excel CRLF export carries no stray carriage return onto the client page. A leading BOM is dropped rather than failing the header check.
- **AC2c** Row numbers are the 1-based file lines the admin sees in their editor, counted across newlines inside quoted fields. Interior blank lines are reported rather than dropped, because dropping them renumbers every later error. A trailing newline is punctuation, not a row, while `,,` and `""` are rows the admin wrote and are validated as data.
- Both quoting faults are named at the line the quote **opened** on. When a file carries both, the earlier one is reported, so the admin fixes top-down rather than paying for a second import to find their first mistake.

## AC3 - Money is string-split, never floated

- `parsePriceCents` splits dollars and cents as strings, because `parseFloat('19.99') * 100` is `1998.9999999999998` and this is the number a client is quoted.
- `$12,345.67` and `12345.67` both parse; negatives, more than two decimals, and non-numbers do not.
- **AC3b** Thousands separators are validated before they are stripped, so they group the dollars in exact threes or there are none at all. Stripping every comma first read `3,00` as $300.00 and `12,34.56` as $1234.56 - a typo silently becoming a different, plausible number.
- **Any invalid line fails the whole parse.** An estimate with a silently dropped line is wrong money presented as right money, so the admin fixes the file and the importer stores nothing.

## AC4 - The wrong-file guard

- The header must match `title,description,price` exactly and positionally, so a rearranged file fails loudly.
- The estimator's internal cost sheet has a different header, is rejected, and the error says so in those words.
- This is D1 in the code: the columns that carry margin can never reach this database by accident.

## AC5 - Finish selections toggle, structure stays locked

- Finish keywords - cabinets, countertops, tile, fixtures, lighting, hardware, appliances - default to optional.
- Structural keywords - demolition, prep and substrate, rough plumbing, rough electrical, mechanical, compliance, painting, finish carpentry - are locked.
- **A title the registry does not recognize is locked.** A typo can never make demolition optional.
- Matching is on the line title only, case-insensitive, and word-aware, so a keyword never matches a fragment inside a longer word.
  A locked keyword also answers for the forms English inflects from it; an optional keyword answers for itself and its plural and nothing wider, because reading those wider could invent a client selection.
- Ties settle in two steps: a hit swallowed by a longer hit is dropped (`disposal` inside `garbage disposal`), and then structure wins over any optional hit whatever the keyword lengths are. `Demolition of old cabinets` stays locked.
- **AC5d** A verb of manner - `relocate`, `move`, `shift`, `reroute`, `reset`, `reinstall` - locks the line on its own, and a trade's vocabulary only picks which locked slug and WEB-024 icon the line wears.
- **AC5e** Every word a trade lists under `serves` is a keyword of an optional category, so a word that labels without locking can only ever name a client's own selection.
- **AC5b** Word-aware matching is asserted directly: `range` is not `Arrange`, and `stripes` is not the demolition verb `strip`.
- **AC5c** The registry is frozen and hands out fresh verdict objects, so the per-line override the admin makes in the import preview cannot travel back into the fail-safe.
- The vocabulary is non-exhaustive, and a missing word is not free.
  A structural line almost always names the finish it acts on, so a gap resolves the wrong way - optional, with a plausible badge - rather than falling through to the locked default, and every phrasing found resolving that way is worth a keyword.
  What makes the remaining gaps survivable is the admin review in the import preview, not this registry.

## AC6 - The registry is the only source of the WEB-024 icon

- Every category carries a lucide icon name (never emoji, per house rule), and `iconForCategory` is the only way to it.
- A parsed line stores the category slug and nothing else of the verdict, so no second copy of the icon can drift.
- The unrecognized verdict **is** the registry's generic locked category rather than a second literal of it, so one slug cannot answer with two different icons.

## AC7 - The schema is deny-by-default, and says what code cannot

- All three tables have RLS **enabled with zero policies**, the same posture as `home_records`: blended prices are one client's private business, and the publishable key ships in the browser bundle.
  The only gate that may serve a proposal is application code resolving the token server-side. No permissive anon policy, ever.
- Money is `BIGINT` integer cents everywhere, never float and never numeric-with-rounding: the client page sums in the browser (WEB-023) and the server re-sums at submit, and the two must agree to the cent.
- One price cap in three layers - the parser's `MAX_PRICE_CENTS` ($10,000,000), the `proposal_lines.price_cents` check, and the snapshot domain - so none of the three can disagree about what a line may cost.
- **AC7b** A submission snapshots the whole agreed composition, not bare line ids and not the client's toggles alone.
  A CSV re-import replaces `proposal_lines` wholesale, so ids stop resolving and no FK can hold them, while D4 keeps every submission as the record of what was agreed.
  Each element carries `{id, title, price_cents, optional}`, checked per element by one shared domain, at whole cents and under the same cap.
  `included_lines` must carry at least one element, `touched_lines` may legitimately be empty, and `total_cents` is checked to be the snapshot's own sum through a function the constraint calls - a function revoked from `anon` and `authenticated` so PostgREST does not publish it as an RPC.
- **AC7c** Revocation is the status column, and the timestamps cannot contradict it: `revoked_at` is set when and only when the status says revoked, and a `sent` proposal must carry its `sent_at`.
  `updated_at` is maintained by triggers on both tables, because a CSV re-import writes only the child rows and would otherwise leave a corrected estimate reading as untouched since the day it was created.
- `proposal_lines` cascades from its proposal; `proposal_submissions` **restricts**, so deleting a proposal that carries submissions fails loudly and the admin deletes them first, deliberately.
  `proposals.lead_id` is `ON DELETE SET NULL`, so deleting a lead never destroys a priced record.
- Nothing is created behind an existence guard.
  A guard asks only whether the name exists and cannot see that the shape moved on, so re-applying this file is meant to fail loudly.
  Once it has landed in a database that keeps it, it is frozen, and every further change to the proposal schema goes in a new migration with a later timestamp.

## AC8 - The link token

- 32 random bytes, base64url, the same recipe as the intake chat session token.
- The column is CHECKed against that recipe - 43 characters of base64url - rather than merely documented as it.
  The token is the whole access control for the row, and plain `TEXT` accepts `''` and `abc`.
- D3 again: the token carries no lifetime of its own, so the lookup's only question is `status`.

## AC9 - Caps hold

At most 200 lines, a 200-character title, a 1000-character description, and $10,000,000 a line.
A residential estimate does not have 500 lines; a file that does is the wrong file.

## AC10 - House style

No em dash appears in the three modules, the migration, or `CLAUDE.md`.

## How the schema is verified

The gate runs lint and `tsc + next build`, and the ACs above assert over the migration's **text**, so nothing in the pipeline reads the DDL as SQL.
Every revision of the migration is therefore applied to a throwaway local Postgres and its constraints exercised there before that revision is called finished: the token recipe, the lifecycle pairs, the snapshot shape, the whole-cents and cap rules, the total-is-the-sum check, both `updated_at` triggers, and the delete that must fail while a submission exists.
The PR's Supabase Preview check then replays every migration on a real database before merge, and production is hand-applied at go-live with `supabase db query --linked`, the path proven for the My Home Systems launch.

## Running the checks

```sh
npx playwright test tests/proposal-pod.spec.ts
```

The assertions are pure functions and source text, so they need no credentials of their own.
The shared Playwright config still starts its two servers for the run, so build first, and see [`lead-intake-acceptance-criteria.md`](lead-intake-acceptance-criteria.md) for blanking the credentials that make a full local suite send real mail.

**No browser-level acceptance is claimed for this slice**, because no rendered surface exists in it - the same argument PR #72 made for the `home_records` schema slice.

## Out of scope for this slice

- The client proposal page, its toggles and its running total (WEB-022, WEB-023). Altering a locked line is refused at the API, on top of the snapshot shape defined here.
- The admin import preview, where a per-line category badge is overridden before a proposal is sent. Every gap the registry leaves is answered there.
- The submit route, and the owner alert that prints `total_cents`.
- The booking-link slot (D5).
- Client-facing analytics (WEB-027). `touched_lines` is the free early telemetry the schema reserves for it.
