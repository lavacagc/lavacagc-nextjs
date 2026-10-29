# La Vaca Home Services Website Build Spec

Oct 29, 2026 · @Alex C

Build spec for the La Vaca website side only: landing page, request flow, lead storage and sub bid requests. SpecNook work is in a separate spec.

## Scope and Systems

The website does four things: show services with starting prices, take a request in as few clicks as possible, store leads for Alex, and send bid requests to subs. Everything about sub signup, agreements, contracts and payments lives in SpecNook.

- Brand: La Vaca General Contractors, NJ HIC 13VH13373800, phone 201 212 4917
- Extend the existing home services landing page; do not build a new site
- Bilingual: English and Spanish on every customer facing screen
- Mobile first; most homeowners arrive from Craigslist and Facebook on a phone

## Homepage Buttons and CTA Testing

The hero carries two buttons. Primary: "Explore My Service Options" to the home services page. Secondary: "See Our Projects" to the remodel gallery. No home care button on the hero.

- Up to seven wording variants (A to G) per button, split evenly, sticky per visitor by cookie
- Variants managed in the admin: wording, color, optional subtext
- Track per variant: views, clicks, requests submitted, valid leads, won jobs (won jobs synced back from SpecNook)
- Admin shows the leader and sample size; no winner declared below a minimum visitor count set in admin
- Start with two or three variants; seven only once traffic supports it
- Starter variants for primary: "Explore My Service Options", "Get a Starting Price", "See Services and Prices", "Request a Quote", "Start My Project"

## Home Services Landing Page

One page: service cards with a checkbox each, one "Request These" button, and a home care signup section below the cards.

The prices below are the original spec; every flat price, and the exterior painting job minimum, has since gone up $100 (docs/decisions/005-prices-plus-100-and-ab-testing.md), and `src/lib/home-services/catalog.ts` owns the live prices.

| Service | Starting price | Card description (two lines) |
| --- | --- | --- |
| Cabinet repainting | $1,995 per kitchen | Clean, sand, prime and spray paint existing cabinet doors and boxes. Price covers a standard kitchen up to 25 doors and drawers. |
| HVAC cleaning | $199 per system | Coil, blower and drain line cleaning plus filter change. One system; add systems at checkout. |
| Duct and vent cleaning | $349 up to 10 vents | Supply and return ducts vacuumed and sanitized. Additional vents priced per vent. |
| Home cleaning | $159 up to 2 bed 1 bath | Full standard clean: kitchen, baths, floors, dusting. Larger homes and deep cleans quoted. |
| Exterior painting | $2.95 per sq ft, $3,500 minimum | Power wash, scrape, prime and two coats on siding and trim. Price from photos and square footage. |
| Gutter cleaning | $179 single story, $249 two story | Clear gutters and downspouts, bag debris, flush and check for leaks. |
| Drywall patching | $249 first patch up to 6 in | Patch, tape, mud, sand, prime and paint to blend. Additional patches priced each. |

- Tapping a price opens a "what's included" popup without leaving the page
- Each service also has its own page (same card content plus photos and FAQ) for SEO; the request button on it preselects that service
- Home care section: short pitch, monthly price, one signup button into the same request flow with Home Care preselected
- Per service chatbot (bilingual) answers scope questions and never commits to a final price; it ends by pushing the request button

## Request Flow

Three screens, no account, no page reloads, under 60 seconds on a phone.

1. Landing page: tick one or more service cards, press "Request These"
2. Details: for each ticked service, two or three tap questions (for example stories: 1, 2, 3+; kitchen size: small, medium, large), photo upload (camera or gallery, up to 10), address with autocomplete
3. Contact: name, phone, email, preferred timing (this week, next two weeks, flexible), submit. Confirmation on screen and by text.

Bot protection, invisible where possible:

- Honeypot hidden field
- Timing check: a form completed in under five seconds is dropped
- Invisible CAPTCHA (Cloudflare Turnstile or reCAPTCHA v3); visible challenge only on low scores
- One time text code to the phone number; unverified leads sit in a Held queue
- Rate limit per IP and per phone; same address plus service within 24 hours merges into the existing lead

## Lead Storage and Admin

Every request is stored in the website database and shown in a password protected admin area.

