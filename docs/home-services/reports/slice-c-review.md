# Slice C review - homepage hero CTA multivariate test

Reviewer: independent reviewer for slice C.
Branch reviewed: `worktree-agent-ad83187885343b4e4` at `a0e9df2`, base `fc6fe33`.
Rig: local Supabase on 55421/55422, my own dev server and production build on port 3113.

**Verdict: ACCEPT WITH FIXES.**

All nine ACs are confirmed by my own evidence.
One high severity defect must still be fixed before launch.
The two buttons are not assigned independently whenever both have an even number of active variants.
That is exactly the confound the code comment says it prevents.
The two medium defects can follow before real traffic reaches the test.

## Acceptance criteria

| AC | Result | Evidence |
| --- | --- | --- |
| CT1 | CONFIRMED | `curl` of `/` on my dev server: the server HTML holds `<a data-cta-button="primary" ... href="/home-services#services">` and `<a data-cta-button="secondary" ... href="/portfolio">`. Spec `CT1 + SEO3` passed. Wording comes from the active `cta_variants` rows (A and B primary, A secondary). |
| CT2 | CONFIRMED | Spec CT2 (both tests) passed. I ran the real `pickVariant` over 200,000 random UUIDs per case. Every variant got its fair share: for 2 variants the split was 49.90% and 50.10%, for 7 variants every share fell between 14.16% and 14.35%, and every chi-squared value was below its degrees of freedom bound. The DB unique index enforces one view per visitor per variant. Caveat: see defect 1, where the two buttons are correlated with each other. |
| CT3 | CONFIRMED | Spec CT3 passed: one click row after two clicks on separate visits, and secondary is tracked separately. The `cta_events_once_per_visitor` unique index enforces it in the DB. |
| CT4 | CONFIRMED | Spec CT4 passed, covering view, click, request, valid lead and won deltas, the request rate, the sample size, `not_enough_visitors` below the threshold and the leader at the threshold. Sabotage: when I removed the `sampleSize < minVisitors` gate in `report.ts`, CT4 failed. The UI is in the screenshot below: "Not enough visitors yet (2 of 100)". |
| CT5 | CONFIRMED | Spec CT5 passed: seven maximum with 409 on the eighth, the wording, subtext and colour edits, 400 on a bad colour, 409 on deactivating the last active variant, and the homepage serving the new variant in rgb(31, 122, 77). I read the code in `variants/route.ts` and the checks match. |
| CT6 | CONFIRMED | `src/components/ABTesting.tsx` is deleted in the diff. `grep -rn ABTesting src` returns nothing. |
| SEO3 | CONFIRMED | Real `<a href>` links are in the server HTML. I tested with JavaScript disabled using Playwright on the production build. Primary navigated to `/home-services#services` and secondary navigated to `/portfolio`. |
| SEC1 | CONFIRMED | Spec SEC1 passed: 413 over 1 KB, 400 with `{"error":"Invalid event"}`, 429 with Retry-After from the 61st call per IP, and a different IP unaffected. The rate limit runs before the body is read, and errors are generic. Caveat: see defect 3. The IP comes from a client-settable header on any origin not fronted by Cloudflare, and the limit does not stop inflation. |
| SEC5 | CONFIRMED | The admin routes and the tab only use `supabaseRest` (secret key). With the publishable key, `GET cta_events` returns `[]`, `POST cta_events` returns 401, `PATCH cta_variants` returns `[]` with nothing changed, and inactive variants are not readable. Every `/api/admin/cta/*` method returns 401 without a session. The homepage reads active variants with the publishable key. That is the sanctioned exception in the migration. |

## Defects

### 1. HIGH - the buttons are not assigned independently

File: `src/lib/cta/assign.ts:42`.

FNV-1a multiplies by an odd prime, so the low k bits of the hash depend only on the low k bits of the input bytes.
`hash % n` with an even `n` therefore reads only those low bits.
`":primary"` and `":secondary"` differ by a fixed amount in them.
Measured over 100,000 random visitor ids per pair of variant counts, P for primary and S for secondary:

| Active variants | Combinations served | Largest cell | Even share |
| --- | --- | --- | --- |
| P2 S2 | 2 of 4 (only AA and BB) | 50.2% | 25.0% |
| P2 S4 | 4 of 8 | 25.2% | 12.5% |
| P4 S4 | 4 of 16 | 25.1% | 6.3% |
| P6 S2 | 6 of 12 | 16.8% | 8.3% |
| P3 S3 and P2 S3 | all | fair | fair |

