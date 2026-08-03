# La Vaca GC — Home Services Line: Agreement Architecture Analysis

**Status:** Source-of-truth legal brief, to be reviewed by NJ-licensed counsel before any agreement is executed.
**Prepared for:** Alex Tejena, President, La Vaca General Contractors, LLC
**Date prepared:** 2026-05-13
**Source documents reviewed:**
- `/Users/alexc.tejena/Downloads/la_vaca_sales_one_pagers_v2.md` (residential + commercial service menu, v2)
- `/Users/alexc.tejena/terminal-projects/contracts_macApp/assets/CUST-contract.md` (existing project-based GC contract template)
- https://www.lavacagc.com/privacy-policy (not retrievable at time of analysis; flagged for separate review)
- https://www.lavacagc.com/data-rights (not retrievable at time of analysis; flagged for separate review)

**Important disclaimer:** This is a non-attorney architecture analysis intended to brief a NJ-licensed attorney. Statutory citations should be confirmed by counsel before use in any executed agreement. This document does not constitute legal advice.

---

## Business Snapshot

- **Entity:** La Vaca General Contractors, LLC (NJ LLC)
- **HIC #:** 13VH13373800
- **Principal:** Alex Tejena, President
- **Address:** 51 Crestmont Rd, West Orange, NJ 07052
- **Service area:** Bergen, Essex, Morris, Passaic counties
- **Insurance:** $1M CGL via UFG Insurance Policy #10128621518
- **Bond:** $25,000 compliance bond via Travelers Casualty and Surety Company of America (note: NJ requires $50K bond if single contract >$120K or aggregate >$750K/12 months — likely needs upsizing as this services line scales)
- **Workers' comp:** Currently exempt under N.J.S.A. 34:15-1 et seq. (no payroll). Status will need to change if any W-2 employee is added or if subcontractors lack their own coverage.
- **Workforce model:** Mixed — La Vaca may use employees, subcontractors, and licensed trade partners depending on scope.

---

## 1. Recommended Agreement Architecture

### Agreement 1: Residential Membership Agreement
**What it is:** A subscription services agreement governing monthly or annual recurring membership (Essential, Plus, Concierge tiers). Establishes the ongoing service relationship, auto-renewal mechanics, use-it-or-lose-it hour rules, cancellation procedures, and member pricing structure.
**Who signs:** La Vaca GC (Contractor) and residential homeowner (Consumer).
**How long it runs:** Month-to-month or annual term with auto-renewal unless cancelled.
**Status:** NEW DRAFT — nothing in the existing CUST-contract.md addresses subscriptions.
**Load-bearing NJ statutes:**
- N.J.S.A. 56:12-16 et seq. (Automatic Renewal Law) — conspicuous pre-renewal notice required; specific font and placement requirements; cancellation method must be as easy as the sign-up method
- N.J.S.A. 56:8-1 et seq. (Consumer Fraud Act) — failure to disclose material terms (including use-it-or-lose-it policy) is a deceptive practice subject to treble damages
- N.J.S.A. 56:8-136 et seq. (Home Improvement Practices Act) — the annual included visits and hours are "home improvement" contracts; HIC license number must appear
- N.J.S.A. 17:16C-1 et seq. and applicable card network rules for recurring card-on-file billing
- N.J.S.A. 56:12-14 et seq. (Plain Language Act) — consumer contracts must be written in plain language

