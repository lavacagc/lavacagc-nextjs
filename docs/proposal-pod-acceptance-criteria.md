# Proposal page pod - acceptance criteria

The proposal page pod, from section 3 of the website spec (`02-website-nextjs.md` - the owner's spec, held outside this repo, so this file is the tracked record of what the pod was built to).
One section per slice: **slice 1** (WEB-020 and WEB-021, the schema and the import contract) runs to "Out of scope for slice 1", and **slice 2** (the admin import preview, bundles, and delivery) follows it at the foot of the file.

Slice 1 was approved from the plan artifact of 3 Aug 2026, with five owner decisions taken on it before any code was written.

## Slice 1 - what ships here, and what deliberately does not

Schema, the CSV import contract, and the category registry.
**No UI and no route.** The client proposal page, the admin import preview and the submit path are later slices - the import preview has since landed in slice 2, below.

- `supabase/migrations/20260824000000_proposals.sql` - `proposals`, `proposal_lines`, `proposal_submissions`, the shared snapshot domain, and the sum function the submission total is checked against.
- `src/lib/proposals/csv.ts` - the estimator import contract: `parseProposalCsv`, `parsePriceCents`, and the caps all three layers share.
- `src/lib/proposals/categories.ts` - the keyword registry: `categorizeLine`, `iconForCategory`, `PROPOSAL_CATEGORIES`, `UNRECOGNIZED_CATEGORY`.
- `src/lib/proposals/token.ts` - `newProposalToken`, in its own module so the proposal libraries never import the intake session and the server-only Supabase config it pulls with it.
- `tests/proposal-pod.spec.ts` - AC1 to AC10 below.

Nothing in this slice writes any of the three tables.
That is why so many of the rules below live in the schema rather than in the code that will eventually write it: a rule the first writer has to remember is a rule that fails silently the day somebody forgets.

## Owner decisions on record (taken at slice 1, binding on the pod)

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

## How the schema is verified (every slice of this pod)

The gate runs lint and `tsc + next build`, and the ACs assert over a migration's **text**, so nothing in the pipeline reads the DDL as SQL.
Every revision of every pod migration is therefore applied to a throwaway local Postgres and its constraints exercised there before that revision is called finished.
For 20260824000000 that is the token recipe, the lifecycle pairs, the snapshot shape, the whole-cents and cap rules, the total-is-the-sum check, both `updated_at` triggers, and the delete that must fail while a submission exists; slice 2's three migrations are held to the same rule, below.
That rule is what caught the one defect the third of them repairs, so it is doing the work it is here to do.
The PR's Supabase Preview check then replays every migration on a real database before merge, and production is hand-applied at go-live with `supabase db query --linked`, the path proven for the My Home Systems launch.

## Running the slice 1 checks

```sh
npx playwright test tests/proposal-pod.spec.ts
```

The assertions are pure functions and source text, so they need no credentials of their own.
The shared Playwright config still starts its two servers for the run, so build first, and see [`lead-intake-acceptance-criteria.md`](lead-intake-acceptance-criteria.md) for blanking the credentials that make a full local suite send real mail.

**No browser-level acceptance is claimed for slice 1**, because no rendered surface exists in it - the same argument PR #72 made for the `home_records` schema slice.
Slice 2 is where the browser half of the pod's acceptance begins.

## Out of scope for slice 1

- The client proposal page, its toggles and its running total (WEB-022, WEB-023). Altering a locked line is refused at the API, on top of the snapshot shape defined here. Still out of scope after slice 2 - it is slice 3.
- The admin import preview, where a per-line category badge is overridden before a proposal is sent. Every gap the registry leaves is answered there. **Shipped in slice 2.**
- The submit route, and the owner alert that prints `total_cents`. Slice 3, with the page that submits.
- The booking-link slot (D5). Slice 2 renders it in the delivery email when `NEXT_PUBLIC_BOOKING_URL` is set.
- Client-facing analytics (WEB-027). `touched_lines` is the free early telemetry the schema reserves for it.

---

## Slice 2 - the admin import preview, bundles, and delivery

Approved from the plan artifact of 4 Aug 2026, carrying the owner's mid-review bundle request and the mobile-first note, with the in-design decisions delegated.
This is the admin half of the pod: the estimator's CSV becomes a reviewed, priced proposal with a private link, and the lifecycle that link has.
The client-facing page it links to is **slice 3** and does not exist yet, which is why Send is refused rather than offered.

### Slice 2 - what ships here

- `src/app/vaca-mgmt/proposals/page.tsx` - Customers -> Proposals: the roster, and the importer whose preview runs entirely in the admin's browser (`parseProposalCsv` and the registry are pure, so nothing exists server-side until Create).
- `src/app/api/admin/proposals/route.ts` - the roster read and the create write.
- `src/app/api/admin/proposals/[id]/route.ts` - the lifecycle: `send`, `revoke`, `restore`, `reimport`.
- `src/lib/proposals/store.ts` - every server-side write, with the money and size rules re-checked above the schema so an admin gets a sentence rather than a constraint name.
- `src/lib/proposals/bundles.ts` - bundle composition, pure, shared by the preview and the tests.
- `src/lib/proposals/clientPage.ts` - `CLIENT_PAGE_LIVE`, the send guard.
- `src/lib/proposals/deliveryEmail.ts` - the delivery email.
- `src/lib/notify/supabase-rest.ts` - `supabaseRestCounted`, the counted GET the roster's truncation notice is built on.
- `supabase/migrations/20260825000000_proposal_bundles.sql`, `20260826000000_proposal_roster_counts.sql` and `20260827000000_proposal_bundle_check_guards.sql`.
- `src/components/admin/AdminSidebar.tsx` + `src/components/AdminContent.tsx` - the Customers -> Proposals entry and its tab. The **Crew** tab is fixed in passing: it had a sidebar entry with no content mounted behind it, so it rendered blank.
- `tests/proposal-pod-slice2.spec.ts`, `tests/proposal-pod-slice2-browser.spec.ts`, `tests/proposal-pod-slice2-evidence.spec.ts`.

### Decisions taken on the slice 2 plan

- **A bundle is one client-facing line**: the admin's name, ONE price (the members' sum), and the member titles as the "includes" list. Member **prices are admin-side only**, which is the feature's whole point, and the client render contract is pinned by AC9.
- **All or nothing inside a package.** A bundle carries one badge; there is no cherry-picking among its members.
- **Mobile-first bundling.** Tick rows and press Combine is the primary gesture; dragging one row onto another is a desktop nicety on top of it. Every control keeps the house 44px touch minimum.
  A line's **title** is what the admin picks it by when ticking rows to combine, so at phone widths titles wrap to two lines rather than ellipsising to a fragment that reads identically on two different lines - the owner's mobile note, and the 390px evidence capture is what surfaced it.
