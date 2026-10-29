# La Vaca Home Services Landing Page Spec

## Overview

A landing page on the La Vaca website offering seven home services at published starting prices. Homeowners request quotes through a form; La Vaca routes the work to vetted subs and keeps the margin. The page is built to be shared on listing sites and Craigslist, with one URL per service for tracking.

## Services and Starting Prices

Market ranges are from NJ 2026 pricing guides. Starting prices sit at or slightly above the low end of market so they attract clicks while leaving room for your premium after sub cost.

| Service | NJ market range | Suggested "starting at" | Pricing unit |
| --- | --- | --- | --- |
| Cabinet repainting | $1,500 to $6,250 per kitchen (avg $3,500) | $1,995 | Per kitchen, up to 20 doors and drawers |
| HVAC cleaning (coils and system tune) | $150 to $400 per coil service | $199 | Per system |
| Air duct and vent cleaning | $300 to $600 for a standard home | $349 | Up to 10 vents |
| Home cleaning | $130 to $280 per one time clean | $159 | Up to 2 bed, 1 bath |
| Exterior painting | $2.00 to $5.50 per sq ft of surface | $2.95 per sq ft | Per sq ft, minimum $3,500 |
| Gutter cleaning | $150 to $250 single story, $250 to $500 two story | $179 | Single story; two story from $249 |
| Drywall patching | $188 to $750 per repair (avg $438) | $249 | First patch up to 6 inches, primed and painted; each additional patch extra |

Every price shows "starting at" with a short line on what is included and what raises the price.

## Homeowner Flow (Minimum Clicks)

A homeowner can submit a request in three screens with no account and no page reloads.

1. Landing page: service cards, each with a two line description of what the service entails and a "starting at" price. Each card has a checkbox, so the homeowner ticks one or more services and clicks one "Request These" button. Clicking a card's price opens a short what's included popup without leaving the page.
2. Details screen: one scrolling form. For each ticked service, its two or three service specific questions appear as checkboxes or taps (for example, number of stories: 1, 2, 3+) rather than typed fields. Photo upload and address autocomplete sit on the same screen.
3. Contact screen: name, phone, email, preferred timing, submit. Confirmation shows on screen and by text.

Bot protection, invisible where possible:

- Honeypot hidden field and submit timing check (a form filled in under five seconds is dropped)
- Invisible CAPTCHA (Cloudflare Turnstile or reCAPTCHA v3) scored on submit; a visible challenge only appears for low scores
- Phone verification by one time text code before the lead is marked valid; unverified leads are held in a separate queue
- Rate limit per IP and per phone number; duplicate address plus service within 24 hours is merged, not duplicated

## Bid Requests from the Website

Sub bid requests go out from the La Vaca website, not SpecNook.

- From any valid lead, Alex clicks "Send bid request", sets the sub pay amount, and the offer goes to every approved sub in that trade at once (see Sub Job Offer System)
- Multi service leads create one bid request per trade
- Once a sub is confirmed, the job is pushed to SpecNook with customer, address, scope, photos, customer price and sub pay, where contract, payments and job tracking take over
- Site visits are dispatched from the lead when photos are not enough to price the job

## Homepage Call to Action and Testing

The La Vaca homepage hero carries two buttons: the main one leads to this home services page, the second to the project gallery for larger remodels.

- Primary button: "Explore My Service Options" (default wording), links to the home services landing page
- Secondary button: "See Our Projects", links to the remodel project gallery
- Home care signup has no hero button; it appears as a section and call to action on the home services landing page instead, since home care customers come from the same audience
- The existing home services landing page on the site is extended with the service cards and request flow from this spec rather than building a new page

Multivariate testing:

- Each button can run up to seven wording variants (A through G) at a time, split evenly by visitor and sticky per visitor
- Variants managed in the website admin area: wording, color and optional subtext
- Tracked per variant: views, clicks, requests submitted, valid leads, won jobs
- Winner declared only after a set minimum of visitors per variant; the admin shows the current leader and sample size
- Starter variants for the primary button: "Explore My Service Options", "Get a Starting Price", "See Services and Prices", "Request a Quote", "Start My Project"

