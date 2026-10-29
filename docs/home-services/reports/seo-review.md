# SEO review: home services landing and service pages

Reviewer: SEO agent (one of the three pre-launch review passes in the build spec).
Head commit reviewed: `959e702` (Merge branch 'worktree-agent-aebc8600219c08d69' into feat/home-services-request-flow).
The worktree was created at `35ba93b`, an ancestor of the target branch, so it was fast-forwarded to `959e702` before the review.
Rig: `npm run build` plus `npm run start -- -p 3121` against the local Supabase stack, curl with a desktop Chrome user agent, Lighthouse 3 runs per page in mobile mode, and the Playwright landing spec.
Every number below comes from that production server, not from source reading.

## Summary

17 findings fixed, 11 open (recommendations or accepted).
Titles, descriptions, canonicals, hreflang, robots and the sitemap were already in good shape; the main gaps were county names missing from four of seven service titles, no structured data for services on the landing page, a semantically wrong exterior painting price specification, Spanish pages linking and breadcrumbing to English URLs, and no links between sibling service pages.
Lighthouse mobile medians after the fixes: landing 89 / 100 / 100 / 100 and service page 89 / 100 / 100 / 100 (performance / accessibility / best practices / SEO).

## Findings

Severity: High blocks launch, Medium costs ranking or correctness, Low is polish, Info is a judgement call.

