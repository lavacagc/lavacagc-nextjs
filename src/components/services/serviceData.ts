export type ServiceIconKey =
  | "shield-check"
  | "droplets"
  | "door-open"
  | "cloud-lightning"
  | "file-text"
  | "paint-bucket"
  | "tag"
  | "list-checks"
  | "hammer"
  | "key-round"
  | "store"
  | "clipboard-check"
  | "camera"
  | "siren"
  | "footprints";

export type ServicePropertyType = "home" | "commercial";

export interface ServiceEntry {
  slug: string;
  title: string;
  badge: string;
  icon: ServiceIconKey;
  blurb: string;
  shortDesc: string;
  inc: string[];
  exc: string[];
}

export const HOME_SERVICES: ServiceEntry[] = [
  {
    slug: "annual-home-safety-audit",
    title: "Annual Home Safety Audit",
    badge: "50-point written report",
    icon: "shield-check",
    shortDesc:
      "A practical property review to catch small issues before they become bigger problems.",
    blurb:
      "A practical property review by a licensed GC — what we see, what to fix first, and what to budget for. Not a regulated NJ home inspection.",
    inc: [
      "50-point written report",
      "Photo log of every flagged item",
      "Prioritized fix list (Critical / Soon / Eventually)",
      "Fire safety: detectors, extinguisher, dryer vent",
      "Water: visible leaks, sump, heater age, supply lines",
      "Electrical: panel, GFCI/AFCI, outlet sample",
      "Envelope: roof age signs, attic visible, insulation depth",
      "Aging-in-place: handrails, grab-bar opportunities, lighting",
      "Estimated cost ranges per flagged item",
      "Verbal walkthrough with homeowner at end of visit",
    ],
    exc: [
      "Any actual repair work (quoted separately)",
      "Roof access, attic crawl, or crawlspace entry",
      "Pest, mold, asbestos, lead, or radon testing",
      "Code compliance certification or stamp",
      "Regulated NJ home inspection",
      "Sewer scope, septic, or well testing",
      "HVAC performance or load testing (visual only)",
      "Structural engineering opinion",
      "Guarantee or warranty against unflagged issues",
    ],
  },
  {
    slug: "sump-pump-pro-test",
    title: "Sump Pump Pro Test",
    badge: "8-point function test + report",
    icon: "droplets",
    shortDesc:
      "Check pump operation, visible discharge concerns, and basic basement risk items.",
    blurb:
      "Most homeowners only find out the sump failed after the basement floods. This catches it first.",
    inc: [
      "Manual activation + discharge test",
      "Battery backup activation under load",
      "Check valve test for backflow prevention",
      "Battery health: voltage + corrosion visual",
      "Float + switch free-movement test",
      "Visual inspection of pump, pit, surroundings",
      "1-page written report with photos",
      "Pump model / serial captured for Home Passport",
      "Recommended next-test date",
    ],
    exc: [
      "Pump, float, valve, or battery replacement",
      "Battery backup install if none exists",
      "Pit cleanout or heavy debris removal",
      "Discharge line repair or extension",
      "Generator integration / smart-monitor install",
      "Interior French drain or exterior grading",
      "Water-powered backup pump install",
    ],
  },
  {
    slug: "door-weatherstripping-tune-up",
    title: "Door Weatherstripping Tune-Up",
    badge: "Energy + comfort tune-up",
    icon: "door-open",
    shortDesc:
      "Small door sealing and comfort improvements that make the home feel tighter.",
    blurb:
      "A northern NJ home can lose hundreds of dollars a year through failing weatherstripping. Easy fix for a pro, invisible to homeowners.",
    inc: [
      "Up to 25 LF of weatherstripping replaced",
      "Up to 2 door sweeps replaced",
      "Every exterior door inspected (jamb, head, threshold)",
      "Hinge tightening + minor latch adjustment",
      "Visual draft check at every door",
      "Window seal visual on accessible ground-floor windows",
      "Air-leak location list (outlets, can lights, attic hatch, etc.)",
      "1-page report with photos + estimated savings range",
    ],
    exc: [
      "Door replacement or rehang",
      "Window replacement, re-glazing, or window weatherstripping",
      "Storm door installation or repair",
      "Blower-door test / formal energy audit",
      "Insulation installation or attic top-up",
      "Exterior caulking beyond doors (separate service)",
      "Specialty weatherstripping for oversized doors",
      "More than 25 LF / 2 sweeps (retail + 25%)",
    ],
  },
  {
    slug: "storm-prep-visit",
    title: "Storm Prep Visit",
    badge: "On-demand · pre-storm",
    icon: "cloud-lightning",
    shortDesc:
      "Exterior and interior readiness items before heavy weather or seasonal changes.",
    blurb:
      "Triggered when a hurricane or nor'easter is forecast. Get ahead of the damage instead of cleaning up after.",
    inc: [
      "Sump pump operational test",
      "Gutter + downspout clear of debris",
      "Exterior secure-up; loose items flagged",
      "Basement + crawlspace moisture visual",
      "Generator manual-start + fuel-level check (if present)",
      "Emergency-supply location noted",
      "Pre-storm photo documentation for insurance",
      "Verbal walkthrough + 1-page report",
    ],
    exc: [
      "Boarding windows or installing storm shutters",
      "Tree pruning or limb removal",
      "Generator service or fueling",
      "Standby service during the storm itself",
      "Post-storm damage repair (after-hours rates)",
      "Roof tarping or sandbagging",
      "Snow / ice prep (use Snow Season Prep)",
    ],
  },
  {
    slug: "home-passport-setup",
    title: "Home Passport Setup",
    badge: "One-shot setup",
    icon: "file-text",
    shortDesc:
      "Document key home systems, notes, photos, and recurring care items in one place.",
    blurb:
      "A complete digital record of your home, accessible by QR code in your utility closet. Free annual updates for members.",
    inc: [
      "2–3 hour on-site capture visit",
      "Critical shutoffs documented with photos + steps",
      "Electrical panel mapped with labeled breakers",
      "Major equipment inventory: model / serial / install date",
      "Filter sizes, bulb types, paint colors, finishes",
      "Vendor contact list + warranty register",
      "Smoke / CO detector inventory + replacement dates",
      "QR sticker placed in utility closet or panel",
      "Private password-protected webpage",
      "5 years of hosting included",
    ],
    exc: [
      "Hosting beyond 5 years off active membership",
      "Floor plans or architectural drawings",
      "Septic locating, well GPS, or buried-utility marking",
      "Detailed appliance manuals (links only)",
      "Multi-property accounts on one Passport",
      "Custom physical labeling beyond QR + breakers",
      "Updates after membership cancellation",
    ],
  },
  {
    slug: "interior-paint-refresh",
    title: "Interior Paint Refresh",
    badge: "Per room",
    icon: "paint-bucket",
    shortDesc:
      "Paint refreshes for rooms, touch-ups, and presentability improvements.",
    blurb:
      "Single room (up to 250 SF wall area, 9 ft or lower ceilings) — premium paint, full prep, quick turnaround.",
    inc: [
      "Single room up to 250 SF wall area",
      "2 coats premium paint (up to 2 gallons)",
      "Surface prep: nail-hole patching + light sanding",
      "Edge taping at trim and ceiling",
      "Single accent wall option if requested",
      "Drop cloths, equipment, basic cleanup",
      "Touch-up paint left for homeowner",
    ],
    exc: [
      "Trim, baseboards, doors, or ceiling painting",
      "Wallpaper removal",
      "Severe color change (primer + 3 coats)",
      "Cabinet or built-in painting",
      "Designer finishes (Venetian, lime wash, color blocking)",
      "Custom paint colors (homeowner supplies, or retail + 25%)",
      "Major drywall repair beyond nail-hole patching",
      "Moving heavy furniture (clear room before arrival)",
      "Exterior painting",
    ],
  },
  {
    slug: "pre-listing-home-prep",
    title: "Pre-Listing Home Prep",
    badge: "Essential / Standard / Premium",
    icon: "tag",
    shortDesc:
      "Punch list and presentation help before photos, showings, or inspection.",
    blurb:
      "Get your home photo-ready and inspection-ready in 5 business days. Three tiers based on condition + scope.",
    inc: [
      "Full Spring Visit scope",
      "50-point Annual Home Safety Audit",
      "Smoke / CO compliance prep included",
      "Caulk re-touch in wet areas (kitchen + 2 baths)",
      "Touch-up paint on minor wall scuffs",
      "Hardware tightening throughout the home",
      "Punch list of items for buyer disclosure",
      "Home Passport setup included free",
      "Standard adds: full interior touch-up, gutter clean, weatherstrip",
      "Premium adds: single-room repaint, pressure wash, screen repair",
    ],
    exc: [
      "Major repairs (roofing, structural, HVAC, plumbing, electrical)",
      "Flooring work (carpet cleaning, refinishing, replacement)",
      "Landscaping, lawn care, tree work",
      "Staging (furniture rental, decor)",
      "Deep cleaning (carpets, kitchen, oven, fridge)",
      "Window cleaning (interior or exterior glass)",
      "Garage organization or decluttering",
      "Any work requiring permits",
      "Items surfacing in inspection that weren't flagged in audit",
    ],
  },
  {
    slug: "punch-list-half-day",
    title: "Punch-List Half Day",
    badge: "2-tech crew · Half / Full day",
    icon: "list-checks",
    shortDesc: "Bundled small tasks handled in one organized visit.",
    blurb:
      "Whatever fits in the time window from your prepared list, executed in priority order. Half-day = 4 hrs, Full day = 8 hrs.",
    inc: [
      "Owner's prioritized list, top-down",
      "Caulking, small drywall patches, hanging items",
      "TVs up to 65\", art up to 50 lbs",
      "Hardware swaps, door adjustments, weatherstripping",
      "Paint touch-up, faucet aerator / cartridge swaps",
      "Light fixture swaps (like-for-like)",
      "Toilet seat replacement, blind installation",
      "Standard tools and consumables included",
      "One round-trip to local hardware store",
      "Written list of completed and remaining items",
    ],
    exc: [
      "Any work requiring a permit",
      "Gas lines, new circuits, new plumbing branches",
      "Major appliance installs (gas dryer, dishwasher first-hookup)",
      "TVs over 65\" or non-drywall walls (concrete, brick)",
      "Tile, grout, or specialty surface work",
      "Removal / disposal of large items",
      "Specialty hardware (ceiling fans, heavy chandeliers)",
      "Materials beyond standard kit (retail + 25%)",
      "Last-minute \"while you're here\" additions",
    ],
  },
  {
    slug: "drywall-repair",
    title: "Drywall Repair",
    badge: "Small / Large patch",
    icon: "hammer",
    shortDesc: "Patch, prep, and finish drywall issues that fit a service visit.",
    blurb:
      "Small = up to 3 holes (nail, doorknob, accidental). Large = up to 10 holes or one room-scale repair.",
    inc: [
      "Up to 3 holes (Small) or 10 / room-scale (Large)",
      "Patch, mud, sand, prime cycle",
      "Texture match: smooth, orange peel, knockdown",
      "Paint touch-up (homeowner-supplied or La Vaca white)",
      "Photo before / after on every repair",
    ],
    exc: [
      "Full wall or ceiling replacement",
      "Specialty textures (popcorn, heavy artex, custom skim)",
      "Mold remediation behind damaged drywall (referred)",
      "Structural repair or framing replacement",
      "Custom paint match without supplied sample",
      "Wallpaper installation or removal",
      "Repairs adjacent to unverified plumbing / electrical",
    ],
  },
];