## Build Process: Review Skills and Agent Structure

Review passes required before launch and after any significant change:

- Matt Pocock's "grill me" skill is run against the homeowner flow to challenge every click and screen; goal is the fewest possible clicks and shortest travel time from landing on the site to a submitted request. Each question it raises gets a written answer or a change to the flow.
- SEO agent reviews the home services landing page and each per service page: titles, headings, meta descriptions, local service keywords for Essex, Morris and Bergen Counties, structured data for services and pricing, page speed, internal links from the homepage buttons.
- Security and structure review covers the whole page: form handling, bot protection, lead storage and admin access, file upload handling for photos, rate limits, and the page's HTML structure and accessibility.

Agent development structure:

- Fable is the planner: breaks the spec into tasks, writes acceptance criteria for each, and signs off on completed work against those criteria
- Opus is the developer: implements each task from the plan and reports back what was built, what was tested and what is uncertain
- Other models are assigned supporting roles as needed (test writing, SEO review, security review, copy variants for the CTA tests)
- Hand offs are explicit: every task moves plan to build to review with a written record at each step; nothing is marked done by the agent that did the work
- No single agent has final authority. Any decision or claim (a task is complete, a test passed, a price or fact is correct) must be corroborated by a second agent before it is accepted. Disagreements escalate up the chain: Opus as lead engineer rules on technical disputes, Fable as CEO makes the final call on scope and priority. Only decisions Fable cannot resolve go to Alex.
- Agents cite the spec section or source for any fact they rely on; unsourced claims are treated as unverified

## Website to SpecNook Handoff (Plain English)

Three systems, each with one job.

1. La Vaca website: captures the homeowner request, stores the lead, and lets Alex send a bid request to subs by email and text. That is all it does for subs.
2. Bid request email: goes out from the website to every approved sub in that trade. It shows the job summary, sub pay, town (not full address), start window, and two buttons: Accept or Respond. Both open the sub response form on the website. A sub who is not yet approved sees one button: Sign Up on SpecNook.
3. SpecNook: sub signup, document collection, agreement e-signature, and then every job after that (contract, photos, invoices, payments).

Handoff rules:

- The website checks SpecNook for the sub's status before showing Accept. Only subs marked Approved in SpecNook can accept.
- On acceptance the website pushes the job to SpecNook with customer, full address, scope, photos, customer price and sub pay. From then on the website only shows the job as Assigned.
- Nothing about payments or contracts lives on the website.

## SpecNook Sub Signup Flow

Short, mobile first, in English or Spanish (sub chooses at the first screen).

1. Basics: business name, owner name, phone, email, trades (checkboxes), service area
2. Registration: NJ HIC registration number and expiry, business entity type, EIN or SSN for 1099 (collected securely, never shown in the app after entry)
3. Insurance: upload certificate of liability insurance, enter carrier, policy number and expiry; workers' comp certificate if they have employees, or a signed statement that they have none
4. Payment: how they get paid (ACH details or check), W-9 upload
5. Agreement: the Subcontractor Agreement below is shown in the chosen language, scrolled in full, and e-signed with name, date, IP and timestamp stored
6. Status: account sits as Pending until Alex reviews the documents and marks Approved. Expired insurance or registration flips the sub back to Pending automatically and blocks new offers.

## Subcontractor Agreement (English)

LA VACA GENERAL CONTRACTORS LLC SUBCONTRACTOR AGREEMENT

This Agreement is between La Vaca General Contractors LLC, NJ HIC Registration 13VH13373800, West Orange, New Jersey ("La Vaca") and the subcontractor identified in the signup record ("Subcontractor"). It governs every job order La Vaca assigns to Subcontractor.

