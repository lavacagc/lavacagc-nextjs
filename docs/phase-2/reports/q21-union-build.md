# Q21 - Union County as a fourth county (build report)

Builder: Opus 5.5. Decision: `docs/decisions/006-phase-2-open-questions.md` Q21, Alex chose (a) serve Union County.
Branch: `phase2/q21-union`, cut from `feat/phase-2-admin-catalog-articles-experiments` at `fb48960`.
Nothing here is marked done by the builder; a reviewer verifies it.

## What changed

1. `COUNTIES` in `src/lib/home-services/catalog.ts` is now Essex, Morris, Bergen, Union.
   Everything typed or built on it follows by itself: the `County` type, the subs API's county enum, the Subs admin checkboxes, the Service JSON-LD `areaServed` (now four `AdministrativeArea` nodes), the SEO feedback route's `counties`, and the SEO1 spec's "every county in every description" check.
   `isServedCounty` in `requestsAdmin.ts` now reads `COUNTIES` instead of naming three counties.
   `TOWN_COUNTY` (used when a request has no ZIP) gains Westfield, Cranford, New Providence, Berkeley Heights, Scotch Plains, Springfield, Union and Elizabeth beside the Summit and Rahway it already had.
2. `src/lib/home-services/countyZips.ts` gains a `UNION` list of 30 ZIPs, wired into the same map, so the request-flow gate (browser and API both use `isInServiceArea`) accepts them.
3. Copy: the home-services i18n strings (`heroBody`, `trustArea`, `areaTowns`, `outOfArea`, `metaTitle`, `metaDescription`, `moreServicesTitle`) and all 14 service SEO titles and 14 SEO descriptions name the four counties.
   Each service also gains one Union keyword ("gutter cleaning Union County" and so on; 7 of the 10 allowed).
   The seed FAQs do not name counties, so there was nothing to change there.
