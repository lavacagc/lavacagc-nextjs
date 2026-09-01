# Production defects of 6 Aug 2026 - acceptance criteria

Two defects found by `npm run audit:prod` on 6 Aug 2026, the first day that audit could actually reach the site.
Both were invisible until then, because the audit's browser sent a `HeadlessChrome/...` user agent and our own bad-bot filter answered 403 on every path, so every run measured the filter instead of the site.

1. `/contact` threw minified React error #418 on production - a hydration mismatch on the primary lead-capture page.
2. `/locations/fairfield` returned 404 on production.

They are unrelated in cause and the fixes share no code.
They ship together because they were found together and neither is big enough to be worth its own release.

A third defect surfaced while diagnosing the second and is **not fixed here** - it needs a decision that is not a bug fix. It is recorded at the end.

## Defect 1 - `/contact` threw React #418

### What was actually happening

Nothing in our React tree was wrong.
Cloudflare Scrape Shield's **Email Address Obfuscation** rewrites every email address it finds in our HTML at the edge, replacing it with `<a class="__cf_email__">[email protected]</a>` and injecting `/cdn-cgi/scripts/.../email-decode.min.js` to put the real address back in the DOM on the client.

The TCPA consent label in `src/components/ContactForm.tsx` renders `info@lavacagc.com` as **bare text**, so Cloudflare replaced a text node with an anchor ELEMENT.
React then hydrated that DOM against an RSC payload still carrying the real address in plain text, found markup where it had sent text, and threw #418 - which discards the server render and rebuilds the whole page on the client.

That is why only `/contact` failed while every other page carries the same address in the footer: everywhere else the address is already inside an `<a href="mailto:">`, so Cloudflare's rewrite stays an attribute-and-inner-text edit that hydration tolerates.
Those pages are not safe, they are lucky, and the fix covers them too.

Reproduced on production, 6 Aug 2026, deterministically (3 runs, 3 failures), with `devices['Desktop Chrome']` and `waitUntil: 'networkidle'`:

```
=== /contact -> 200 ===
  [pageerror] Minified React error #418; visit https://react.dev/errors/418?args[]=text&args[]=
```

Local dev and local production builds were clean, every time. Cloudflare is not in front of either.

### The fix, and what is given up

`src/app/layout.tsx` brackets the whole `<body>` in Cloudflare's documented opt-out, `<!--email_off--> ... <!--email_on-->`.
It has to be an HTML comment, and React has no API for comment nodes, which is why the two markers are `dangerouslySetInnerHTML` on hidden `<span>`s.

Bracketing the body rather than each address is deliberate.
Per-address opt-outs would need one edit per render site plus the discipline to remember on the next one, and they could not cover CMS-authored pages at all - `/privacy-policy` carries 11 addresses that come out of the database.

**Nothing is given up.** The obfuscation was already defeated on this site: `info@lavacagc.com` appears 8 times in plain text in the production HTML of `/contact` - in the JSON-LD business schema and in the RSC flight payload - and Cloudflare rewrites neither, because it does not touch `<script>` bodies.
It cost us a hydration pass on the lead-capture page and bought no protection.

Turning the feature off in the Cloudflare dashboard (Scrape Shield → Email Address Obfuscation) would have the same effect and is a reasonable thing to do as well, but it lives outside the repository, so nothing here would fail if someone turned it back on.

### AC1-AC4, in `tests/contact-hydration.spec.ts`

- **AC1** - every occurrence of the address in `/contact`'s **markup** sits between `<!--email_off-->` and `<!--email_on-->`. Occurrences inside `<script>` bodies are excluded, because Cloudflare does not rewrite those and React does not hydrate them as text.
- **AC2** - the same holds on `/` and `/about`, which render the address only through the shared footer. This is the assertion that fails first if the opt-out is ever narrowed to `/contact`.
- **AC3** - a rewriter following Cloudflare's published contract finds **nothing to rewrite** on `/contact`, and the page hydrates with no uncaught errors.
- **AC4** - the same rewriter, ignoring the opt-out, still reproduces a hydration failure. AC3 passing means the opt-out worked, not that the stand-in was toothless.

**What these cannot prove.** Cloudflare sits in front of production only - not a local build, and not a Vercel preview, which is served from `*.vercel.app`.
So no local spec can exercise the real rewriter, and one link in the chain is unproven until deploy: that Cloudflare's implementation honours a marker comment nested inside a `<span>`.
The post-deploy check below is what settles it, and it is not optional.

### Post-deploy verification (owed on production, after merge)

```bash
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
curl -s -A "$UA" https://www.lavacagc.com/contact | grep -c '__cf_email__'   # expect 0, was 3
```

Then re-run the page in a real desktop Chrome profile and confirm no `pageerror` mentioning 418.
If `__cf_email__` is still present, Cloudflare did not honour the nested comment: the fallback is to switch Email Address Obfuscation off in the Cloudflare dashboard, and the markers then become harmless.

## Defect 2 - `/locations/fairfield` returned 404

### What was actually happening