What breaks: the day the owner activates a second secondary variant while primary has two, every visitor sees either A with A or B with B.
The two tests then confound each other completely, and the report cannot say which button caused a difference.
Fix: run a finalizer before the modulo, for example murmur3 fmix32 (`h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0`).
With fmix32 every combination came out even in every pair above, for example P4 S4 had all 16 cells with the largest at 6.5%.
Also add a unit test that asserts the joint distribution for P2 S2.
This is safe to change now because no production visitor holds a cookie yet.

### 2. MEDIUM - on slow phones the buttons are hidden for over 2 s and then flash the wrong variant

Files: `src/components/Hero.tsx:123-131` and `src/lib/cta/useHeroCta.ts`.

I ran the production build at iPhone 13 size with fresh visitors and event calls stubbed.

| Throttling | First visible | Wrong variant visible first |
| --- | --- | --- |
| None | 83 to 90 ms | 0 of 4 |
| CPU 4x | 339 to 422 ms | 0 of 4 |
| CPU 6x and slow 4G | 2446 to 2558 ms | 2 of 4 (both B visitors saw A first) |

The 1.5 s CSS reveal fires before hydration on slow devices.
B visitors then see A's wording, then B's, which is the flash the design was meant to remove.
Those visitors are counted as B, which contaminates the test.
On the same devices the main call to action is invisible for about 2.5 s.
LCP is not harmed: in every run the LCP element was the hero paragraph (`P text-xl md:text-2xl`), never a button.
Accessibility impact is small: the invisible links stay focusable and in the accessibility tree, and their text can change after hydration.
No-JS visitors are fine: opacity was 0 at first and 1 after 2.2 s, and both links navigated.
Fix: decide the variant before first paint without React.
Render every active variant's label in the server HTML, each hidden by default.
A tiny inline script before the hero reads `cta_v` and `cta_vid` (or computes the hash) and sets `data-cta-p` and `data-cta-s` on `<html>`.
CSS then shows only the matching label.
That puts nothing in the React tree that can mismatch, keeps the page static, and removes the opacity gate.

### 3. MEDIUM - anyone can inflate or deflate a variant through the event sink

File: `src/app/api/cta/event/route.ts:25-56`, together with the existing `src/lib/rateLimit.ts:63`.

Reproduced on my server:
- 70 `click` events for primary B, each with a new made-up UUID and no view, all returned 200 and wrote 70 rows.
- Sending a different `cf-connecting-ip` header on each call never hit the 429. Rotating `x-forwarded-for` gave the same result, 65 of 65 accepted.
- An event for secondary key G, which does not exist, returned `{"ok":true}` and wrote a row.

In production, Cloudflare overwrites `cf-connecting-ip`; `dig` shows that www.lavacagc.com resolves to Cloudflare, with `server: cloudflare` in front of Vercel.
So header rotation only works against an origin reachable without Cloudflare, such as a `*.vercel.app` URL.
I did not probe production, so that part is unverified.
Even from one honest IP, 60 events per minute adds 86,400 fake visitors a day.
That is far above the 100-visitor threshold, so it can name or block a leader.
Fake views on a rival lower its request rate and are just as effective.
There is no write amplification beyond the limit, because each accepted call costs one rate-limit read, one update and one insert.
Fix, in order of value:
- Accept only keys that are active. Read them through the same cached variant fetch.
- Accept a click only when that visitor already has a view for that variant.
- Issue the visitor id from the server as an HMAC-signed, httpOnly cookie on the first view, and reject unsigned ids.
- Make `clientIpFromHeaders` trust `cf-connecting-ip` only when the request really came through Cloudflare. The other option is to block direct origin access.

### 4. LOW - spec gaps: two kinds of sabotage stay green

File: `tests/cta-tests.spec.ts:226-280`.

| Sabotage | Spec result |
| --- | --- |
| `pickVariant` returns `Math.random()` | 10 passed |
| `resolveVariant` ignores the stored `cta_v` key | 10 passed |
| Random pick and ignored cookie together (control, to prove hot reload applied the sabotage) | CT2 failed |
| Duplicate insert (23505) answered with 500 | 1 failed |
| Leader gate removed from `report.ts` | CT4 failed |
| Client-side `viewsSent` guard removed | 10 passed, which is correct because the DB index dedupes |