4. Seed: `scripts/seed-home-services.ts` regenerated the INSERT, which replaces the seed block in `supabase/migrations/20261030000000_phase_2.sql`.
   That migration has not reached production (production's migration history stops in February 2026, see `docs/local-rig.md` and the rig memory), so editing it is allowed; a fresh database now seeds the four-county copy directly.
   New `supabase/migrations/20261030000005_union_county_copy.sql` brings a database that already ran the three-county seed to the same copy: one guarded `UPDATE` per changed column (`WHERE` the column still holds the exact three-county text, so an admin edit is never overwritten) and one per Union keyword (only when missing and fewer than 10 keywords).
5. The `service_area` content fact (`20260724000000_seo_autonomy_phase1.sql`) already reads "Northern New Jersey (Bergen, Essex, Morris, Union counties)"; kept as is.
6. The sitemap lists services, not counties, so it is unchanged; JSON-LD and the gate follow from `COUNTIES` and the ZIP map.
7. Tests: `articles-publish-guard.spec.ts` expects four counties from the feedback route; `home-services-landing.spec.ts` gains "Q21: Union County is served ..." (eight Union ZIPs map to Union and pass, Watchung 07069 and Basking Ridge 07920 in Somerset do not, `COUNTIES` is the four); `home-services-request-flow.spec.ts` gains "Q21: a Union County ZIP (07090 Westfield) is accepted at the API; 07920 Basking Ridge is still declined".

## ZIP source and conventions

Source: zip-codes.com, "Union County, NJ ZIP codes" (https://www.zip-codes.com/county/nj-union.asp), read 2026-10-29: 30 ZIPs, 26 standard and 4 PO box.
The existing map includes PO box ZIPs (for example 07961 to 07963 Morristown), so Union's four PO box ZIPs are in too: 07061 Plainfield, 07091 Westfield, 07207 Elizabeth, 07902 Summit.

The list differs from the one in the brief in four places:

- Elizabeth's own ZIPs are 07201, 07202, 07206, 07207 (PO box) and 07208.
  07203, 07204 and 07205 in the brief's "07201-07208" range are Roselle, Roselle Park and Hillside, which the brief also lists by name; each appears once.
- Winfield has no ZIP of its own; it is served by Linden's 07036, already in the list.
- Plainfield is 07060, 07062 and 07063, plus the PO box 07061.
  07060, 07062 and 07063 also deliver to North Plainfield (zip-codes.com and Wikipedia both list 07062 for it, added after review), which is in Somerset County; a five-digit ZIP cannot tell them apart, so a North Plainfield address reads as Union.
  This is the same trade-off the map already makes elsewhere, and is noted in the file.
- Summit includes the PO box 07902; Westfield the PO box 07091.

Final list: 07016, 07023, 07027, 07033, 07036, 07060, 07061, 07062, 07063, 07065, 07066, 07076, 07081, 07083, 07088, 07090, 07091, 07092, 07201, 07202, 07203, 07204, 07205, 07206, 07207, 07208, 07901, 07902, 07922, 07974.
None overlaps the Essex, Morris or Bergen lists (a `Map` would let the later county win silently; the spec checks eight of them map to Union).

## Copy, re-fit to the limits

Titles must stay at 60 characters including " | La Vaca" when that is added, and descriptions at 160; the landing title must be under 60.
Four county names are 7 characters longer than three, so every title was rewritten rather than extended; the longest is now exactly 60 and every description is 159 or less.
Measured with the same `brandedTitle()` the spec uses:

| String | Length |
| --- | --- |
| Landing title en "Fixed-Price Home Services: Essex, Morris, Bergen & Union NJ" (after review) | 59 |
| Landing title es "Servicios del hogar en Essex, Morris, Bergen y Union NJ" | 55 |
| Landing description en / es | 149 / 153 |
| Service titles en (7) | 57 to 60 |
| Service titles es (7) | 55 to 60 |
| Service descriptions en (7) | 144 to 159 |
| Service descriptions es (7) | 145 to 155 |

Some trims, so the reviewer can judge them: the cabinet title says "Cabinet Painting" (the keyword) instead of "Cabinet Repainting"; the exterior painting title has no "NJ" and the landing page says "Fixed-Price" instead of "Priced Up Front" (after review, the air duct, gutter and landing titles carry "NJ" again); the HVAC descriptions dropped "fast scheduling" / "agenda rápida"; drywall dropped "cut,"; exterior painting en says "firm quote from photos".
`areaTowns` adds Summit, Westfield and Cranford.

## Evidence

| Check | Result |
| --- | --- |
| `psql -f supabase/migrations/20261030000005_union_county_copy.sql` on the rig, twice | first run 35 x `UPDATE 1`, second run 35 x `UPDATE 0` (idempotent); no `db reset` |
| Rig table against the new seed (every column except `updated_at`, `updated_by`) | 7 rows, none differing |
| `tests/home-services-catalog.spec.ts` live, alone, `--workers=1` | 19 passed, 1 skipped (production-chunk scan, no production build in `.next`); CAT1 renders every page from the table and compares it to the new seed |
| Rig table against the seed after that run | none differing |
| `tests/home-services-landing.spec.ts` and `tests/home-services-request-flow.spec.ts` live | 43 passed (after the middleware fix below; 41 passed and 2 failed before it) |
| Stub: `npm run test:build` (`.env.local` moved aside and restored), `next start` on 3112, `playwright test` on catalog, landing, request-flow, offers, home-services-admin, admin-nav, articles-publish-guard, experiments, cta-tests (chromium and mobile) | 262 passed, 220 skipped (live-only), 0 failed |
| `npm run typecheck`, `npm run lint`, `npm run chaos:static` | clean, clean, total 0 and no new violations |

## A pre-existing failure found and fixed on the way

The two "RF2 RF7 RF9 LP9: a full submit stores the request with photos and attribution" cases failed live: `cta_variant_primary` and `cta_variant_secondary` came back null instead of B and A.
The cause is unrelated to Union and predates this branch; it is in `src/middleware.ts` (slice H): on a page that renders server-side experiments, a `cta_v` cookie with no `R` seed was replaced whole by `R=<new seed>`, dropping the `P` and `S` hero variants the request route records.
The spec sets `P=B;S=A` without a seed, which is how that surfaced; a real visitor keeps P and S only if the cookie carries them, so the fix is in the middleware, not the test: the seed is now added to the cookie and its other parts are kept.
Checked against the stub server with curl:

```
no cookie                        -> Set-Cookie: cta_v=R%3Deb1f29a6...
cta_v=P%3DB%3BS%3DA               -> Set-Cookie: cta_v=P%3DB%3BS%3DA%3BR%3D3b994735...
cta_v=P%3DB%3BS%3DA%3BR%3D<seed>  -> no Set-Cookie (seed present, nothing minted)
```

## Not changed, for a follow-up

The remodel side of the site names its own counties and was out of this brief's scope: the contact page ("Essex, Bergen, Morris & Passaic"), referral FAQ, `/services/[slug]` town list, interior-finishing page, the two Montclair and Verona bathroom pages, `StructuredData.tsx` and the intake chat's opening line.
Whether those should name Union is a call for Alex, since they describe the remodel business, not the priced home services.

## Follow-up after review (`acd0845`)

The reviewer accepted at `acd0845`; the planner asked for two changes, both made here.

1. 07062 joins 07060 and 07063 in the North Plainfield note, in `countyZips.ts` and above (zip-codes.com and Wikipedia list it as also delivering to North Plainfield).
   The ZIP list itself is unchanged.
2. "NJ" stays where it fits, with the reviewer's three titles exactly:
   - air duct `Air Duct Cleaning in Essex, Morris, Bergen & Union NJ, $449` (59);
   - gutter `Gutter Cleaning in Essex, Morris, Bergen & Union NJ, $279` (57);
   - landing `Fixed-Price Home Services: Essex, Morris, Bergen & Union NJ` (59, under 60 as SEO1 requires).
   The exterior painting title is unchanged.

The seed in `20261030000000_phase_2.sql` is regenerated from `catalogSeed.ts`.
In `20261030000005_union_county_copy.sql` the two table titles take the new `SET` values, and their `WHERE` now accepts either the three-county seed text or the first Union wording this file carried at `f454809`, because the rig (and any database that ran that version) holds the latter; every other statement is unchanged.
The landing title is in `i18n.ts`, not the table, so it needs no migration.

| Check | Result |
| --- | --- |
| `psql -f supabase/migrations/20261030000005_union_county_copy.sql` on the rig, twice | first run 2 x `UPDATE 1` (the air duct and gutter titles; the third title, the landing one, is code) and 33 x `UPDATE 0`; second run 35 x `UPDATE 0` |
| SEO1 source checks in `home-services-landing.spec.ts` (with LP10 and the Q21 ZIP test) | 4 passed |
| `tests/home-services-catalog.spec.ts` live, alone, `--workers=1` | 20 passed (CAT1 renders every page from the table and matches the new seed) |
| Rig table against the seed afterwards | 7 rows, none differing |
| `npm run typecheck`, `npm run lint` | clean, clean |

The SEO1 run was started without `TEST_URL`, so Playwright briefly served the existing `.next` on port 3000 for its two browser cases, which skipped; port 3000 was free before and after.