The site was right and the audit was wrong.
`fairfield` is not a service area in any sense: no `service_areas` row (21 active slugs, none of them Fairfield), no entry in `src/data/locationData.ts`, no sitemap URL, and no link anywhere on the site.
The only place it existed was a hardcoded path list in `scripts/site-audit.ts`, so every audit run asked production for a page we never published and scored the correct 404 as a failure.

That is worse than a cosmetic complaint.
`audit:prod` already exits nonzero on a healthy site because aborted analytics beacons score as failures, and a permanent phantom 404 on top of that is one more reason nobody reads the output.

### The fix

`scripts/site-audit.ts` no longer pins any `/locations/*` path.
It derives them from `${SITE_URL}/sitemap.xml`, fetched through the browser context so the request carries the same real-Chrome UA as the sweep - a bare `fetch()` is answered 403 by our own bad-bot filter.

The sitemap is the right source because it is what we ask search engines to crawl: a URL in it that 404s is a genuine defect and belongs in the audit, and a town that leaves the sitemap stops being audited on the next run instead of a year later.
The parsing half lives in `scripts/lib/sitemap-city-paths.ts` so it can be tested directly; `site-audit.ts` runs the whole audit on import and nothing in it can be.

If the sitemap cannot be read, or publishes no city URLs, the audit **throws** rather than sweeping a shorter list.
A run that silently covers fewer pages reads exactly like a clean one.

Effect on coverage: 29 hardcoded paths become 35 (17 static + 18 published towns).
Gone: `/locations/fairfield`. Added: bloomfield, clifton, ho-ho-kus, madison, maplewood, morristown, parsippany.

`tsconfig.json` gains `allowImportingTsExtensions`, because that script is executed by Node's own type-stripping ESM loader, which resolves specifiers literally and cannot find an extensionless import. The option is only legal with `noEmit`, which this project already sets.

### AC5-AC9, in `tests/site-audit-paths.spec.ts`

- **AC5** - only single-segment `/locations/<city>` paths are taken from a sitemap, deduplicated and sorted. `/locations/<city>/services` and the per-service combinations are excluded: they run into the hundreds and sweeping them is a link checker's job.
- **AC6** - a sitemap with no city URLs yields an empty list, so the audit's throw is reachable and meaningful.
- **AC7** - `scripts/site-audit.ts` pins no `/locations` path of its own, and names no town, once comments are stripped. This is the defect itself; if a copy of the list comes back, this fails.
- **AC8** - every city page the served sitemap publishes answers 200. This is the invariant the audit now leans on, and it catches the defect from the other side: a town published without a page behind it fails here.
- **AC9** - Fairfield remains absent from `src/data/locationData.ts`. Documenting the decision, not changing behaviour: if Fairfield is ever added as a service area it needs a `service_areas` row **and** a `locationData` entry, at which point it enters the sitemap and AC8 covers it with no edit to any test.

## How these were verified

- `npm run test:build`, then `E2E_STUB_BACKEND=1 npx playwright test tests/contact-hydration.spec.ts tests/site-audit-paths.spec.ts --project=chromium --project=mobile` - 18 passed.
- Proved red-then-green: with `src/app/layout.tsx` and `scripts/site-audit.ts` reverted to `main` and the specs kept, AC1, AC2, AC3 and AC7 fail - the four that assert the fixes. AC4, AC5, AC6, AC8 and AC9 pass on both builds by design, and say so in their own comments.
- Defect 1 reproduced against production before any code was written, and the diagnosis confirmed by diffing the server-rendered text against the hydrated DOM (`[email protected]` on the wire, `info@lavacagc.com` after hydration).
- `npm run audit:prod` run against production to confirm the new derivation: `Pages to audit: 35 (17 static + 18 from https://www.lavacagc.com/sitemap.xml)`.
- Full Playwright suite, because the layout change is on every page.

## Found while diagnosing, deliberately NOT fixed here

**Three active service areas have no page.** `chatham`, `florham-park` and `summit` are `active` rows in `service_areas`, and all three return 404 on production.
The cause is that `/locations/[city]` calls `notFound()` when `getLocationBySlug()` misses, and that lookup reads the hardcoded `src/data/locationData.ts` (18 towns), not the database (21 rows).
They are also absent from the sitemap, which keeps its own hardcoded list in `src/app/sitemap.ts`.

This is not a fix that can be made silently, because the two ways out are a business decision, not a code choice:

- write real `locationData` entries for the three towns, which is per-town SEO content, and let them into the sitemap; or
- deactivate the three `service_areas` rows, if those towns are not actually served.

Fixing the audit does not paper over it: `npm run test:links` is the check that walks DB-driven paths and would flag exactly this, and AC8 above would catch it the moment such a town reached the sitemap.

**`/` times out on `networkidle` in the audit**, at 30s, on production - pre-existing and unrelated to both fixes. The autoplaying hero video plus the analytics beacons never leave the network idle. Worth fixing when `audit:prod`'s exit code is made trustworthy, which needs the third-party-host filtering that is already on that list.