1. Independent Contractor. Subcontractor is an independent business, not an employee of La Vaca. Subcontractor holds its own NJ Home Improvement Contractor registration, decides how the work is performed, supplies its own tools, equipment and labor, sets its own hours within the customer's start window, and is free to work for others. La Vaca does not provide training, uniforms or supervision of methods. Subcontractor is responsible for its own taxes and will receive IRS Form 1099 for payments made.
2. Job Orders. Each job is offered by a written job order stating the scope, the customer's address, the start window and the fixed pay amount. Subcontractor may accept, decline or counter. A job order is binding only when Subcontractor accepts in SpecNook and La Vaca confirms. Pay is fixed per job order and does not change unless a written change order is issued by La Vaca.
3. Customer Relationship. The customer is La Vaca's customer. Subcontractor will not bill, quote, collect payment from, or solicit work from any La Vaca customer, and will refer all customer questions about price, scope or schedule to La Vaca. This applies during this Agreement and for twelve months after any job at that address. Violation forfeits any unpaid balance on that job and ends this Agreement.
4. Payment Schedule. For each job order La Vaca pays Subcontractor: twenty percent (20%) on signing the job order, forty percent (40%) on the first day of work on site, and forty percent (40%) on final acceptance under Section 6. Payment is made through SpecNook within five business days of each milestone.
5. Quality and Scope. Subcontractor owns the quality of the work entirely. All work must be performed in a workmanlike manner, match the job order scope, comply with the NJ Uniform Construction Code and manufacturer instructions, and leave the site clean. If the site condition differs from the job order, Subcontractor must stop, photograph the condition and notify La Vaca before proceeding; additional work is paid only under a written change order.
6. Walkthroughs and Final Acceptance. Subcontractor must take photos before, during and after the work and upload them to SpecNook. On completion, Subcontractor attends a final walkthrough with the customer and La Vaca (in person or by video). Any item that does not meet the job order scope is listed on a punch list and corrected by Subcontractor at no cost. The final forty percent is released only after La Vaca confirms in writing that the work meets the job order scope and the customer has confirmed satisfaction, unless otherwise agreed in writing on that job order. La Vaca will not withhold approval unreasonably once the scope is met.
7. Warranty. Subcontractor warrants its workmanship for one year from final acceptance. Subcontractor will correct any workmanship defect reported in that period at no cost within seven days of notice. If Subcontractor fails to do so, La Vaca may correct the defect and deduct the cost from any amount owed or invoice Subcontractor. Subcontractor must report to La Vaca any pre-existing problem it observes on site so La Vaca can inform the customer in writing. Repeat warranty callbacks may result in removal from future job offers.
8. Insurance. Subcontractor must keep in force commercial general liability insurance of at least $1,000,000 per occurrence naming La Vaca General Contractors LLC as additional insured, and workers' compensation insurance as required by New Jersey law if it has any employees or helpers. Current certificates must be on file in SpecNook; no job order will be offered while any certificate is expired. Subcontractor will not bring any worker to a La Vaca job who is not covered by Subcontractor's workers' compensation policy.
9. Indemnification. Subcontractor will defend, indemnify and hold harmless La Vaca, its owners and its customers from all claims, damages, injuries, losses, fines and attorney's fees arising from Subcontractor's work, its workers, its negligence, or its breach of this Agreement, to the fullest extent permitted by New Jersey law. This obligation survives completion of any job and termination of this Agreement.
10. Licenses and Compliance. Subcontractor will maintain its NJ HIC registration and any trade license required for the work, obtain any permit that falls within its scope when the job order says so, and comply with all applicable laws, including worker classification, wage and safety laws for its own workers.
11. Termination. Either party may end this Agreement on written notice. Job orders already accepted are completed under this Agreement unless La Vaca cancels them, in which case Subcontractor is paid for work completed to date.
12. General. This Agreement is governed by New Jersey law, with venue in Essex County. It is the entire agreement between the parties and may be changed only in writing. Electronic signatures are binding. This Agreement is provided in English and Spanish; if the two versions conflict, the English version controls.

Signed electronically by Subcontractor: name, business, date, IP address and timestamp recorded in SpecNook.

## Acuerdo de Subcontratista (Español)