export const COMMERCIAL_SERVICES: ServiceEntry[] = [
  {
    slug: "tenant-make-ready",
    title: "Tenant Make-Ready",
    badge: "Starter / Standard / Premium",
    icon: "key-round",
    shortDesc:
      "Turnover work to get a space ready for the next tenant. Scope and inclusions scale by tier.",
    blurb:
      "Turnover work to get a space ready for the next tenant. Scope and inclusions scale by tier.",
    inc: [
      "Wall paint refresh + drywall patches",
      "Door tune-up + hardware tighten / swap",
      "Locks rekeyed (locksmith coordinated)",
      "Caulk re-touch in restrooms",
      "Light fixture cleaning + bulb swap",
      "Cabinet door / drawer alignment",
      "Window blind cleaning (existing)",
      "Broom-clean of all spaces",
      "Final walkthrough with property manager",
      "Single invoice across all work",
    ],
    exc: [
      "HVAC, plumbing, electrical beyond minor",
      "Flooring replacement (carpet, tile, LVP)",
      "Permit work or capital improvements",
      "Deep cleaning (carpets, kitchens, post-construction)",
      "Landscaping or exterior work",
      "ADA compliance certification",
      "Specialty trade work referred to subs",
      "Major appliance installation",
    ],
  },
  {
    slug: "storefront-refresh",
    title: "Storefront Refresh",
    badge: "Starter / Standard / Premium",
    icon: "store",
    shortDesc:
      "Front-of-house refreshes, finish repairs, and customer-facing improvements.",
    blurb:
      "Front-of-house refreshes, finish repairs, and customer-facing improvements before reopening or rebranding.",
    inc: [
      "Front-elevation paint refresh",
      "Trim, door, and frame finish repair",
      "Entry door hardware tighten / swap",
      "Pressure wash of entry walkway (Premium)",
      "Address number + signage cleaning",
      "Glass and threshold detail clean",
      "Caulk + seal at exterior penetrations",
      "Final walk + photo log",
    ],
    exc: [
      "Sign electrical work or awning replacement",
      "Permitted facade or signage work",
      "Window replacement or re-glazing",
      "Specialty trade work",
      "Structural repairs",
      "Capital improvements or buildouts",
      "Roof or above-28-ft work",
      "Lighting circuit additions",
    ],
  },
  {
    slug: "commercial-cco-pre-inspection",
    title: "Commercial CCO Pre-Inspection",
    badge: "Before Town Inspection",
    icon: "clipboard-check",
    shortDesc: "Walkthrough and prep items before municipal inspection.",
    blurb:
      "Required at every commercial tenant turnover or use change in most northern NJ municipalities. We get you ready to pass on the first try.",
    inc: [
      "Walkthrough using your town's specific CCO checklist",
      "Written punch list with photo evidence",
      "Cost estimate: must-fix vs. recommended",
      "One re-walk after repairs are complete",
      "Coordination with the municipal inspector",
      "Pre-inspection report delivered in 3 business days",
    ],
    exc: [
      "Municipal CCO inspection fee (paid by owner to town)",
      "Re-inspection fees if you fail the town inspection",
      "The actual repair work (T&M, separately billed)",
      "HVAC, plumbing, electrical beyond minor",
      "ADA compliance certification",
      "Lead paint or asbestos assessment",
      "Engineering opinion on structural matters",
      "Direct representation at the inspection itself",
      "Additional re-walks beyond the first (quoted separately)",
    ],
  },
  {
    slug: "pre-post-tenant-documentation",
    title: "Pre / Post Tenant Documentation",
    badge: "Move-In / Move-Out",
    icon: "camera",
    shortDesc:
      "Photo documentation and condition notes for tenant transitions.",
    blurb:
      "Defensible photo + narrative documentation at every tenant transition — formatted for NJ security-deposit law.",
    inc: [
      "Full photo log with EXIF timestamps",
      "Detailed coverage of every wall, floor, ceiling, fixture, hardware item",
      "Written condition narrative per room / area",
      "Pre-existing damage, wear, and modifications flagged",
      "Equipment inventory where requested (model / serial)",
      "Move-out comparison against the pre-lease baseline",
      "Distinction between normal wear vs. tenant damage",
      "PDF delivered within 48 hours",
      "Both-party digital sign-off available",
    ],
    exc: [
      "Court testimony or expert witness service",
      "Legal opinions on what's deductible from a deposit",
      "Forensic damage or water-source analysis",
      "Mold or environmental testing",
      "Any actual repair work",
      "Mediation between landlord and tenant",
      "Hard-copy printed reports beyond digital PDF",
      "Document preparation for court filings",
      "Re-photographing after repairs (separately billed)",
    ],
  },
  {
    slug: "storm-emergency-dispatch",
    title: "Storm / Emergency Dispatch",
    badge: "Commercial Response",
    icon: "siren",
    shortDesc:
      "Urgent coordination and documented response for property issues.",
    blurb:
      "Priority dispatch when weather hits — first-hour stabilization, documentation, and trade coordination.",
    inc: [
      "Priority dispatch within the service area",
      "First-hour stabilization on site",
      "Documented response with timestamped photos",
      "Sump + drainage operational check",
      "Insurance-ready incident report",
      "Coordination with specialty trades as needed",
      "Verbal update to property manager during response",
      "Email summary within 24 hours",
    ],
    exc: [
      "Restoration beyond first-hour stabilization",
      "Tree removal or limb work",
      "Specialty trade work (HVAC, plumbing, electrical)",
      "Roof tarping above 28 ft",
      "Sandbagging or major flood mitigation",
      "Permitted repairs",
      "Fueling generators",
      "Standing in with adjusters beyond initial report",
    ],
  },
  {
    slug: "property-walkthrough",
    title: "Property Walkthrough",
    badge: "Single Visit",
    icon: "footprints",
    shortDesc:
      "A structured walkthrough to identify issues, priorities, and next steps.",
    blurb:
      "Sized by property — under 5,000 SF / 5,000–15,000 SF / 15,000–25,000 SF. Lender-, insurer-, and PM-ready written report.",
    inc: [
      "Full exterior visual: roof from ground, siding, lot, sidewalks, lighting, signage, drainage",
      "Full interior visual: walls, ceilings, floors, doors, restrooms, common areas",
      "Mechanical room visual from open doorway",
      "25–60 photo timestamped log",
      "Written report (1–3 pages, lender-ready)",
      "Quotes for any La Vaca-scope repairs flagged",
      "Vendor recommendations for items outside scope",
      "Trend notes across visits when applicable",
      "Email delivery within 5 business days",
    ],
    exc: [
      "Any actual repair work",
      "Roof access or any work above 28 ft",
      "Crawlspace entry beyond visual from access point",
      "Pest, mold, asbestos, lead, radon testing",
      "Specialty trade testing (HVAC, plumbing, electrical, fire, elevator)",
      "Code compliance certification or stamp",
      "Engineering opinion on structural matters",
      "Direct interaction with tenants",
      "Aerial or drone photography",
    ],
  },
];

export const HOME_INTEREST_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "safety-audit", label: "Home safety audit" },
  { value: "punch-list", label: "Punch-list repairs" },
  { value: "sump", label: "Sump / basement check" },
  { value: "drywall-paint", label: "Drywall or paint repair" },
  { value: "pre-listing", label: "Pre-listing home prep" },
  { value: "storm-prep", label: "Storm prep visit" },
];

export const COMMERCIAL_INTEREST_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "make-ready", label: "Tenant make-ready" },
  { value: "storefront", label: "Storefront refresh" },
  { value: "cco-prep", label: "CCO pre-inspection" },
  { value: "documentation", label: "Tenant documentation" },
  { value: "dispatch", label: "Storm / emergency dispatch" },
  { value: "walkthrough", label: "Property walkthrough" },
];