| # | Page | Finding | Severity | Fixed or why not |
| --- | --- | --- | --- | --- |
| 1 | hvac-cleaning, duct-and-vent-cleaning, exterior-painting, drywall-patching (en and es) | Titles said "Northern NJ" instead of naming Essex, Morris and Bergen, so 8 of 16 service titles had no county keyword. | Medium | Fixed in `catalog.ts`: every service title is now "<service> in Essex, Morris & Bergen NJ from <price>" (Spanish "en Essex, Morris y Bergen ... desde"), all at most 59 characters. |
| 2 | cabinet-repainting?lang=es | Title read "..., $1,995" without "desde", which is ungrammatical in Spanish. | Low | Fixed: "Pintura de gabinetes en Essex, Morris y Bergen desde $1,995" (59), which also adds the more common search term while the description keeps "Repintado". |
| 3 | cabinet-repainting?lang=es | Description was exactly 160 characters, at the limit. | Low | Fixed: 157. |
| 4 | exterior-painting (both) | The `UnitPriceSpecification` put the $3,500 job minimum in `minPrice`, which schema.org reads as "the unit price starts at $3,500"; there was no machine-readable unit. | Medium | Fixed in `seo.ts`: `unitCode: "FTK"` (square foot), `referenceQuantity` of 1 FTK, and the minimum as `eligibleTransactionVolume.minPrice` (schema.org's minimal purchasing volume). The D12 test was updated to the corrected shape and asserts `minPrice` is gone from the unit spec. |
| 5 | every service page ?lang=es | `BreadcrumbList` pointed at the English URLs and named the root "Home" on the Spanish page, so the Spanish breadcrumb did not match its own canonical. | Low | Fixed: `breadcrumbJsonLd(lang, service)` uses the `?lang=es` URLs and "Inicio". |
| 6 | every service page ?lang=es | `Service.url` and `Offer.url` were the English URL while name and description were Spanish. | Low | Fixed: `url` is the page in its language; `@id` stays shared so both languages describe one entity. |
| 7 | /home-services (both) | No structured data for the services or prices; only the layout's organization node. | Medium | Fixed: one `@graph` with the seven `Service` nodes (same `@id` as each service page, `provider` by the organization `@id`, no rating), the FAQ and a breadcrumb. |
| 8 | all eight pages | FAQs were visible but not marked up. | Low | Fixed: `FAQPage` on the landing and every service page, built from the same strings the page shows. Google has shown FAQ rich results only for government and health sites since 2023, so the value is for other search and answer engines; it is cheap and matches visible content, so it does no harm. |
| 9 | every service page | No links to sibling services; the only internal links were back to the landing. | Medium | Fixed: a "More home services in Essex, Morris and Bergen Counties" section (h2) links the other six with their prices. |
| 10 | every service page ?lang=es | "All home services" links went to the English `/home-services`, so a crawler on a Spanish page left the Spanish set. | Low | Fixed: links carry `?lang=es` on Spanish pages, matching the landing page, which already did this. |
| 11 | /home-services on phones | The only links from the landing to the service pages were in the hero price list, which is `hidden lg:block`; phone visitors had no way to reach a service page, and mobile-first indexing sees a hidden-only link set. | Medium | Fixed: a "Details for each service" link list under the cards, shown below `lg` only, so every viewport has exactly one visible set. |
| 12 | site footer | No footer link to `/home-services`. | Low | Fixed: "Home Services, Priced Up Front" in the footer's Our Services column. The header already links it. |
| 13 | all pages with the footer | Footer column titles were `h4` right after page `h2`s, failing Lighthouse `heading-order` (accessibility 98, flagged by the slice A review and not fixed); the new sibling `h2` made service pages fail it too. | Low | Fixed: footer titles are `h2` with the same classes, so nothing moves visually. Accessibility is now 100 on both pages. |
| 14 | every service page | The FAQ `h2` was "About this service", with no keyword. | Low | Fixed: "<Service>: questions people ask" / "<Servicio>: preguntas frecuentes". |
| 15 | /home-services (both) | Visible copy named the three counties but no towns. | Low | Fixed: one line under the trust cards, "Including Montclair, West Orange, Livingston, Short Hills, Morristown, Madison, Parsippany, Ho-Ho-Kus and Saddle River.", all towns the site already has location pages for and that fall inside the request flow's ZIP gate. |
| 16 | sitemap | The 16 home services URLs carried no hreflang alternates, although the pages declare them. | Low | Fixed: each English and Spanish entry carries `xhtml:link` alternates for en, es and x-default. |
| 17 | `.claude/skills/verify-web/helpers/jsonld-parse.py` | The helper read only top-level nodes, so anything inside `@graph` (or a top-level array) was invisible and a duplicate `aggregateRating` there would still pass `--strict`. | Medium (tooling) | Fixed: blocks are flattened through lists and `@graph` before merging. Its output on the landing went from 1 entity to 9. |
| 18 | all titles | `brandedTitle` adds " \| La Vaca" only when the result stays under 60, and the site template elsewhere is " \| La Vaca GC". After fix 1 only the English landing carries the brand. The rendered `<title>` is never truncated, because the pages set `title.absolute` and bypass the template. | Info | Not changed: Google shows the site name separately, and adding the brand would cost the county names or the price. Accepted. |
| 19 | /home-services | The `h1` ("Pick what you need. See the starting price. Get a firm quote from your photos.") has neither "home services" nor a county. | Low | Not changed: it is the spec's conversion headline and the tests pin it. The title, description, hero body and now the towns line carry the keywords. If the owner wants it, prefix the h1 with the eyebrow ("Home services in Essex, Morris and Bergen, priced up front"). |
| 20 | site-wide organization schema | `GeneralContractor.serviceType` and `knowsAbout` list only remodel services; `areaServed` is Essex, Bergen, Morris and Union. | Low | Not changed: `StructuredData.tsx` is site-wide and outside this pass. `areaServed` needs no change (it is a superset of the three counties). Recommend adding the seven home services to `knowsAbout`. |
| 21 | /services/interior-finishing vs /home-services/drywall-patching | "Drywall & Interior Finishing in NJ" and "Drywall Repair in Essex, Morris & Bergen NJ from $249" can compete for "drywall repair NJ". The intents differ (Level 5 finishing versus a single patch). | Low | Not changed: the remodel page is outside this pass. Recommend a one-line cross-link from interior-finishing to drywall-patching ("Just a hole to patch?") so Google sees the split. No other overlap: `/locations/*` titles are kitchen, bath and remodeling, and `/services` links to `/home-services`. |
| 22 | site-wide | `src/app/favicon.ico` is 285 KB, the largest single transfer on every page. | Medium | Not changed: not added by the new pages. Recommend a 32 px ICO under 5 KB plus `icon.png`/`apple-icon.png`. |
| 23 | site-wide | Two render-blocking CSS files (153 KB raw for the main one, estimated 440 ms) and 139 KiB of unused JavaScript; mobile LCP is 3.7 s on a text element (the h1 or intro paragraph). | Low | Not changed: identical on `/` and `/about`, so not introduced here. The new pages add no images and no new CSS or JS chunks. |
| 24 | /home-services and service pages | Both render per request because the language can come from a cookie (slice A review D7), so there is no CDN caching. | Low | Not changed: request-flow architecture. Recommend resolving the cookie language in middleware so the pages can be static. |
| 25 | sitemap | Every static entry's `lastModified` is the build time, so each deploy claims every page changed. | Low | Not changed: pre-existing pattern for the whole sitemap. Recommend a fixed date per entry, for example a catalog `updatedAt`. |
| 26 | gutter-cleaning | The two-story starting price ($249) is only in the offer description, not a second `Offer`. | Low | Not changed: one offer per service is what SEO2 specifies, and the catalog has no structured field for the second price. |
| 27 | /home-services on a 390 px phone | "Ho-Ho-Kus" can wrap at its own hyphen at the end of the towns line. | Low | Not changed: a non-breaking hyphen would stop the text from matching "Ho-Ho-Kus" searches. Cosmetic. |
| 28 | sitemap priorities | Landing 0.9, English service pages 0.8, all Spanish pages 0.7. | Info | Not changed: sensible, and Google ignores `priority`. |

## Verified without findings

- One `h1` per page on all 16 URLs, and h2/h3 order is valid inside `main` on every page.
- All 16 titles and 16 descriptions are unique; titles are 52 to 59 characters and descriptions 133 to 157, every description names all three counties, and every service title now names them and its price.
- Canonical: English pages are self-canonical, `?lang=es` pages are self-canonical, and every version carries hreflang en, es and x-default (the D6 test and curl agree).
- Meta robots is `index, follow` on all 16 URLs, Spanish included; `robots.txt` does not block `/home-services` for any good bot.
- `/offer/<token>` renders `noindex, nofollow`, and `robots.txt` does not disallow `/offer/`, so crawlers can see the noindex.
- The admin (`/vaca-mgmt`) is disallowed in `robots.txt`, redirects to `/auth` without a session, and its layout sets `noindex, nofollow`; `/admin` redirects to `/free-estimate`.
- Homepage hero: the server HTML has real anchors, primary `href="/home-services#services"` and secondary `href="/portfolio"` (SEO3).
- The header links `/home-services`; the landing links all seven service pages (with `?lang=es` on the Spanish page); no `/request-estimate` link remains on any home services page; there is no `nofollow` on any of the pages.
- The sitemap lists exactly the 16 home services URLs (8 English, 8 Spanish), each once.
- Services offered from the new pages carry no `aggregateRating`; the only rating is the layout organization's.

## JSON-LD parse output

`jsonld-parse.py <url> --strict` after the fixes (with the `@graph` fix from finding 17):

| URL | Script nodes | Merged entities | Entities with rating | Strict |
| --- | --- | --- | --- | --- |
| `/home-services` | 10 | `#organization` (GeneralContractor), 7 x `/home-services/<slug>#service` (Service), `/home-services#faq` (FAQPage) | 1 | PASS |
| `/home-services?lang=es` | 10 | same, FAQ `@id` `/home-services?lang=es#faq` | 1 | PASS |
| `/home-services/exterior-painting` | 4 | `#organization`, `#service`, `#faq` | 1 | PASS |
| `/home-services/exterior-painting?lang=es` | 4 | `#organization`, `#service`, `?lang=es#faq` | 1 | PASS |
| `/home-services/gutter-cleaning` (en and es) | 4 | `#organization`, `#service`, `#faq` | 1 | PASS |
| `/` | 1 | `#organization` | 1 | PASS |

The BreadcrumbList nodes have no `@id`, so the helper does not list them; the Playwright spec checks their URLs.
Each `Service` has `offers` with `priceCurrency: "USD"` and `price` from the catalog (for example `"249.00"` for drywall), `areaServed` of Essex, Morris and Bergen County, NJ as `AdministrativeArea`, and `provider: {"@id": "https://www.lavacagc.com/#organization"}`.
Exterior painting has no top-level `price`; its `priceSpecification` is `UnitPriceSpecification` with `price "2.95"`, `unitCode "FTK"`, `unitText "per square foot"`, `referenceQuantity` 1 FTK, and `eligibleTransactionVolume.minPrice "3500.00"`.

## Lighthouse

Mobile (Lighthouse default emulation, moto g power user agent, so the bot filter is not hit), against `next start` on 3121, three runs each, same machine, after all fixes.

| Page | Performance runs | Median performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- | --- |
| `/home-services` | 89, 89, 89 | 89 | 100 | 100 | 100 |
| `/home-services/exterior-painting` | 90, 89, 89 | 89 | 100 | 100 | 100 |

Median FCP 1.2 s, LCP 3.7 s, TBT 2 to 6 ms, CLS 0.
Before the footer heading fix, accessibility was 98 on both pages (heading-order); every other score was the same.
The slice A review measured 89 for the landing and 89 for a service page, so the SEO changes cost nothing.
No render-blocking resource or image was added by the new pages: both CSS files and the JS chunks are the ones `/` and `/about` load, the pages have no content images, and `image-delivery-insight` passes.

## Files changed

- `src/lib/home-services/catalog.ts`: four service titles in both languages, Spanish cabinet title and description.
- `src/lib/home-services/i18n.ts`: `serviceFaqTitle` with the service name, new `moreServicesTitle`, `areaTowns`, `serviceDetails`.
- `src/lib/home-services/seo.ts`: `pageUrl`, language-aware `Service.url`, exterior unit pricing, `faqJsonLd`, `breadcrumbJsonLd`, `jsonLdGraph`.
- `src/app/home-services/page.tsx`: landing `@graph`, phone link list, towns line.
- `src/app/home-services/[slug]/page.tsx`: shared breadcrumb, FAQPage, sibling section, language-aware links.
- `src/app/sitemap.ts`: hreflang alternates on the 16 home services entries.
- `src/components/Footer.tsx`: `/home-services` link, column titles `h4` to `h2`.
- `tests/home-services-landing.spec.ts`: D12 updated to the corrected price specification; two new tests for the Spanish links, breadcrumb and FAQ markup, and the landing `@graph`.
- `.claude/skills/verify-web/helpers/jsonld-parse.py`: `@graph` and array flattening.

## Checks

- `npm run typecheck`: clean.
- `node_modules/.bin/eslint --max-warnings 0` on every changed source and test file: clean.
- `TEST_URL=http://localhost:3121 E2E_LIVE_BACKEND=1 node_modules/.bin/playwright test tests/home-services-landing.spec.ts --project=chromium` after rebuilding and restarting: 24 passed (22 existing plus 2 new).
- Screenshots at 390 px and 1366 px of the phone link list, the towns line, the Spanish sibling section and the footer: no layout shift, footer titles look identical after the tag change.

## Recommendations, in priority order

1. Shrink `favicon.ico` (finding 22); it is the cheapest page-weight win on every page of the site.
2. Add the seven home services to the organization's `knowsAbout` (finding 20).
3. Cross-link `/services/interior-finishing` to `/home-services/drywall-patching` (finding 21).
4. Make the home services pages static by resolving the cookie language in middleware (finding 24).
5. Give the sitemap real `lastModified` dates (finding 25).
6. Consider a keyword-bearing landing `h1` if the owner accepts a headline change (finding 19).
