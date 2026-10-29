# Q21 - Union County as a fourth county (review)

Reviewer: Opus 5.5, independent of the builder.
Reviewed head: `f454809` on `phase2/q21-union` (cut from `fb48960`).
Rig: local Supabase on 55421 (shared, never reset), branch dev server on 3113 with `env.rig` as both env files, and a second worktree at `fb48960` on 3114 for the before-and-after of the middleware fix.

## Verdict: ACCEPT

Every check below passed with evidence.
Union is served end to end: the ZIP gate, every county string, the SEO copy within limits, `areaServed`, the seed, and a guarded update migration that is idempotent and leaves an admin edit alone.
The middleware fix is real, I reproduced the regression on `fb48960`, and the CT and experiments specs pass live.
Four non-blocking items follow: one note in `countyZips.ts` to correct, three better title fits, and two observations.

## 1. ZIPs against a second source

Second source: us-databases.com, "Union County NJ ZIP codes".
Third source for the PO box ZIPs: Redfin's Union County ZIP list.

| ZIP | Builder (zip-codes.com) | us-databases.com |
| --- | --- | --- |
| 07090 | Westfield | Westfield |
| 07083 | Union | Union |
| 07016 | Cranford | Cranford |
| 07205 | Hillside | Hillside |
| 07922 | Berkeley Heights | Berkeley Heights |
| 07062 | Plainfield | Plainfield |

All 26 standard ZIPs in the builder's list appear on us-databases.com.
The four PO box ZIPs (07061, 07091, 07207, 07902) are not on us-databases.com, but zip-codes.com and Redfin both list them, and the existing map already includes PO box ZIPs for the other counties, so including them is consistent.

Somerset overlap note: correct but incomplete (should fix, one line).
zip-codes.com, the builder's own source, lists 07062 as well as 07063 with "Union County [Primary]" plus "Somerset County, NJ", and accepts "North Plainfield" as a city name for both.
Wikipedia's North Plainfield infobox lists 07060, 07062 and 07063.
So the comment in `countyZips.ts` and the build report should say "07060, 07062 and 07063".
The behaviour does not change: all three are in the Union list.

07069 (Watchung) is excluded.
us-databases.com lists it under Union, and zip-codes.com counts one multi-county ZIP in its Union total that it does not show, but every source gives Somerset as the primary county.
Excluding it is the right call; the landing spec asserts 07069 is declined, so it is a deliberate choice, not an oversight.

## 2. County strings, SEO lengths and the trade-offs

Source tests: `SEO1` (service titles at most 60, descriptions at most 160, naming the counties), `SEO1` landing, `LP10` and `Q21` in `tests/home-services-landing.spec.ts` all pass.

Rendered on the dev server, all 16 pages (landing and 7 services, en and es): the title and meta description name all four counties, and the Service JSON-LD `areaServed` is `Essex County, NJ; Bergen County, NJ; Morris County, NJ; Union County, NJ` on every page.
No visible text on any of these pages still reads "Essex, Morris and/y/& Bergen": "pages with problems: 0 of 16".
Lengths, measured with `brandedTitle()`: service titles 55 to 60, descriptions 144 to 159, landing titles 58 (en) and 55 (es), landing descriptions 149 and 153.
`heroBody`, `trustArea`, `outOfArea` and `moreServicesTitle` name four counties in both languages; each service carries one Union keyword (7 of 10).
The remodel-side pages that still name three counties (the two location bathroom pages, the intake chat line) are outside this brief, as the build report says.

Trade-offs:

- "Cabinet Painting" for "Cabinet Repainting": ACCEPT.
  "Cabinet painting" is the term people search, it is already a keyword, and the description keeps "Cabinet repainting", so the page carries both.
  If Alex prefers the title to match the service name, `Cabinet Repainting: Essex, Morris, Bergen & Union NJ, $2,095` also fits (60).
- Titles that dropped "NJ": "Union" alone is ambiguous: it is a township inside Union County, and many states have a Union County.
  Two of the three service titles can keep "NJ" by using the ", $price" pattern the cabinet title already uses, and the landing can too.
  I propose:
  - Air duct, en: `Air Duct Cleaning in Essex, Morris, Bergen & Union NJ, $449` (59 characters, was 60 without NJ).
  - Gutter, en: `Gutter Cleaning in Essex, Morris, Bergen & Union NJ, $279` (57).
  - Landing, en: `Fixed-Price Home Services: Essex, Morris, Bergen & Union NJ` (59; the landing title must stay under 60).
  - Exterior painting, en: no fit with "NJ" and the unit price (the closest I found is 61 characters), so ACCEPT `Exterior Painting $2.95/sq ft: Essex, Morris, Bergen & Union`.
  Adopting these means regenerating the seed and the matching `SET` values in `20261030000005`, and `seo_title_en` is already the guarded column, so the change stays mechanical.
  These are better fits, not defects; every description still says NJ.
- "Fixed-Price" instead of "Priced Up Front": ACCEPT.
  It says the same thing in fewer characters and matches "fixed price" searches; the description still ends "Firm prices".
  Observation: the Spanish landing title lost its price promise ("con precio"); I found no fit under 60 that keeps it, so I accept it as is.

## 3. Request flow, live