### Agreement 2: Residential À La Carte Service Agreement / Work Order
**What it is:** A per-visit written agreement for any standalone residential service. Serves as both the HIC-required written contract (for work $500+) and as a binding scope-of-work document for sub-$500 visits.
**Who signs:** La Vaca GC and residential homeowner.
**How long it runs:** Single-engagement; no renewal.
**Status:** NEW DRAFT — CUST-contract.md is project-oriented (Substantial Completion model) and incompatible with a $99 detector check or $295 audit.
**Load-bearing NJ statutes:**
- N.J.S.A. 56:8-136 et seq. (Home Improvement Practices Act) — written contract required for all home improvement work $500 or more; license number on face of contract; specific content requirements
- N.J.A.C. 13:45A-16.2 (Home Improvement Practices regulations) — detailed content requirements for the written contract
- N.J.S.A. 56:8-152 (3-day right of rescission for in-home solicitations) — rescission notice required even for e-signed remote transactions if initiated by contractor contact
- N.J.S.A. 2A:44A-1 et seq. (Construction Lien Law) — mechanics' lien notice required on contracts $500+
- N.J.S.A. 45:8-61 et seq. (Home Inspectors' Licensing Act) — disclaimer required that Annual Home Safety Audit and property visits are NOT regulated home inspections

### Agreement 3: Project / Remodel GC Agreement (Existing Template)
**What it is:** The existing CUST-contract.md, retained for capital improvement and remodel projects only. Scope-limited to permitted work, kitchen/bath/addition projects, and any single contract exceeding $2,500.
**Who signs:** La Vaca GC and residential or small commercial client.
**How long it runs:** Project-specific; terminates at Substantial Completion and final payment.
**Status:** REFINEMENT of existing template. The existing contract is well-structured and legally sound for its intended purpose. Refinements needed: (a) align the $350/hr change order rate disclosure with the separate handyman pricing schedule; (b) add a cross-reference carveout confirming that membership and handyman services are governed by separate agreements.
**Load-bearing NJ statutes:** All statutes currently cited in the template; no material changes needed for this agreement class.

### Agreement 4: Commercial Property Care Master Service Agreement (MSA)
**What it is:** A master B2B services agreement establishing the ongoing commercial relationship, governing all property locations under management, setting general terms, liability allocation, and insurance requirements. Individual properties are added via Per-Property Service Orders.
**Who signs:** La Vaca GC and commercial entity (LLC, corp, property management company, individual landlord acting in commercial capacity).
**How long it runs:** Annual with auto-renewal; 30-day written termination right after initial minimum period (first 90 or 180 days depending on tier, consistent with the sales one-pager terms).
**Status:** NEW DRAFT — B2B context means HIC Act consumer protections technically do not apply (verify with NJ counsel — the HIC Act applies to "home improvement" on residential property; commercial property is generally outside scope). However, the CFA can still apply to business transactions in some circumstances; do not strip protections entirely.
**Load-bearing NJ statutes:**
- N.J.S.A. 2A:44A-1 et seq. (Construction Lien Law) — still applies to commercial properties for any repair work
- N.J.S.A. 46:8-19 et seq. (Rent Security Deposit Act) — relevant where pre/post-tenant documentation services are performed (see Agreement 10)
- N.J.S.A. 34:15-1 et seq. (Workers' Compensation) — representations about subcontractor coverage status needed
- Standard UCC Article 1 and NJ contract law govern B2B terms

### Agreement 5: Commercial Per-Property Service Order / SOW
**What it is:** A short-form addendum to the MSA, executed for each additional property added to the commercial account. Specifies property address, applicable tier, included hours, named additional insured requirements, and key holder authorization (if applicable).
**Who signs:** La Vaca GC and the commercial client.
**How long it runs:** Co-terminous with MSA or property-specific term.
**Status:** NEW DRAFT (template addendum).

### Agreement 6: Subcontractor Agreement Template (Snow Vendor and Others)
**What it is:** A written subcontract governing any 1099 trade partner performing work on La Vaca's behalf, including the snow vendor. Establishes scope, payment, insurance requirements, indemnification flow-down, lien waiver obligations, and independent contractor classification.
**Who signs:** La Vaca GC (as general contractor/prime) and the subcontractor.
**How long it runs:** Project-by-project, or annual for the snow vendor relationship.
**Status:** NEW DRAFT — no written agreement with the snow vendor currently exists. This is a HIGH-PRIORITY gap (see Section 3).
**Load-bearing NJ statutes:**
- N.J.S.A. 34:15-1 et seq. (Workers' Compensation) — sub must carry its own workers' comp or provide valid exemption certificate; La Vaca potentially liable if sub's workers are injured on property and sub lacks coverage
- N.J.S.A. 43:21-1 et seq. (Unemployment Compensation Law) — ABC test for independent contractor classification; misclassification exposure is significant
- N.J.S.A. 2A:44A-1 et seq. (Construction Lien Law) — lien waiver flow-down required
- N.J.S.A. 56:8-1 et seq. (CFA) — snow vendor markup transparency (see Section 2)

### Agreement 7: Licensed Trade Partner Agreement (HVAC, Plumbing, Electrical Referrals)
**What it is:** A short-form agreement or letter of understanding with licensed HVAC contractors, master plumbers, and electricians who receive referrals from La Vaca or who are coordinated by La Vaca at a management markup (Operations/Full-Service commercial tiers). Distinct from a subcontractor agreement because La Vaca is not always the contracting party for these services.
**Who signs:** La Vaca GC and the licensed trade partner.
**How long it runs:** Annually renewable relationship agreement, not project-specific.
**Status:** NEW DRAFT (simple). Key distinction: when La Vaca "coordinates" and invoices the client at cost plus markup, La Vaca is functioning as a prime contractor for that sub-scope and the lien law and indemnification provisions of Agreement 6 apply. When La Vaca merely "refers," the trade partner contracts directly with the client and this agreement is a referral-only framework.
**Load-bearing NJ statutes:**
- N.J.S.A. 45:1-1 et seq. (licensing requirements for trades) — La Vaca must not hold itself out as performing licensed trade work
- NJREC Rule 11:5-6 et seq. — if any referral fee flows to a real estate licensee, separate compliance required; this agreement should contain a warranty that trade partner will not pay or accept unlicensed kickbacks

### Agreement 8: Key Holder Authorization and Access Addendum (Commercial)
**What it is:** A standalone addendum to the Commercial MSA/Service Order authorizing La Vaca to hold physical keys or access codes to a commercial property, establishing access logging obligations, security protocols, liability allocation for unauthorized access, and revocation procedures.
**Who signs:** La Vaca GC, commercial property owner, and ideally property manager if separate.
**How long it runs:** Co-terminous with Full-Service tier; immediately terminable by either party on written notice.
**Status:** NEW DRAFT — no existing coverage in any current document.
**Load-bearing NJ statutes/law:**
- NJ common law of bailment — La Vaca is a bailee of the key/access credentials; standard of care is reasonable care; contract should define that standard and disclaim liability for unauthorized access by third parties if La Vaca's storage protocols are followed
- NJ criminal law — key theft or unauthorized entry exposure; the addendum should require a written access log with timestamps
- CGL insurance verification — confirm with UFG that key holder activity is covered (see Open Decisions)
- N.J.S.A. 2C:18-2 et seq. (criminal trespass) — access log protects La Vaca employees from this exposure as well

### Agreement 9: Home Passport Data and Hosting Addendum (Residential)
**What it is:** A standalone addendum to either the Residential Membership Agreement or the À La Carte Work Order governing the collection, storage, hosting, access, and eventual deletion of sensitive home data (shutoffs, panel maps, equipment serials, paint colors, vendor lists, warranty docs, etc.) hosted on La Vaca's private web page.
**Who signs:** La Vaca GC and the residential homeowner.
**How long it runs:** 5-year initial hosting term; renewable; terminates on homeowner written request or membership cancellation.
**Status:** NEW DRAFT — no data governance document currently exists.
**Load-bearing statutes/requirements:**
- NJ Data Privacy Act (P.L. 2023, c. 266, effective January 15, 2025) — verify with NJ counsel whether La Vaca meets the threshold for applicability (100,000+ NJ residents' data processed, or 25,000+ with revenue from data sales — likely not triggered at launch but worth auditing as scale grows)
- NJ Identity Theft Prevention Act, N.J.S.A. 56:11-44 et seq. — breach notification obligations apply to any business maintaining computerized records of personal information on NJ residents, regardless of size
- PCI DSS — if payment card data is stored alongside Home Passport data, PCI scope expands; the addendum should disclaim card data storage and confirm scope isolation
- Photo/video consent — separate from data hosting but should be addressed here or in a Photo Release (Agreement 13)

### Agreement 10: Pre-Listing / Pre-Tenant / Post-Tenant Documentation Engagement Letter
**What it is:** A short-form engagement letter (not a full contract) for real-estate-adjacent services: Pre-Listing Home Prep, Pre-Listing Property Walk, Pre-Tenant Documentation, Post-Tenant Documentation. Establishes scope limits, "not a home inspection" disclaimer, "not a legal opinion on security deposit deductibility" disclaimer, and real estate broker referral compliance acknowledgment.
**Who signs:** La Vaca GC and the property owner (homeowner or commercial landlord).
**How long it runs:** Single-engagement.
**Status:** NEW DRAFT.
**Load-bearing NJ statutes:**
- N.J.S.A. 46:8-19 et seq. (Rent Security Deposit Act) — post-tenant documentation services must explicitly disclaim that La Vaca is not providing legal advice about deductibility; the documentation deliverable must be structured to meet the statute's "written statement" standards if landlord intends to use it for a deduction (verify exact format requirements with NJ counsel)
- N.J.S.A. 45:15-1 et seq. (Real Estate Brokers and Salespersons Act) and NJREC Rule 11:5-6 — any referral fee from or to a licensed real estate broker or agent is restricted; the engagement letter must represent that La Vaca receives no referral fee from any real estate licensee
- N.J.S.A. 45:8-61 et seq. (Home Inspectors' Licensing Act) — the pre-listing report is NOT a regulated home inspection; the letter must contain a conspicuous disclaimer in bold or all-caps

### Agreement 11: Privacy Policy and Data Rights Page
**What it is:** Public-facing policy statements on the website governing data collection, retention, sale/sharing, and consumer rights (access, deletion, correction).
**Who signs:** Not an agreement in the traditional sense; constitutes a unilateral representation enforceable under the CFA if not followed.
**Status:** REQUIRES SEPARATE REVIEW — the existing pages at lavacagc.com/privacy-policy and /data-rights could not be fetched at time of analysis. They must be audited against: (a) Home Passport data collection scope; (b) payment card handling and PCI; (c) photo/video taken during service visits; (d) NJ Data Privacy Act threshold analysis; (e) NJ Identity Theft Prevention Act breach notice procedures; (f) COPPA if any minors' information could be collected.

### Agreement 12: Auto-Renewal Disclosure (Standalone or Embedded)
**What it is:** A separate conspicuous disclosure block, either a standalone one-page document or a prominent section within the Residential Membership Agreement, satisfying the NJ Automatic Renewal Law. This is not optional — it is a statutory compliance element.
**Who signs:** Consumer signs or initials to acknowledge receipt.
**Status:** NEW — must be included in Agreement 1.
**Load-bearing statutes:** N.J.S.A. 56:12-16 et seq. — requires that the offer of automatic renewal be "clearly and conspicuously" disclosed before the subscription is accepted; must disclose (a) that the subscription will automatically renew, (b) the length of the renewal term, (c) the price that will be charged, and (d) how to cancel. For annual subscriptions, an advance written reminder must be sent no fewer than 30 and no more than 60 days before the renewal date. "Clearly and conspicuous" under NJ case law means larger font, contrasting color, or capitalization — not buried in body text.

### Agreement 13: Photo, Video, and Marketing Release
**What it is:** A short written consent form authorizing La Vaca to use photos or videos taken at the customer's property for marketing, social media, portfolio, or website purposes.
**Who signs:** Property owner (homeowner or commercial client).
**How long it runs:** Perpetual unless revoked.
**Status:** NEW DRAFT (short form; likely a one-page insert or digital acknowledgment).
**Load-bearing law:** NJ common law right of publicity and privacy; CFA if photos are used after explicit denial of consent; GDPR considerations if any European-resident clients.

### Agreement 14: COI Additional Insured Acknowledgment (Commercial)
**What it is:** A short acknowledgment confirming that La Vaca's carrier has added the named party as an additional insured on the CGL policy, with a statement of current policy number, limits, and effective dates.
**Who signs:** Provided by La Vaca to the commercial client (not bilaterally signed; it is a carrier endorsement).
**Status:** EXISTING PRACTICE (La Vaca already issues COIs). The MSA should contain the contractual obligation to issue and maintain these; the COI itself is a certificate, not an agreement. The MSA should specify (a) how quickly La Vaca will respond to COI requests (the sales one-pager says "30 seconds"), (b) who pays for additional insured endorsements (typically the prime), and (c) what notice La Vaca provides if coverage lapses.

---

## 2. Per-Agreement Required Clauses and NJ Statutes

### Agreement 1 — Residential Membership Agreement

| Clause | Driving Statute / Requirement |
|---|---|
| HIC license number on face of agreement | N.J.S.A. 56:8-149; N.J.A.C. 13:45A-16.2 |
| 3-day right of rescission notice in bold/all-caps | N.J.S.A. 56:8-152; N.J.A.C. 13:45A-16.2(a)(12) |
| Auto-renewal disclosure: conspicuous font, renewal term, price, cancellation method | N.J.S.A. 56:12-16 et seq. |
| 30–60 day advance renewal reminder for annual plans | N.J.S.A. 56:12-17 (verify exact language requirement with NJ counsel) |
| Use-it-or-lose-it policy stated in plain language with member acknowledgment | N.J.S.A. 56:8-1 et seq. (CFA — omission of material fact) |
| No rollover / no refund of unused hours — carve-out for refunds "as required by law" | N.J.S.A. 56:12-16; verify whether NJ recognizes any per se right to partial refund on unused subscription services (research open — flag for NJ counsel) |
| After-hours premium rate ($245/hr) disclosed upfront | N.J.S.A. 56:8-136 et seq.; N.J.A.C. 13:45A-16.2 — must be in original agreement, not surprise at invoice |
| Materials markup (retail + 25%) disclosed upfront | N.J.A.C. 13:45A-16.2(a)(7) |
| "Not a regulated home inspection" disclaimer (for Annual Safety Audit and property visits) | N.J.S.A. 45:8-61 et seq. (Home Inspectors' Licensing Act) |
| Limitation of liability with explicit Consumer Fraud Act carve-out | N.J.S.A. 56:8-2; Section 8 of existing template is a good model |
| Plain language requirement | N.J.S.A. 56:12-14 et seq. |
| Mechanics' lien notice (if any included service involves work $500+) | N.J.S.A. 2A:44A-1 et seq. |
| Cancellation procedure: how, when effective, any fee | N.J.S.A. 56:12-16 et seq. |

**Critical NJ Auto-Renewal note:** N.J.S.A. 56:12-16 requires that if a business fails to give proper advance notice before an annual renewal, the consumer may cancel within the first subscription period after the renewal and receive a pro-rata refund. If La Vaca proceeds without this notice, the contract language saying "no refund" becomes unenforceable for that renewal cycle.

### Agreement 2 — Residential À La Carte Work Order

| Clause | Driving Statute / Requirement |
|---|---|
| HIC # on face; contractor name, address, phone | N.J.A.C. 13:45A-16.2(a)(1)–(3) |
| Written contract required before work begins (for $500+ jobs) | N.J.S.A. 56:8-151 |
| Detailed scope of services (defined inclusions/exclusions per service one-pager) | N.J.A.C. 13:45A-16.2(a)(6) |
| Total price stated; all payment terms stated | N.J.A.C. 13:45A-16.2(a)(7) |
| 3-day right of rescission notice | N.J.S.A. 56:8-152; N.J.A.C. 13:45A-16.2(a)(12) |
| "DO NOT SIGN IN BLANK" notice | N.J.A.C. 13:45A-16.2(a)(13) |
| Mechanics' lien notice | N.J.S.A. 2A:44A-1 et seq. |
| "Not a regulated home inspection" disclaimer | N.J.S.A. 45:8-61 et seq. |
| "Not an environmental/lead/mold/asbestos assessment" disclaimer | Multiple NJ DCA/DEP regulations; CFA exposure if customer relies on La Vaca's observations for remediation decisions |
| ADA disclaimer for Aging-in-Place Quick-Install | ADA Title III; La Vaca is not CAPS-certified; grab bar placement per standard, but no ADA compliance certification should be stated or implied |
| After-hours rate ($245/hr) stated if visit could go after hours | N.J.A.C. 13:45A-16.2; CFA |
| Photo/video consent (if photos taken for record) | NJ privacy law; CFA if used for marketing without consent |
| Warranty limited to workmanship only, not materials customer supplies | Consistent with CUST-contract Section 2.6(e) model |

### Agreement 4 — Commercial Property Care MSA

| Clause | Driving Statute / Requirement |
|---|---|
| Independent contractor / subcontractor flow-down (workers' comp, insurance, lien waivers) | N.J.S.A. 34:15-1 et seq.; N.J.S.A. 2A:44A-1 et seq. |
| Snow vendor markup transparency: disclose that La Vaca charges cost + markup and approximate markup range | N.J.S.A. 56:8-1 et seq. (CFA) — even B2B, commercial fraud claim is possible; transparency is the safest position |
| Named additional insured COI obligations: timeline and lapse notification | UFG policy terms; commercial standard practice |
| Key holder authorization: reference to Addendum (Agreement 8) required | NJ bailment law |
| "Not a regulated property condition assessment (PCA)" disclaimer for walkthroughs | ASTM E2018 governs regulated PCAs; La Vaca's walkthroughs are not PCAs |
| "Not a code compliance certification" disclaimer | Multiple NJ DCA/municipal ordinance contexts |
| Termination with and without cause; cure period | NJ contract law; consistent with sales one-pager (30-day notice, no penalty after minimum period) |
| Multi-property model: each property governed by separate Service Order | Necessary for lien law segregation and insurance clarity |
| Specialty sub coordination markup: 15–20% disclosed in writing | CFA analog even in B2B context |
| Workers' compensation status of La Vaca and its subcontractors | N.J.S.A. 34:15-1 et seq. |

### Agreement 6 — Subcontractor Agreement (Snow Vendor)

| Clause | Driving Statute / Requirement |
|---|---|
| Independent contractor vs. employee classification: ABC test compliance | N.J.S.A. 43:21-19(i)(6)(A)(B)(C) — NJ uses the ABC test; the sub must perform services outside La Vaca's usual course of business (part B) and be customarily engaged in an independent trade (part C) |
| Snow vendor must carry own CGL ($1M minimum) and workers' comp | N.J.S.A. 34:15-1 et seq. |
| La Vaca named as additional insured on snow vendor's CGL | Standard subcontract requirement |
| Lien waiver from snow vendor upon payment | N.J.S.A. 2A:44A-1 et seq. |
| Markup transparency: sub acknowledges La Vaca will resell services at a markup | Necessary to prevent sub from undermining La Vaca's client relationships; also CFA prophylaxis |
| Non-solicitation: sub cannot directly contract with La Vaca's commercial clients during and for 1–2 years after the relationship | NJ enforceability of non-solicitation clauses requires reasonable scope and duration — verify with NJ counsel |
| Photo proof of service delivery obligation | Operational requirement already in the snow coordination service description |
| Seasonal performance standards with cure/termination right | Operational; the one-pager already references "one sub-vendor change per season" |
| Indemnification flow-down: sub indemnifies La Vaca for sub's negligence | Standard |

### Agreement 9 — Home Passport Data and Hosting Addendum

| Clause | Driving Statute / Requirement |
|---|---|
| Enumeration of data collected (shutoffs, panel map, equipment serials, paint colors, vendor list, warranty docs, photos) | NJ Data Privacy Act (P.L. 2023, c. 266) — even if below threshold, good practice |
| 5-year hosting term; what happens on expiration/cancellation | Prevent abandonment of sensitive home data; breach of this could be CFA violation |
| Customer export right: homeowner can request their data in usable format | NJ Data Privacy Act and general consumer rights best practice |
| Deletion procedure: La Vaca must delete all data within a specified period after written cancellation request | NJ Identity Theft Prevention Act, N.J.S.A. 56:11-44 et seq. |
| Data breach notification: 72-hour notify to customer (or sooner if possible) if breach occurs | N.J.S.A. 56:8-161 (NJ Identity Theft Prevention Act — requires notification to affected consumers and NJ AG) |
| PCI scope isolation: no payment card data stored in Home Passport system | PCI DSS Requirement 3; CFA if stored insecurely |
| Photo/video usage: photos taken during setup are for the homeowner's Passport only, not for marketing without separate release | NJ privacy; CFA |
| Password security obligations on La Vaca's side (password-protected page as described in service) | Good practice; also relevant if NJ Data Privacy Act ever applies |
| Data ownership: homeowner owns their home data; La Vaca is a custodian only | CFA prophylaxis |

### Agreement 10 — Pre-Listing / Pre-Tenant Engagement Letter

| Clause | Driving Statute / Requirement |
|---|---|
| "NOT A REGULATED HOME INSPECTION" in bold/all-caps at top of document | N.J.S.A. 45:8-61 et seq. — violation is a disorderly persons offense; CFA treble damages exposure |
| "NOT LEGAL ADVICE REGARDING SECURITY DEPOSIT DEDUCTIBILITY" | N.J.S.A. 46:8-19 et seq. — La Vaca cannot advise what is legally deductible |
| Documentation format meets the statute's standard for condition statements | N.J.S.A. 46:8-19 et seq. — research with NJ counsel what the statute requires as a proper move-in condition statement |
| No referral fee paid to or received from any NJ-licensed real estate broker or agent | N.J.S.A. 45:15-1 et seq.; NJREC Rule 11:5-6 et seq. — even nominal kickbacks are violations; the letter should require client to represent that no such arrangement exists |
| "NOT A FORMAL PROPERTY CONDITION ASSESSMENT (PCA)" disclaimer for commercial version | ASTM E2018; commercial buyer reliance risk |
| Photo timestamp and EXIF metadata preservation obligation | Best practice for security deposit dispute use |
| Report delivery timeline (3 business days per one-pager) | Operational commitment enforceable under NJ contract law |

---

## 3. Highest-Risk Gaps in the Existing CUST-Contract Template

The following deficiencies in CUST-contract.md create New Jersey Consumer Fraud Act exposure — specifically, the risk of treble damages (3x actual damages) plus mandatory attorney's fees under N.J.S.A. 56:8-2 and N.J.S.A. 56:8-19 — if the existing template is used for the new services line without modification.

**Gap 1 — No auto-renewal disclosure (CRITICAL)**
Using CUST-contract.md for a membership subscription without auto-renewal language that satisfies N.J.S.A. 56:12-16 et seq. is a per se violation. Every monthly or annual bill charged without proper prior disclosure of auto-renewal terms creates a new CFA exposure. The statute requires the disclosure to be "clearly and conspicuous" before the agreement is completed. Treble damages on every improperly auto-renewed subscription charge is a realistic exposure scenario.

**Gap 2 — $350/hr change order rate (HIGH)**
CUST-contract.md Section 4.2.2 specifies $350/hr for change order labor. If any version of this template is used for handyman work and a dispute arises, the customer will argue that $350/hr was never disclosed as the applicable rate for $95–$125/hr handyman services. Under N.J.A.C. 13:45A-16.2(a)(7), all pricing must be stated in the contract. A bait-and-switch between a $99 service booking and a $350/hr change rate is a textbook CFA claim.

**Gap 3 — No "not a home inspection" disclaimer (CRITICAL)**
The Annual Home Safety Audit, Sump Pump Pro Test, all property visits, commercial walkthroughs, and vacancy watch services all involve observations about the condition of a residential or commercial property. Performing these services without a written disclaimer that the service is not a regulated NJ home inspection (N.J.S.A. 45:8-61 et seq.) exposes La Vaca to both regulatory sanction (performing unlicensed home inspection services) and CFA claims if a customer relies on the report as an official inspection. The service one-pager's "not a regulated home inspection" language is marketing copy, not a legally sufficient disclaimer — it must be in the signed agreement.

**Gap 4 — No Home Passport data governance (CRITICAL)**
The CUST-contract.md has no data collection, retention, or deletion provisions. Using it (or any derivative) to govern a service that collects home security shutoff locations, access credentials, appliance serials, and sensitive home infrastructure data without a data governance addendum is a live breach-notification liability under N.J.S.A. 56:8-161 and a potential CFA claim (deceptive omission of material terms regarding data custody).

**Gap 5 — No key holder authorization framework (HIGH)**
The existing template has no key/code custody provision. Accepting a commercial client's key under a GC contract that does not address bailment, access logging, or revocation procedure exposes La Vaca to unlimited liability if an unauthorized use of that key results in property damage, theft, or personal injury. La Vaca's CGL may not cover this scenario without a specific endorsement — this must be confirmed with UFG (see Open Decisions).

**Gap 6 — No snow vendor markup disclosure (HIGH)**
The existing template has no mechanism to disclose a third-party markup on coordinated services. When La Vaca bills clients for snow removal at sub cost plus 20–25% markup without disclosing the markup arrangement in writing, it exposes La Vaca to a CFA claim based on the argument that the client was deceived about what they were paying for. Even in commercial contexts, N.J.S.A. 56:8-1 provides broad reach. The written subcontractor agreement (currently nonexistent) and the commercial MSA must both address this.

**Gap 7 — No ADA and environmental work disclaimers (MEDIUM)**
The Aging-in-Place Quick-Install and ADA Stripe services involve work standards governed by the Americans with Disabilities Act. The existing template has no disclaimer that La Vaca is not CAPS-certified and is not issuing ADA-compliant work certifications. Similarly, no disclaimer exists for the environmental exclusion (mold, lead, asbestos, radon). These create reliance liability: if a customer argues they hired La Vaca specifically to achieve ADA or code compliance and it was never achieved, the absence of a disclaimer in the signed agreement is a CFA risk.

**Gap 8 — No real estate referral compliance clause (MEDIUM)**
The existing template has no representation regarding referral fees with real estate licensees. For Pre-Listing Home Prep and Pre-Listing Property Walk services that are frequently referred by real estate agents, the absence of a written representation creates ambiguity. NJREC Rule 11:5-6 et seq. prohibits fee-splitting with unlicensed persons and restricts arrangements with licensed brokers. A written acknowledgment in the engagement letter protects La Vaca if the referral relationship is ever scrutinized.

**Gap 9 — Warranty structure incompatible with short-cycle services (MEDIUM)**
The 1+4-year warranty structure in CUST-contract.md is operationally unworkable for a $99 detector check or $195 storm prep visit. Applying a 5-year structural warranty to a sump pump test creates an absurd result — La Vaca would theoretically be warranting the pump's structural integrity for 5 years after a $125 inspection. New agreements need a tiered warranty structure: (a) workmanship only, 30-day warranty for handyman repairs; (b) no warranty on inspection-only services (no repair performed); (c) manufacturers' pass-through only for installed components.

---

## 4. Open Decisions for Alex / Attorney

These items must be resolved before any of the launch-blocker agreements can be finalized. The first 10 are the priority decisions; an additional supplemental list follows.

### Priority Decisions (10)

**1. Bond upsize timing**
The current $25,000 Travelers compliance bond is adequate only if single contracts stay below $120,000 and aggregate annual volume stays below $750,000. NJ requires a $50,000 bond above either threshold. As recurring commercial contracts scale (e.g., ten Operations tier clients = $107,400/year in recurring contracts alone, plus any project work), the $750,000 aggregate threshold could be reached within the first year. **Decide now:** when to upsize to $50K, and budget for the higher premium. Confirm with Travelers what notice they need.

**2. Workers' compensation trigger**
La Vaca is currently exempt under N.J.S.A. 34:15-1 et seq. (no payroll). The moment La Vaca adds a single W-2 employee — even one part-time tech — workers' comp coverage becomes mandatory. If La Vaca uses 1099 subcontractors who themselves lack workers' comp, La Vaca may be deemed a "statutory employer" under N.J.S.A. 34:15-79, exposing La Vaca to claims from injured sub-workers. **Decide now:** workforce model going forward (employees vs. subs vs. 1099s), and the trigger date by which coverage will be obtained.

**3. E-signature / 3-day rescission delivery**
The 3-day right of rescission under N.J.S.A. 56:8-152 requires that the rescission notice be provided to the consumer at the time the contract is signed. For e-signed agreements, the consumer must receive the notice electronically in a way they can retain. The platform used (DocuSign, HelloSign, Jotform Sign, etc.) must deliver the rescission notice at signature, not in a follow-up email. **Decide now:** which e-signature platform, and verify it presents the rescission notice on the same signing screen.

**4. Class-action waiver risk**
Alex's preference is to include a class-action waiver. NJ courts have shown hostility to class-action waivers in consumer adhesion contracts. The NJ CFA (N.J.S.A. 56:8-20) preserves class action rights, and some NJ case law has held class waivers unenforceable when embedded in standard-form consumer contracts. **Decide with NJ counsel:** whether a mandatory arbitration plus class waiver clause is defensible in the residential membership context, or whether it creates more litigation risk than it solves. For commercial B2B contracts the analysis is different and the waiver is more likely enforceable.

**5. UFG key-holder coverage confirmation**
Before launching the Full-Service commercial tier (which includes a key holder service), Alex must confirm with UFG Insurance (Policy 10128621518) whether: (a) key holder / custodian-of-client-property activity is covered under the existing CGL; (b) a crime or fidelity bond is required; (c) a separate bailment or care-custody-control endorsement is needed; (d) whether access log requirements are conditions of coverage. **Decide now:** before any key is accepted from a client.

**6. Refund/cancellation policy for unused membership hours**
Alex's stated preference is "no rollover, no refund except as required by law." NJ counsel must confirm whether any NJ statute (CFA, Auto-Renewal Law, or consumer service contract regulations) requires a pro-rata refund for services paid but not delivered after cancellation. Concrete test case: a member pays $420 upfront on January 1st and cancels on July 1st, having received only the spring visit. Is the unused fall visit, safety audit, and sump test portion refundable? **Decide with NJ counsel:** the exact refund language, and whether it differs for monthly vs. annual plans.

**7. Snow vendor insurance and indemnity requirements**
Before Agreement 6 (Snow Vendor Subcontractor) is drafted, the snow sub-vendor's identity must be provided so the contract can be executed. The vendor must carry: (a) own CGL with La Vaca named as additional insured ($1M minimum recommended); (b) workers' comp for their employees; (c) commercial auto for plow trucks. Operating without this documentation means La Vaca is assuming the snow vendor's uninsured risk on every commercial property. **Decide now:** vendor identity, current coverage status, and indemnification scope (one-way to La Vaca, or mutual).

**8. Home Passport data retention / deletion**
The current data rights page at lavacagc.com/data-rights should be reviewed against Home Passport's specific data scope. Open questions: (a) retention period after cancellation (immediate delete, 30 days, 90 days?); (b) export format provided to homeowner on offboarding; (c) backup retention — do encrypted backups need to be purged on deletion request?; (d) whether data is ever shared with sub-vendors (and if so, contract flow-down required); (e) breach notification timeline and method. **Decide now:** the exact retention/deletion policy so it can be written into the addendum.

**9. Real estate referral handling**
Alex states real estate agents may refer but do not pay/receive fees. NJ counsel must confirm whether any arrangement (including non-monetary benefits — free consults, marketing co-branding, referral reciprocity) could constitute a kickback under NJREC Rule 11:5-6 et seq. Also: La Vaca's referrals out to licensed HVAC/plumbers/electricians at a coordination markup — confirm no licensing or referral issue. **Decide with NJ counsel:** the exact representation language in the Pre-Listing engagement letter.

**10. Which services are excluded from membership coverage**
The service one-pagers already enumerate detailed "What's NOT Covered" lists per tier. These lists must be reproduced verbatim — or by reference — inside the Membership Agreement to create a binding contractual scope. Open question: are there any services the menu currently treats as "not covered" that should be more clearly excluded (e.g., specialty trade work, materials markup, properties over 6,000 SF, multi-property situations)? **Decide now:** confirm the menu's exclusion lists are final, and decide whether to attach the one-pagers as Exhibit A or restate them inline.

### Supplemental Items Surfaced by Analysis

**S1. Privacy policy adequacy review**
The existing pages at lavacagc.com/privacy-policy and /data-rights could not be fetched at time of analysis. NJ counsel should review them against: Home Passport's data scope, NJ Identity Theft Prevention Act breach procedures (N.J.S.A. 56:8-161), NJ Data Privacy Act threshold analysis, PCI handling, photo/video consent scope, and COPPA. **Action:** provide counsel with the live page content.

**S2. Annual vs. monthly billing finalization**
Alex has noted annual upfront billing is "possible but not finalized." The NJ Auto-Renewal Law treats annual subscriptions differently from monthly (30–60 day advance reminder applies to annual). Finalize the billing model — monthly only, annual only, or both — before drafting the membership agreement, since the auto-renewal language differs.

---

## 5. Prioritized Drafting Roadmap

The following sequence balances legal exposure, revenue impact, and reusability. The goal is a minimum viable legal stack that allows La Vaca to begin signing residential memberships and commercial contracts safely within 30–60 days.

### Tier 1 — Draft First (Block Launch Without These) ← LAUNCH BLOCKERS

**Priority 1: Residential Membership Agreement (Agreement 1) + Auto-Renewal Disclosure (Agreement 12)**
These must be drafted together as a single document. Without them, every residential membership signed is a CFA violation waiting to happen (missing auto-renewal disclosure, missing use-it-or-lose-it acknowledgment, missing rescission notice in the correct format). This is both the highest legal exposure and the highest revenue document.

**Priority 2: Subcontractor Agreement Template — Snow Vendor (Agreement 6)**
The snow vendor relationship is operating without any written agreement. The moment a commercial client suffers a slip-and-fall on an unplowed sidewalk and La Vaca cannot produce a written contract showing the snow vendor's insurance, La Vaca is directly exposed. This must be executed with the snow vendor before Operations or Full-Service tier clients are signed.

**Priority 3: Residential À La Carte Work Order (Agreement 2)**
Any à la carte service over $500 (Door Tune-Up at $495 is borderline; Punch-List Full Day at $1,495 is clearly over) requires a HIC-compliant written contract before work begins. The existing CUST-contract is not the right vehicle. This is the highest-volume transactional document.

### Tier 2 — Draft Within 30 Days of Launch

**Priority 4: Commercial Property Care MSA + Per-Property Service Order (Agreements 4 and 5)**
These unlock commercial revenue. The MSA is reusable across all commercial clients; the Service Order is a fill-in-the-blank addendum.

**Priority 5: Key Holder Authorization and Access Addendum (Agreement 8)**
Required before the first Full-Service commercial client is signed. Can be drafted concurrent with the MSA as it is a dependent addendum.

**Priority 6: Home Passport Data and Hosting Addendum (Agreement 9)**
Required before the first Home Passport is set up. Given the sensitivity of the data collected (home security infrastructure), operating without a data governance addendum creates immediate breach-notification liability.

### Tier 3 — Draft Within 60 Days

**Priority 7: Pre-Listing / Pre-Tenant Engagement Letter (Agreement 10)**
Important for real estate adjacent services but can be delayed until first such engagement is scheduled.

**Priority 8: Licensed Trade Partner Agreement (Agreement 7)**
Low liability if La Vaca is only referring (not coordinating with markup). Becomes higher priority the moment La Vaca starts invoicing clients for specialty trade work at cost + markup under Operations and Full-Service tiers.

**Priority 9: Photo/Video and Marketing Release (Agreement 13)**
Can be embedded as a consent checkbox in the Membership Agreement and Work Order for the launch; standalone form can follow.

### Tier 4 — Ongoing Review (Not Blocking Launch)

**Priority 10: Privacy Policy and Data Rights review (Agreement 11)**
Blocking only for Home Passport launch; should run concurrent with Agreement 9 drafting.

**Priority 11: Project / Remodel GC Agreement refinement (Agreement 3)**
The existing CUST-contract.md is functional for its intended purpose. Refinements (rate consistency, cross-reference to separate agreements) can be done in a single revision pass after the new agreements are drafted.

**Priority 12: COI Additional Insured Acknowledgment (Agreement 14)**
Not a separate drafted document — it is an operational process already partially in place. The MSA template should hardcode the COI obligation language; the actual COI issuance is a carrier function.

---

## Briefing Note for NJ Counsel

The highest-priority issues for the first attorney session are:

1. **Auto-renewal law compliance** for the membership agreement (N.J.S.A. 56:12-16 et seq.) — specifically the conspicuousness standard, monthly vs. annual notice cadence, and whether a refund obligation attaches if disclosure fails.
2. **ABC test analysis** for the subcontractor workforce model (N.J.S.A. 43:21-19) — whether the snow vendor and any tech 1099s satisfy parts B and C of the test, and the misclassification exposure if they do not.
3. **NJ Data Privacy Act threshold analysis** for Home Passport (P.L. 2023, c. 266) — whether La Vaca currently triggers the law, and what compliance posture is needed if scale crosses the threshold.
4. **Class-action waiver enforceability** in consumer adhesion contracts under NJ case law.
5. **NJ Home Inspectors' Licensing Act exposure** (N.J.S.A. 45:8-61 et seq.) — whether the menu's inspection-adjacent services need additional disclaimer language or a different service framing to avoid being characterized as unlicensed home inspections.

All statutory citations in this document should be verified by counsel before incorporation into executed agreements.