LA VACA GENERAL CONTRACTORS LLC ACUERDO DE SUBCONTRATISTA

Este Acuerdo se celebra entre La Vaca General Contractors LLC, Registro HIC de NJ 13VH13373800, West Orange, Nueva Jersey ("La Vaca") y el subcontratista identificado en el registro de inscripción ("Subcontratista"). Rige cada orden de trabajo que La Vaca asigne al Subcontratista.

1. Contratista Independiente. El Subcontratista es un negocio independiente, no un empleado de La Vaca. El Subcontratista posee su propio registro de Contratista de Mejoras del Hogar (HIC) de NJ, decide cómo se realiza el trabajo, aporta sus propias herramientas, equipo y mano de obra, fija su propio horario dentro de la ventana de inicio del cliente y es libre de trabajar para otros. La Vaca no proporciona capacitación, uniformes ni supervisión de métodos. El Subcontratista es responsable de sus propios impuestos y recibirá el Formulario 1099 del IRS por los pagos realizados.
2. Órdenes de Trabajo. Cada trabajo se ofrece mediante una orden de trabajo escrita que indica el alcance, la dirección del cliente, la ventana de inicio y el monto fijo de pago. El Subcontratista puede aceptar, rechazar o hacer una contraoferta. Una orden de trabajo es vinculante solo cuando el Subcontratista la acepta en SpecNook y La Vaca la confirma. El pago es fijo por orden de trabajo y no cambia salvo que La Vaca emita una orden de cambio por escrito.
3. Relación con el Cliente. El cliente es cliente de La Vaca. El Subcontratista no facturará, cotizará, cobrará ni solicitará trabajo a ningún cliente de La Vaca, y remitirá a La Vaca toda pregunta del cliente sobre precio, alcance o calendario. Esto aplica durante este Acuerdo y por doce meses después de cualquier trabajo en esa dirección. Su incumplimiento implica la pérdida de cualquier saldo pendiente de ese trabajo y la terminación de este Acuerdo.
4. Calendario de Pagos. Por cada orden de trabajo La Vaca paga al Subcontratista: veinte por ciento (20%) al firmar la orden de trabajo, cuarenta por ciento (40%) el primer día de trabajo en el sitio y cuarenta por ciento (40%) en la aceptación final según la Sección 6. El pago se realiza a través de SpecNook dentro de los cinco días hábiles siguientes a cada hito.
5. Calidad y Alcance. El Subcontratista es totalmente responsable de la calidad del trabajo. Todo trabajo debe realizarse de manera profesional, coincidir con el alcance de la orden de trabajo, cumplir con el Código Uniforme de Construcción de NJ y las instrucciones del fabricante, y dejar el sitio limpio. Si la condición del sitio difiere de la orden de trabajo, el Subcontratista debe detenerse, fotografiar la condición y notificar a La Vaca antes de continuar; el trabajo adicional se paga únicamente bajo una orden de cambio escrita.
6. Recorridos y Aceptación Final. El Subcontratista debe tomar fotos antes, durante y después del trabajo y subirlas a SpecNook. Al terminar, el Subcontratista participa en un recorrido final con el cliente y La Vaca (en persona o por video). Cualquier punto que no cumpla con el alcance de la orden de trabajo se anota en una lista de pendientes y el Subcontratista lo corrige sin costo. El cuarenta por ciento final se libera solo después de que La Vaca confirme por escrito que el trabajo cumple con el alcance de la orden de trabajo y el cliente haya confirmado su satisfacción, salvo acuerdo distinto por escrito en esa orden de trabajo. La Vaca no negará la aprobación de manera irrazonable una vez cumplido el alcance.
7. Garantía. El Subcontratista garantiza su mano de obra por un año a partir de la aceptación final. El Subcontratista corregirá sin costo cualquier defecto de mano de obra reportado en ese período dentro de los siete días siguientes al aviso. Si el Subcontratista no lo hace, La Vaca podrá corregir el defecto y descontar el costo de cualquier monto adeudado o facturarlo al Subcontratista. El Subcontratista debe informar a La Vaca de cualquier problema preexistente que observe en el sitio para que La Vaca pueda informar al cliente por escrito. Las llamadas de garantía repetidas pueden resultar en la exclusión de futuras ofertas de trabajo.
8. Seguro. El Subcontratista debe mantener vigente un seguro de responsabilidad civil comercial general de al menos $1,000,000 por evento que nombre a La Vaca General Contractors LLC como asegurado adicional, y un seguro de compensación laboral según lo exige la ley de Nueva Jersey si tiene empleados o ayudantes. Los certificados vigentes deben estar en SpecNook; no se ofrecerá ninguna orden de trabajo mientras algún certificado esté vencido. El Subcontratista no llevará a ningún trabajo de La Vaca a un trabajador que no esté cubierto por su póliza de compensación laboral.
9. Indemnización. El Subcontratista defenderá, indemnizará y mantendrá indemne a La Vaca, sus propietarios y sus clientes frente a todo reclamo, daño, lesión, pérdida, multa y honorarios de abogados que surjan del trabajo del Subcontratista, sus trabajadores, su negligencia o su incumplimiento de este Acuerdo, en la máxima medida permitida por la ley de Nueva Jersey. Esta obligación sobrevive a la finalización de cualquier trabajo y a la terminación de este Acuerdo.
10. Licencias y Cumplimiento. El Subcontratista mantendrá su registro HIC de NJ y cualquier licencia de oficio requerida para el trabajo, obtendrá cualquier permiso dentro de su alcance cuando la orden de trabajo así lo indique, y cumplirá con todas las leyes aplicables, incluidas las leyes de clasificación de trabajadores, salarios y seguridad para sus propios trabajadores.
11. Terminación. Cualquiera de las partes puede terminar este Acuerdo mediante aviso por escrito. Las órdenes de trabajo ya aceptadas se completan bajo este Acuerdo salvo que La Vaca las cancele, en cuyo caso el Subcontratista recibe pago por el trabajo completado hasta la fecha.
12. Disposiciones Generales. Este Acuerdo se rige por la ley de Nueva Jersey, con jurisdicción en el Condado de Essex. Constituye el acuerdo completo entre las partes y solo puede modificarse por escrito. Las firmas electrónicas son vinculantes. Este Acuerdo se proporciona en inglés y español; en caso de conflicto entre ambas versiones, prevalece la versión en inglés.