- **Send is refused until the page it links to exists.** `CLIENT_PAGE_LIVE` is a constant, not an env var, and slice 3 flips it in the same commit that adds `/proposal/[token]`, so the code that claims the page exists ships with the page. Copy link stays available throughout.
- **Restore to draft** is the way back from Revoke while re-sending cannot be one, and stays the right door afterwards: a proposal whose lines are wrong is repaired as a draft rather than re-sent to earn the right to fix it.
- **One door for discarding a preview.** Every path that would destroy composed work asks the same confirm, and Cancel leaves the box and the preview agreeing.

### The two facts a bundle keeps apart

- **Intrinsic** is a member's own locked/optional verdict, fixed when it was bundled: the registry's, as overridden per line by the admin beforehand. Nothing done to a bundle ever writes it.
- **Presentation** is the bundle row's own flag, initialized from the intrinsic facts (locked when any member is locked, the same fail-safe direction as the registry) and flippable afterwards, behind a confirm that **names the structural members** it would put behind a client toggle.
- Unbundling gives every member back its intrinsic verdict, so it can neither free structural work nor take away a selection the estimator marked optional. A member read back from storage has no intrinsic flag, and the registry re-badges it on the same fail-safe: unknown restores locked.
- Nesting flattens. Bundling a bundle re-uses its members, so members are always original CSV lines and a sum can never double-count.

### The lifecycle, and what it refuses

- A refused transition is a typed `ProposalConflictError` mapped to **409**, never a matched substring; anything else is a logged, generic 500, and a 404 means only "no such row" rather than an outage.
- **Re-import is refused on a revoked proposal**: restore it to draft first, so a dead link cannot be quietly repointed at new content. That guard is a read-then-write, so a revoke landing between the read and the swap still commits the re-import. The residual is **documented and accepted**: both actors are the same single-operator surface, a revoked link does not serve at all whatever its lines say, and the way back is a restore that puts the proposal in front of the admin as a draft. Closing it properly would mean a `SECURITY DEFINER` function this pod does not need. `store.ts` carries the same argument at the code.
- **Line replacement is compensated.** PostgREST gives no transaction across the DELETE and the INSERT, so the old rows are snapshotted and put back if the insert throws. When the restore fails too, the line count is read back and the log states what the proposal **actually** holds, because a failed restore does not prove it is empty.
- **Delivery comes before the status write**, so a failed send can never leave a proposal reading sent. The write is retried once, and a delivery whose status write still fails is reported as **delivered** with the repair named, rather than as an ordinary failure the admin would retry believing nothing went out.
- `updated_at` is never hand-maintained here. The triggers from 20260824000000 own it.

### The roster

- Counts come from `proposal_roster_counts` in Postgres, one row per proposal asked for, instead of fetching every line and submission and counting them in JS past PostgREST's max-rows cap.
- **Null is "not known right now", never zero.** A counts outage costs the roster its numbers and never its lifecycle controls, and the page says the counts are unavailable rather than printing zeros it cannot stand behind.
- The page is capped at `ROSTER_LIMIT` (200) and says when it stopped at the cap rather than at the estate, in **both** cases: with the exact total when `Content-Range` answers, and with the notice alone when it does not. Copy link, Re-import and Revoke are per row, so a proposal that silently fell off the page would be one whose live link could no longer be killed.
- Search is server-side over client name, email and title, so reachability does not depend on where a proposal sits in the order. Every filter-grammar and wildcard character is neutralized to a single `_`, a term of nothing but those matches nothing rather than everything, and a slow response that lands last never overwrites the search that replaced it.