- API (spec "Q21: a Union County ZIP (07090 Westfield) is accepted at the API; 07920 Basking Ridge is still declined", live): 07920 gets 403 `{"error":"out_of_area"}` and stores nothing; 07090 gets 200 and stores one row with `zip: 07090, status: new`.
- Browser (iPhone 13, en and es): 07920 shows "We don't serve that ZIP yet. We cover Essex, Morris, Bergen and Union Counties. Sorry we can't help this time." (and the Spanish equivalent with four counties); 07090 clears the error and the flow moves on to the contact step.
  Shots: `shots/q21-review-phone-zip-07920-en.png`, `shots/q21-review-phone-zip-07920-es.png`.

## 4. Migrations

- Seed: `seedSql()` from `scripts/seed-home-services.ts` appears verbatim in `20261030000000_phase_2.sql` (24,684 characters).
- Update migration, statically: I parsed all 35 statements in `20261030000005_union_county_copy.sql` against the seed at `fb48960` and the seed at `f454809`.
  Every `WHERE` matches the old seed value, every `SET` equals the new seed value, every keyword statement turns the old list into the new one, and no column that differs between the two seeds lacks a statement: "statements parsed 35 problems 0".
- Idempotent on the rig: on the current (already migrated) table, two runs gave `35 x UPDATE 0` each.
- An admin edit survives:
  1. I put the rig table back to the three-county seed with the exact inverse of the migration (`35 x UPDATE 1`); the table then equalled the `fb48960` seed field for field.
  2. In Services & Prices (desktop browser, signed in), I changed HVAC cleaning's Spanish SEO description to `q21-review Limpieza de HVAC ... editada por el admin.` and saved (`shots/q21-review-admin-edit.png`).
  3. Migration run 1: `34 x UPDATE 1, 1 x UPDATE 0`; the column still held the admin's text.
  4. Migration run 2: `35 x UPDATE 0`.
  5. The table then equalled the new seed except that one column ("diffs 1", the edited `seo_description_es`).
  6. I restored the column to the new seed text through the editor; the table equals the new seed again ("diffs 0"), also after the live catalog spec.
- Observation: a SQL migration does not expire the app's one-hour catalog cache, so a running deployment would keep showing the old copy for up to an hour after the update.
  In production the migration lands before the deploy, so this only affects a preview that is already running; no change needed.

## 5. Middleware cookie fix

Curl against `/home-services` on the branch:

```
no cookie                                   -> cta_v=R%3D5de14b39...
cta_v=P%3DB%3BS%3DA (no seed)               -> cta_v=P%3DB%3BS%3DA%3BR%3D86216386...   (P and S kept, seed added)
cta_v=P%3DB%3BS%3DA%3BR%3D<32-hex seed>     -> no cta_v Set-Cookie
Googlebot UA with P and S                   -> no cta_v Set-Cookie
malformed cta_v=%E0%A4%A                    -> cta_v=R%3Dabdd005b...   (no throw)
```

The same "P and S, no seed" request on `fb48960` returned `cta_v=R%3D06687678...`, which drops P and S, so the regression is real and this commit fixes it.

End to end with a cookie jar: a visitor holding only `P=B;S=A` loads `/home-services`, the jar becomes `P=B;S=A;R=3b7cd27e...`, the request POST (ZIP 07090) returns `{"ok":true,...}`, and the stored row has `cta_variant_primary: "B", cta_variant_secondary: "A"`.
I deleted the row, its lead and its follow-ups afterwards.
CT and experiments specs, live on the rig (`tests/cta-tests.spec.ts`, `tests/experiments.spec.ts`, `--workers=1`): 47 passed.

## 6. Gates on `f454809`

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 (a first run failed on two missing routes in `.next/types`, left there by my earlier stub build of an older commit; with that generated folder removed it passes, so this was a rig artifact, not the branch) |
| `npm run lint` | exit 0 |
| `npm run chaos:static` | total 0, baselined 0, new 0 |
| Live `home-services-landing` and `home-services-request-flow` (chromium) | 43 passed |
| Live `home-services-catalog`, alone, `--workers=1` | 20 passed; table equals the seed afterwards (diffs 0) |
| Live `cta-tests` and `experiments`, `--workers=1` | 47 passed |
| Stub `npm run test:e2e` on landing, request-flow, catalog, cta-tests, experiments, admin-nav-simplified and articles-publish-guard (both env files moved aside and restored) | exit 0, 246 passed, 164 skipped (live-only) |

Run notes:
- The live request-flow spec reads `RECAPTCHA_E2E_BYPASS_TOKEN`, `INTERNAL_WEBHOOK_SECRET` and `CRON_SECRET` from its own environment, so they must match the dev server's; with mismatched values RF8 and the purge test fail for that reason alone.
- On my first live run, against a cold dev server, "LP10 D6: /sitemap.xml lists ..." failed once; it passed on both later runs.

## For the builder (none blocking)

1. `countyZips.ts` comment and the build report: name 07062 with 07060 and 07063 as Plainfield ZIPs that also deliver to North Plainfield (Somerset).
2. Optional, Alex's call: keep "NJ" in the air duct, gutter and landing titles with the three strings in section 2, regenerating the seed and the matching `SET` values in `20261030000005`.

Sources: [zip-codes.com Union County](https://www.zip-codes.com/county/nj-union.asp), [us-databases.com Union County](https://us-databases.com/zip-codes/nj/county/union/), [Redfin Union County ZIPs](https://www.redfin.com/sitemap/1910/NJ/Union-County), [zip-codes.com 07062](https://www.zip-codes.com/zip-code/07062/zip-code-07062.asp), [zip-codes.com 07063](https://www.zip-codes.com/zip-code/07063/zip-code-07063.asp), [Wikipedia: North Plainfield](https://en.wikipedia.org/wiki/North_Plainfield,_New_Jersey).