Firmado electrónicamente por el Subcontratista: nombre, negocio, fecha, dirección IP y marca de tiempo registrados en SpecNook.

## Agreement Notes for Alex

- Have a NJ construction attorney review this before it goes live, especially Sections 1, 8 and 9. The October 2026 ABC test rules look at how you actually operate, so avoid setting sub hours, supplying tools or giving step by step instructions in practice.
- Section 8 requires insurance for every sub. An uninsured sub signing a waiver does not shift liability for injured workers or customer claims away from La Vaca under NJ law, so no uninsured tier is included. If Alex wants one, it should be limited to one person, no helpers, low risk work, and still reviewed by the attorney.
- Spanish translation to be produced from the final attorney approved English text, so both versions match.

## Page Structure

1. Hero: headline, short promise (licensed NJ contractor, fast quotes), primary button "Get My Quote".
2. Service cards: one card per service with photo, starting price, what is included, and a "Get a Quote" button that opens the form preselected to that service.
3. How it works: request a quote, get a firm price, schedule, done.
4. Trust: NJ HIC number 13VH13373800, insured, service area Essex, Morris and Bergen Counties, reviews.
5. FAQ: what changes the price, how fast scheduling is, payment terms.
6. Footer: phone 201 212 4917, email, link back to main La Vaca site.

## Per Service Pages

Each service also gets its own URL (for example lavacagc.com/services/cabinet-painting) with the same layout focused on that service. These are the links used in Craigslist and other listings. Each URL carries a source tag (for example ?src=craigslist) so leads are attributed.

## Quote Form

Fields:

- Service (dropdown, preselected from the card or page)
- Full name, phone, email
- Property address with autocomplete, plus ZIP check against the service area
- Service specific questions (see below)
- Photo upload, up to 10 images, phone camera friendly
- Preferred timing (ASAP, within 2 weeks, within a month, flexible)
- Notes
- Consent checkbox for text and email follow up

Service specific questions:

- Cabinet repainting: number of doors and drawers, current finish, color change yes or no, island included
- HVAC cleaning: number of systems, system age, last service date
- Duct and vent cleaning: home square footage, number of vents, pets in home
- Home cleaning: bedrooms, bathrooms, square footage, one time or recurring
- Exterior painting: stories, siding type, approximate square footage, trim and doors included
- Gutter cleaning: stories, approximate linear feet, downspout count, gutter guards yes or no, last cleaned
  - Drywall patching: number of patches, approximate size of each, wall or ceiling, paint match needed yes or no

On submit:

- Lead saved with service, source tag, address and photos
- Instant email and text alert to Alex
- Auto reply to homeowner confirming receipt and next steps
- Out of area ZIPs get a polite decline message

## Chatbot

A chatbot on the main page and on each service page, configured per service.

- Answers common questions about that service: what is included, what changes the price, timing, prep
- Gives the starting price and explains what moves it up
- Collects the same intake details as the form conversationally and offers photo upload
- Hands off to the quote form or a callback request when the homeowner is ready
- Bilingual English and Spanish
- Never commits to a final price; final pricing comes after review of photos

## Lead Routing and Margin

- Each lead is reviewed by Alex, then sent to a sub for that trade with photos and scope
- Sub returns a price; La Vaca adds its markup and sends the homeowner a firm quote
- Homeowner pays La Vaca; La Vaca pays the sub on completion
- Track per lead: source, service, sub price, quoted price, margin, status

## Lead Storage

All leads are stored in the La Vaca website backend database. No third party form tools.

- Tables: leads, lead\_photos, services, subs, job\_offers, offer\_responses
- Photos stored in website file storage, linked to the lead record
- Admin area on the La Vaca site to view, filter and update leads by service, source, county and status
- Lead status: New, Reviewing, Sent to subs, Sub accepted, Quoted to homeowner, Won, Lost

## Sub Job Offer System

Alex sends each job to subs with the amount La Vaca will pay, straight from the lead record.

1. Alex opens a lead in the admin area and clicks "Create job offer".
2. He sets the sub pay amount, scope summary, town (no full address until accepted), photos to share, and target dates.
3. The offer goes out at once to every approved sub in that trade. No manual picking.
4. Each sub gets a text and email with a unique offer link showing the job, the pay amount, and Accept or Decline buttons.
5. First sub to accept is assigned; the offer closes for everyone else and the full address is released to the assigned sub.
6. Responses are logged on the lead, and the quoted homeowner price is tracked against sub pay to show margin.

Offer messages are bilingual English and Spanish.

### Expiration

Every offer expires 24 hours after it is sent. If nobody accepts, the lead is flagged for Alex to adjust the pay amount and resend.

### Declines and Pricing Feedback

A decline marks the sub for a follow up call so La Vaca can learn why and still try to get them on the job.

- Decline button asks for an optional reason: pay too low, too far, schedule, scope unclear, other
- Each decline creates a call task on the lead with the sub's name, phone and reason
- Alex logs the call outcome: the sub's counter price, the reason in their words, and whether they will take the job at that price
- Counter prices are saved per service and county
- A pricing report shows decline rate, top decline reasons and average counter price per service, used to adjust sub pay and homeowner starting prices

Alex makes all decline follow up calls.

### Sub Response Form

The offer page gives each sub four responses, all saved to the website database on the lead.

1. Accept at the offered price.
2. Counter offer: "I won't do it for this price, but I'll do it for this price." The sub enters their price and an optional note.
3. Request more details: the sub types what they need (measurements, more photos, access, materials) and can attach files.
4. Decline with a reason.

What happens next:

- Counter offers and detail requests alert Alex by text and email and show in a Sub Responses inbox in the admin area
- No counter offer is ever auto approved. Alex reviews every counter and can accept it, reject it, or reply with a new price. When he accepts, the sub gets a final confirmation request and must confirm they will do the work at that price before the job is assigned
- Alex answers detail requests from the admin area; the reply and any files go to the sub on the same offer page and by text
- Answering a detail request pauses the 24 hour clock for that sub until they have the reply
- Every counter price feeds the pricing report

## SpecNook Sub Signup

Every job offer message and offer page includes a link to sign up as a La Vaca sub on SpecNook.

- New subs who are not yet approved can view the offer but must complete SpecNook signup before accepting
- Signup link carries a tag so the website knows which offer brought the sub in
- Once approved in SpecNook, the sub is added to the website sub list with trade, counties served and contact info
- Ties into the SpecNook subcontractor module for onboarding, expectations and payment

## Markup and Contracts

La Vaca marks up sub cost by 43% on all five services, which keeps profit at or above the 30% floor.

- Customer price = sub pay × 1.43 (example: $1,400 sub pay = $2,000 customer price)
- Sub pay can never exceed 70% of the customer price; the admin area blocks offers or counters above that

System split:

- La Vaca website: lead capture, photos, job offers, sub responses, counters
- SpecNook: customer contract, sub agreement, invoicing, payments and job tracking once a sub is confirmed

Billing and payment:

- La Vaca bills the customer directly under its NJ HIC license; the sub never bills the customer
- Customer signs the La Vaca contract and pays La Vaca through SpecNook
- Sub signs a SpecNook subcontract for the fixed pay amount only
- La Vaca pays the sub that amount after the job is complete and completion photos are approved

Payment schedule:

| Party | Milestone | Amount |
| --- | --- | --- |
| Customer | Upfront, at contract signing | 70% of customer price |
| Customer | Job complete and customer satisfied | 30% of customer price |
| Sub | Deposit, when sub agreement is signed | 20% of sub pay |
| Sub | Job start | 40% of sub pay |
| Sub | Job complete and customer fully satisfied | 40% of sub pay |

## Risk Controls

La Vaca is the contractor of record, so every sub must meet these rules before and after a job.

### Sub Insurance and Licensing

- Proof of general liability insurance required in SpecNook before a sub can accept any offer
- Workers' comp certificate required if the sub has employees
- La Vaca listed as additional insured where possible
- Expiration dates tracked; offers are blocked for subs with expired documents

### Quality Control

- Required before, during and completion photos uploaded to SpecNook
- Site visit by Alex or a La Vaca rep on larger jobs such as exterior painting and cabinet repainting
- Final sub payment released only after Alex approves the work and the customer confirms satisfaction

### Scope Mismatch and Change Orders

- Starting prices are based on customer photos and answers, so the site may not match
- Sub must flag any mismatch with photos before starting work
- Alex prices the difference and sends the customer a change order using the La Vaca change order process
- No extra work starts until the customer signs the change order; sub pay adjusts at the same 43% markup

### Warranty and Callbacks

- La Vaca gives the customer a one year workmanship warranty on all services unless the contract calls out otherwise. The warranty covers only the work performed (for example, paint is covered, but defective siding under it is not; cleaning gutters is covered, but gutters that are failing are not). Pre-existing conditions, aging equipment and anything beyond La Vaca's control are excluded. Subs must report any problems they find (for example, an old HVAC unit with failing parts) with photos, and La Vaca reports them to the customer in writing
- Sub agreement requires the sub to return and fix defects in their own work at no cost during the warranty period
- Callbacks logged per sub; repeat callbacks remove the sub from future offers

## Listings and Tracking

- Craigslist services posts per service and county, each linking to the matching service URL with its source tag
- Same approach for other directories and local listing sites
- Simple dashboard or sheet showing leads by source and service, close rate, and margin

## Open Decisions

- Final starting prices per service
- Sub roster sign ups through SpecNook
- Sub roster per trade
- Sub agreement template wording in SpecNook