The "even" check only asserts that both A and B appear among 20 visitors, so a 95/5 split passes.
Nothing tests that a stored key beats the hash, which is what keeps visitors sticky when a variant is added.
Fix: add pure unit tests for `pickVariant` (fixed vectors, marginal evenness and the joint distribution from defect 1).
Also add a live test that seeds `cta_v=P=B` for a visitor id whose hash gives A, and expects B.

### 5. LOW - homepage specs write untagged rows to the shared `cta_events`

File: `tests/hero-trust-badges.spec.ts`, and any spec that loads `/` with live events.

My run of that spec created 4 untagged rows, at ids 505 to 508 and 07:08:59 UTC.
I deleted them because they were provably mine.
The developer's 8 leftover rows have the same signature.
Fix: stub `**/api/cta/event` in a shared Playwright fixture for every spec that does not test events.

### 6. LOW (advisory) - editing a variant's wording keeps its counts

File: `src/app/api/admin/cta/variants/route.ts:104-133`.

Changing the wording of a variant that already has views merges the old and new wording's results under one key.
Fix: warn in the editor when the variant has views, and suggest adding a new variant instead.

## Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `eslint --max-warnings 0` on all 21 changed .ts and .tsx files | exit 0 |
| `npm run chaos:static` on default Node v20.20.0 | crashes before running, see the error below |
| chaos static on Node v24.18.0 | "total 0, baselined 2, NEW 0, fixed since baseline 2 ... no new violations." |
| `npm run build` | exit 0, `┌ ○ /    5m    1y`, so `/` is static with revalidate 300 |
| Developer spec, `cta-tests` and `hero-trust-badges` on chromium | 15 passed (20.2 s) |

The chaos crash on Node 20:

```
TypeError: Unknown file extension ".ts" for .../scripts/chaos-static.ts
  code: 'ERR_UNKNOWN_FILE_EXTENSION'
```

It predates this slice.
`git diff --stat fc6fe33..HEAD -- scripts package.json package-lock.json tsconfig.json` is empty, and the script was last changed in `6ca6d7a`.
I reasoned this from the diff and did not run it on a base worktree, because the script and its config are byte-identical.

The build also logs "Error loading blog posts: column blog_posts.title does not exist" from `src/app/blog/page.tsx`.
That is caused by the local DB schema and is unrelated to this slice.

## Claims I could not reproduce, or that changed

- **The two hero-trust-badges failures.** They pass now: 5 of 5.
  The rig has since gained the `google_reviews` table (`to_regclass` returns it), added by coordinator commit `edd94ce`.
  Both tests pass against this slice's code with the table present, which proves the developer's attribution.
  The failures were environmental, and the slice does not break those tests.
  For that reason I did not run them on a base worktree.
- **The admin flow on the production build.** I could not sign in there, because the production CSP correctly blocks the local Supabase host in `connect-src`.
  The admin visual check was done on the dev server.
  At 1440 px and 390 px there is no horizontal page overflow, and the tables scroll inside their cards.
  The only console errors were the 500 from "Failed to load dashboard data" in `AdminDashboard.tsx`, which comes from the dashboard and predates this slice.
- **Hydration claims.** The report says "never the wrong variant", which holds only on fast devices. See defect 2.
- **Untested on Vercel.** I could not test the Vercel ISR and `revalidatePath` behaviour; the local production build is the closest rig.

## Leftover state on the shared rig

`cta_events` holds exactly the developer's 8 untagged rows: ids 205-208 and 355-358.
They come from 4 visitors at 07:00:06 and 07:04:27 UTC.
They currently drive the admin report: primary A has 2 views and B has 2 views, so a single real request on B already shows a 50.0% request rate.
I recommend deleting them, because they match the signature of the rows my own hero-trust-badges run created.
The command is `delete from cta_events where id in (205,206,207,208,355,356,357,358);`.
I did not delete them.
I deleted only my own 136 spoofing rows (visitor ids `ecec0000-0000-4000-8000-*`) and my 4 hero-spec rows.
`cta_variants` matches the seed, and `cta_min_visitors` is 100.
The GoTrue user `review-c@local.test` was created for this review.