- Lead fields: services, answers, photos, address, contact, timing, language, source (UTM, Craigslist listing id, CTA variant), CAPTCHA score, phone verified flag, created time
- Statuses: Held (unverified), New, Contacted, Bid Sent, Assigned, Lost
- Admin lead view: all fields, photo gallery, map pin, one click call and text, notes, status change
- Alerts: text and email to Alex on every New lead
- Pricing report: decline reasons and counter prices from sub responses, by service
- CTA report: variant performance from the Homepage section
- Security: admin behind login with two factor, HTTPS only, photo uploads scanned and stored outside the web root, lead data never exposed by URL guessing

## Sub Bid Requests

From any valid lead, Alex sets the sub pay and clicks "Send bid request". The website emails and texts every approved sub in that trade at once. First to accept wins.

Offer email and text contain:

- Job summary, service, town only (not full address), start window, sub pay amount
- Buttons: Accept, Respond (counter, request details, decline), expires in 24 hours
- Unapproved subs see one button: Sign Up on SpecNook (link with trade and referral tag)

Sub response form (website):

- Accept: locks the job, releases full address, alerts Alex, notifies other subs the job is taken
- Counter: sub enters price; alerts Alex, lands in Sub Responses inbox; never auto approved; if Alex accepts the counter the sub must confirm again
- Request details: free text plus file upload; alerts Alex
- Decline with reason (price too low, too far, booked, scope unclear, other); creates a follow up call task for Alex

Handoff to SpecNook:

- Before showing Accept, the website checks the sub's status in SpecNook via API; only Approved subs can accept
- On confirmed acceptance the website pushes to SpecNook: customer, full address, scope, answers, photos, customer price, sub pay, job order text
- The website marks the lead Assigned and does nothing further on that job
- Multi service leads create one bid request per trade
- SpecNook sends back won and completed status so the CTA report can show won jobs

## Existing Site Audit (Before Any Build)

First task: inventory the current La Vaca website and find anything that conflicts with this spec before writing new code.

- List every existing page, component, form, chatbot, CTA button and tracking script, with what it does and where it is used
- Flag conflicts: two components doing the same job (existing quote form vs the new request flow, existing home services page vs the new one, existing hero buttons vs the CTA test), old pricing or service copy that contradicts the starting price table, duplicate analytics or CAPTCHA
- For each conflict, run the "grill me" skill on both options against the spec's goals (fewest clicks, one lead store, one source of truth for prices) and record the answer
- Decision per conflict: keep, replace or merge, with one sentence of reasoning; Opus decides technical ties, Fable decides scope ties, Alex only sees unresolved items
- Output: an audit report in the repo with the inventory, the conflicts and the decisions; nothing in this spec is built until that report is signed off by Fable

## Review Passes

All three run before launch and after any significant change. Each produces a written report with findings and the fix applied or the reason it was not.

1. Click flow: run Matt Pocock's "grill me" skill against the request flow. Goal: fewest clicks and shortest time from landing to submitted request. Every challenge gets an answer or a change.
2. SEO agent: landing page and each service page. Titles, headings, meta descriptions, local keywords for Essex, Morris and Bergen Counties, structured data for services and prices, page speed, internal links from the hero buttons.
3. Security and structure: form handling, bot protection, upload handling, admin access, rate limits, API calls to SpecNook, HTML structure and accessibility.

## Agent Roles and Escalation

- Fable (CEO and planner): breaks this spec into tasks, writes acceptance criteria, signs off completed work against them, final call on scope and priority
- Opus (lead engineer and developer): implements each task, reports what was built, what was tested, what is uncertain; rules on technical disputes
- Supporting models as needed: test writing, SEO review, security review, CTA copy variants
- Hand offs are explicit: plan, build, review, each with a written record; nothing is marked done by the agent that built it
- No single agent has final authority; every claim (done, test passed, fact correct) is corroborated by a second agent before acceptance
- Escalation: disagreement goes to Opus for technical questions, then Fable for the final decision; only what Fable cannot resolve goes to Alex
- Agents cite the spec section or source for any fact they rely on; unsourced claims are treated as unverified

Companion documents: the SpecNook Sub Onboarding Spec (sub signup, documents, agreement e-signature) and the original planning doc, La Vaca Home Services Landing Page Spec.