### The delivery email

Warm sender, one job: put the client's private link in their hands, with the D5 booking line only when `NEXT_PUBLIC_BOOKING_URL` is set.
Every interpolated value, `href`s included, is escaped through the shared email shell.
It is a new `EmailCategory` (`proposal_delivery`), transactional, attributed to the admin who pressed Send.
The email plumbing itself - category, sender, preference posture, audit row - is recorded in [`../EMAIL_TRACKING_AND_PREFERENCES.md`](../EMAIL_TRACKING_AND_PREFERENCES.md), which owns it.

### The migrations

- `20260825000000_proposal_bundles.sql` - `proposal_lines.bundle_members` (an array of `{title, price_cents}`), its shape CHECK, and the arithmetic tie that a bundle's price **is** its members' sum. `proposal_bundle_total` is revoked from `PUBLIC`, `anon` and `authenticated` for the same reason `proposal_snapshot_total` is.
- `20260826000000_proposal_roster_counts.sql` - the roster aggregate, the upper bound the bundle shape CHECK was missing (200 members, the parser's `MAX_LINES`), and the two privilege repairs 20260825000000 cannot make itself now that it is frozen: an explicit `service_role` grant on `proposal_bundle_total` (Postgres checks EXECUTE at INSERT time for a function a CHECK calls, so without it a bundled line cannot be written at all) and its pinned empty `search_path`.
- `20260827000000_proposal_bundle_check_guards.sql` - all three bundle CHECKs (`proposal_lines_bundle_shape`, `proposal_lines_bundle_member_cap`, `proposal_lines_bundle_sum`) re-added under their own names, each with a `jsonb_typeof(bundle_members) <> 'array'` escape ahead of the array call inside it.
  Exercising the two files above on a local Postgres showed a `bundle_members` that is a JSON **object** being refused with SQLSTATE 22023 ("cannot get array length of a non-array") rather than a `check_violation` naming a constraint: the cap and the sum tie reached `jsonb_array_length` and `proposal_bundle_total` unguarded.
  The row was refused either way and `zod` validates before any write, so nothing bad ever landed; what was wrong is that the layer that exists to hold when a writer skips `zod` pointed that writer at nothing, non-deterministically, since Postgres evaluates a table's CHECKs in an unspecified order.
  Now `proposal_lines_bundle_shape` **owns** the non-array rejection - it is the constraint whose subject *is* the shape of `bundle_members`, so it alone answers `FALSE` for that input while the other two answer `TRUE` and stand down.
  The escape is a `CASE`, not a leading `AND`/`OR`: Boolean operators in Postgres are not a short-circuit guarantee, and the planner reordering operands is exactly how an unguarded array call surfaces.
  The shape CHECK is rewritten in that same form even though it was *observed* standing down, because it was standing down on a leading `AND` operand - the very thing the other two are being repaired for trusting, and one observed plan is not a guarantee about every plan.
  Every constraint's verdict on `NULL` and on every array input is unchanged, so a database that already validated these rows revalidates them to the same verdict.
- All three follow the pod's standing rule: applied to a throwaway local Postgres and their constraints exercised there before the revision was called finished, because the ACs can only assert over their **text**. Production is hand-applied at go-live, per "How the schema is verified" above.

### Where the slice 2 ACs live, and how to run them

The AC ids are carried by the test titles rather than restated here, so the contract stays traceable to what actually runs.

```sh
npx playwright test tests/proposal-pod-slice2.spec.ts            # pure modules, store, both routes
npx playwright test tests/proposal-pod-slice2-browser.spec.ts    # the importer and roster in a real browser
```

- `tests/proposal-pod-slice2.spec.ts` drives the pure modules, the store and both routes against a stubbed PostgREST, and holds the regression half of the owner's AC contract: `AC-R1` pins the full pre-slice sidebar inventory (adding Proposals removes nothing), `AC-R2` the untouched admin gate.
- `tests/proposal-pod-slice2-browser.spec.ts` owns every AC that only exists once React is mounted, and runs against a build; see [`lead-intake-acceptance-criteria.md`](lead-intake-acceptance-criteria.md) for blanking the credentials that make a full local suite send real mail.
- `tests/proposal-pod-slice2-evidence.spec.ts` is **capture only** and skipped unless `PROPOSAL_EVIDENCE=1` is set; its run recipe is in the file header.
- Driving the admin surfaces interactively against a local Supabase stack needs the **development-only** `connect-src` exception in `next.config.ts`, whose comment states its exact scope. The checked-in suite never needs it: Next resolves those headers at build time and Playwright serves a production build.

### Out of scope for slice 2

- `/proposal/[token]` itself, its toggles and its running total, and the submit route (WEB-022, WEB-023). Slice 3, which also flips `CLIENT_PAGE_LIVE`.
- Client-facing analytics (WEB-027).
- Retention of the records this slice creates is disclosed in the privacy policy (v2.7, `src/content/privacy-policy-content.md`), which owns it.
