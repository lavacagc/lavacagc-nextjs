// FAQ Data for the main FAQ page
// Organized by category with SEO-optimized questions from research

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface FAQCategory {
  id: string;
  title: string;
  description: string;
  iconName: string;
  faqs: FAQItem[];
}

// Category 1: Costs & Budgeting
const costsBudgetingFAQs: FAQItem[] = [
  {
    id: "cost-1",
    question: "How much does a home renovation cost in New Jersey?",
    answer: `<p>Home renovation costs in New Jersey vary significantly based on scope and quality:</p>
      <ul>
        <li><strong>Minor updates:</strong> $15,000 - $50,000</li>
        <li><strong>Mid-range remodels:</strong> $50,000 - $150,000</li>
        <li><strong>Luxury renovations:</strong> $150,000 - $500,000+</li>
      </ul>
      <p>Factors include home size, material choices, labor complexity, and permit requirements. We recommend budgeting 10-20% extra for unexpected issues. <a href="/free-estimate">Request a free estimate</a> for a personalized quote.</p>`
  },
  {
    id: "cost-2",
    question: "What is the cost range for a luxury kitchen remodel?",
    answer: `<p>Luxury kitchen remodels in Northern New Jersey typically cost:</p>
      <ul>
        <li><strong>Essential luxury:</strong> $55,000 - $85,000</li>
        <li><strong>Premium luxury:</strong> $85,000 - $150,000</li>
        <li><strong>Ultra-luxury:</strong> $150,000 - $250,000+</li>
      </ul>
      <p>These ranges include custom cabinetry, premium stone countertops, professional-grade appliances, and designer finishes. According to Houzz's 2024 survey, the median spend for a major kitchen remodel is $55,000, with luxury projects significantly higher. <a href="/services/kitchen-remodeling">Learn more about our kitchen services</a>.</p>`
  },
  {
    id: "cost-3",
    question: "How much should I budget for a high-end bathroom renovation?",
    answer: `<p>High-end bathroom renovations in New Jersey typically range from:</p>
      <ul>
        <li><strong>Powder room/half bath:</strong> $15,000 - $25,000</li>
        <li><strong>Full bathroom:</strong> $25,000 - $50,000</li>
        <li><strong>Master suite spa bathroom:</strong> $50,000 - $110,000+</li>
      </ul>
      <p>Luxury features like heated floors, steam showers, freestanding tubs, and designer fixtures increase costs. Quality bathroom renovations typically recoup about 60-70% of their cost at resale. <a href="/services/bathroom-remodeling">Explore our bathroom renovation services</a>.</p>`
  },
  {
    id: "cost-4",
    question: "What percentage of my budget should I set aside for contingencies?",
    answer: `<p>We strongly recommend setting aside <strong>10-20% of your total budget</strong> for contingencies. This buffer accounts for:</p>
      <ul>
        <li>Hidden issues discovered during demolition (water damage, outdated wiring, structural problems)</li>
        <li>Material price fluctuations</li>
        <li>Design changes mid-project</li>
        <li>Permit-related modifications</li>
      </ul>
      <p>Older homes in New Jersey often reveal surprises behind walls. Having a contingency fund prevents project delays and financial stress. Our detailed estimates aim to minimize surprises, but preparation is always wise.</p>`
  },
  {
    id: "cost-5",
    question: "What factors affect the cost of a renovation project?",
    answer: `<p>Several key factors influence your renovation costs:</p>
      <ul>
        <li><strong>Scope of work:</strong> Cosmetic updates vs. structural changes</li>
        <li><strong>Material quality:</strong> Builder-grade vs. luxury finishes</li>
        <li><strong>Labor complexity:</strong> Simple installations vs. custom work</li>
        <li><strong>Home age:</strong> Older homes often need code updates</li>
        <li><strong>Permit requirements:</strong> Electrical, plumbing, and structural permits</li>
        <li><strong>Project timeline:</strong> Rush jobs cost more</li>
        <li><strong>Location:</strong> Northern NJ labor rates are higher than state average</li>
      </ul>
      <p>We provide detailed, transparent estimates so you understand exactly where your money goes. <a href="/contact">Schedule a consultation</a> to discuss your project.</p>`
  },
  {
    id: "cost-6",
    question: "What are common hidden costs in home remodeling?",
    answer: `<p>Watch out for these commonly overlooked costs:</p>
      <ul>
        <li><strong>Permit fees:</strong> $500 - $2,000+ depending on scope</li>
        <li><strong>Structural discoveries:</strong> Rot, mold, outdated wiring behind walls</li>
        <li><strong>Code upgrades:</strong> Bringing old systems to current standards</li>
        <li><strong>Temporary living expenses:</strong> If staying elsewhere during major work</li>
        <li><strong>Storage costs:</strong> For furniture during renovations</li>
        <li><strong>Landscaping repairs:</strong> After heavy equipment use</li>
        <li><strong>Design changes:</strong> Mid-project upgrades or modifications</li>
      </ul>
      <p>Our thorough pre-project inspections help identify potential issues upfront, reducing surprises during construction.</p>`
  },
  {
    id: "cost-7",
    question: "How do I compare contractor quotes effectively?",
    answer: `<p>When comparing quotes, look beyond the bottom line:</p>
      <ul>
        <li><strong>Scope alignment:</strong> Ensure all quotes cover the same work</li>
        <li><strong>Material specifications:</strong> Compare brand, grade, and quality</li>
        <li><strong>Timeline:</strong> Faster isn't always better; quality takes time</li>
        <li><strong>Payment terms:</strong> Never pay 100% upfront</li>
        <li><strong>Warranty coverage:</strong> What's covered and for how long?</li>
        <li><strong>Insurance & licensing:</strong> Verify all contractors are properly covered</li>
      </ul>
      <p>The lowest quote often means cut corners or change orders later. Look for detailed, itemized estimates that show exactly what's included. <a href="/process">Learn about our transparent process</a>.</p>`
  },
  {
    id: "cost-8",
    question: "What payment structures are typical for renovation projects?",
    answer: `<p>Standard payment structures protect both homeowners and contractors:</p>
      <ul>
        <li><strong>Deposit:</strong> 10-30% at contract signing</li>
        <li><strong>Progress payments:</strong> Tied to specific milestones (demolition complete, rough-in done, etc.)</li>
        <li><strong>Final payment:</strong> 10-15% upon project completion and walkthrough</li>
      </ul>
      <p><strong>Red flags:</strong> Never pay more than 30% upfront or the full amount before completion. Milestone-based payments ensure work is completed before funds are released. Our contracts include clear payment schedules tied to project phases.</p>`
  },
  {
    id: "cost-9",
    question: "What financing options are available for home renovations?",
    answer: `<p>New Jersey homeowners have several financing options:</p>
      <ul>
        <li><strong>Home Equity Loans:</strong> Fixed-rate loans using your home equity</li>
        <li><strong>HELOCs:</strong> Flexible credit lines with variable rates</li>
        <li><strong>Cash-out Refinancing:</strong> Replace your mortgage with a larger one</li>
        <li><strong>Personal Loans:</strong> Unsecured loans for mid-sized projects</li>
        <li><strong>FHA 203(k) Loans:</strong> Government-backed renovation loans</li>
        <li><strong>Contractor Financing:</strong> Some contractors offer payment plans</li>
      </ul>
      <p>We recommend consulting with a financial advisor to determine the best option for your situation. Many of our clients use home equity products for larger renovations.</p>`
  },
  {
    id: "cost-10",
    question: "Which renovations provide the best return on investment?",
    answer: `<p>According to industry research, these renovations offer the best ROI in New Jersey:</p>
      <ul>
        <li><strong>Minor kitchen remodel:</strong> 70-80% ROI</li>
        <li><strong>Bathroom addition:</strong> 60-70% ROI</li>
        <li><strong>Garage door replacement:</strong> 90-100% ROI</li>
        <li><strong>Entry door replacement:</strong> 70-90% ROI</li>
        <li><strong>Deck addition:</strong> 65-75% ROI</li>
        <li><strong>Basement finishing:</strong> 60-70% ROI</li>
      </ul>
      <p>Beyond ROI, consider quality of life improvements. A renovated kitchen you use daily provides value regardless of resale numbers. <a href="/services">Explore all our services</a>.</p>`
  }
];

// Category 2: Kitchen Remodeling
const kitchenRemodelingFAQs: FAQItem[] = [
  {
    id: "kitchen-1",
    question: "How long does a kitchen remodel typically take?",
    answer: `<p>Kitchen remodel timelines vary by scope:</p>
      <ul>
        <li><strong>Minor refresh:</strong> 2-4 weeks (cabinet refacing, new counters, paint)</li>
        <li><strong>Mid-range remodel:</strong> 6-8 weeks (new cabinets, counters, appliances)</li>
        <li><strong>Major renovation:</strong> 10-16 weeks (layout changes, structural work)</li>
      </ul>
      <p>Factors affecting timeline include permit approval, custom cabinet lead times (6-10 weeks), and material availability. We provide detailed schedules during planning and communicate any changes immediately. <a href="/process">See our 6-step process</a>.</p>`
  },
  {
    id: "kitchen-2",
    question: "What is the best layout for a small kitchen?",
    answer: `<p>For smaller kitchens, these layouts maximize functionality:</p>
      <ul>
        <li><strong>Galley layout:</strong> Two parallel walls, efficient for single cooks</li>
        <li><strong>L-shaped:</strong> Opens up floor space, allows for dining area</li>
        <li><strong>One-wall with island:</strong> Creates workspace without closing in the room</li>
      </ul>
      <p>Key small kitchen strategies include vertical storage, multi-functional islands, light colors to open the space, and the "kitchen triangle" principle (efficient distance between stove, sink, and refrigerator). We specialize in maximizing every square foot.</p>`
  },
  {
    id: "kitchen-3",
    question: "Should I choose quartz or granite countertops?",
    answer: `<p>Both are excellent choices with different advantages:</p>
      <p><strong>Quartz (Engineered Stone):</strong></p>
      <ul>
        <li>Non-porous, no sealing required</li>
        <li>Consistent patterns and colors</li>
        <li>More stain-resistant</li>
        <li>Slightly higher cost ($60-150/sq ft installed)</li>
      </ul>
      <p><strong>Granite (Natural Stone):</strong></p>
      <ul>
        <li>Each slab is unique</li>
        <li>Heat resistant for hot pans</li>
        <li>Requires annual sealing</li>
        <li>Cost range $40-100/sq ft installed</li>
      </ul>
      <p>For busy households, we often recommend quartz for its low maintenance. For those who love natural variation, granite is timeless.</p>`
  },
  {
    id: "kitchen-4",
    question: "Are custom cabinets worth the investment?",
    answer: `<p>Custom cabinets offer significant advantages for luxury kitchens:</p>
      <ul>
        <li><strong>Perfect fit:</strong> Designed for your exact space dimensions</li>
        <li><strong>Quality construction:</strong> Solid wood, dovetail joints, soft-close hardware</li>
        <li><strong>Design flexibility:</strong> Any style, finish, or configuration</li>
        <li><strong>Specialized storage:</strong> Pull-outs, lazy susans, appliance garages</li>
        <li><strong>Longevity:</strong> 30+ year lifespan vs. 10-15 for stock cabinets</li>
      </ul>
      <p><strong>Cost comparison:</strong> Stock ($150-300/linear ft), Semi-custom ($300-600/linear ft), Custom ($600-1,500/linear ft). For high-end homes in Alpine, Short Hills, or Essex Fells, custom cabinets are standard expectations.</p>`
  },
  {
    id: "kitchen-5",
    question: "What are the most durable kitchen countertop materials?",
    answer: `<p>Ranked by durability for kitchen use:</p>
      <ul>
        <li><strong>Quartzite:</strong> Natural stone, extremely hard, heat-resistant ($$$$)</li>
        <li><strong>Quartz:</strong> Engineered stone, stain-resistant, consistent ($$$)</li>
        <li><strong>Granite:</strong> Natural stone, heat-resistant, requires sealing ($$$)</li>
        <li><strong>Porcelain slabs:</strong> UV-resistant, scratch-resistant ($$-$$$)</li>
        <li><strong>Butcher block:</strong> Warm, repairable, needs regular oiling ($$)</li>
      </ul>
      <p>For durability in a busy kitchen, we typically recommend quartz or quartzite. For a statement piece with character, exotic granite or marble (with proper care) creates stunning results.</p>`
  },
  {
    id: "kitchen-6",
    question: "How can I make my kitchen more energy efficient?",
    answer: `<p>Energy-efficient upgrades that pay for themselves:</p>
      <ul>
        <li><strong>ENERGY STAR appliances:</strong> Save 10-50% on energy costs</li>
        <li><strong>LED lighting:</strong> Use 75% less energy than incandescent</li>
        <li><strong>Induction cooktop:</strong> More efficient than gas or electric coils</li>
        <li><strong>Proper insulation:</strong> Especially in exterior walls</li>
        <li><strong>Smart thermostats:</strong> Optimize heating/cooling schedules</li>
        <li><strong>Low-flow faucets:</strong> Reduce water usage by 30%</li>
        <li><strong>Window upgrades:</strong> Double-pane or better near kitchen</li>
      </ul>
      <p>Many energy improvements qualify for NJ Clean Energy rebates. We can help incorporate these features into your design.</p>`
  },
  {
    id: "kitchen-7",
    question: "What are the current kitchen design trends for 2024-2025?",
    answer: `<p>According to Houzz's 2024 Kitchen Trends Study:</p>
      <ul>
        <li><strong>Open concepts:</strong> 43% are opening kitchens to other spaces</li>
        <li><strong>Larger islands:</strong> 42% choosing islands 7+ feet long (up 10% since 2020)</li>
        <li><strong>Statement ranges:</strong> Commercial-style ranges are the new focal point</li>
        <li><strong>Two-tone cabinets:</strong> Contrasting island and perimeter colors</li>
        <li><strong>Warm neutrals:</strong> Moving from gray to warmer whites and creams</li>
        <li><strong>Hidden appliances:</strong> Panel-ready refrigerators, hidden charging stations</li>
        <li><strong>Smart features:</strong> Touchless faucets, smart lighting, voice control</li>
      </ul>
      <p>We balance trending features with timeless design principles for kitchens that remain beautiful for decades.</p>`
  },
  {
    id: "kitchen-8",
    question: "Can I live in my home during a kitchen remodel?",
    answer: `<p>Yes, but it requires planning:</p>
      <ul>
        <li><strong>Temporary kitchen setup:</strong> Microwave, coffee maker, mini-fridge in another room</li>
        <li><strong>Meal planning:</strong> Stock up on easy-prep foods, plan for takeout</li>
        <li><strong>Dust barriers:</strong> We install plastic barriers to contain dust</li>
        <li><strong>Work schedule:</strong> Define work hours to maintain some normalcy</li>
        <li><strong>Pet and child safety:</strong> Keep them away from work areas</li>
      </ul>
      <p>Most clients successfully live through renovations. For extensive projects (3+ months), some opt for temporary housing during the messiest phases. We discuss all options during our initial consultation.</p>`
  },
  {
    id: "kitchen-9",
    question: "What appliances should I upgrade during a kitchen renovation?",
    answer: `<p>Prioritize these appliances during a remodel:</p>
      <ul>
        <li><strong>Range/Cooktop:</strong> The heart of the kitchen; consider induction for efficiency</li>
        <li><strong>Refrigerator:</strong> Counter-depth or panel-ready for seamless look</li>
        <li><strong>Dishwasher:</strong> Quiet operation (under 44dB) essential for open plans</li>
        <li><strong>Ventilation:</strong> Proper CFM rating for your cooktop</li>
        <li><strong>Built-in microwave:</strong> Drawer or over-range saves counter space</li>
      </ul>
      <p>For luxury kitchens, consider secondary appliances: warming drawers, wine storage, built-in coffee systems, pot fillers, and ice makers. We coordinate appliance specifications with cabinetry design for perfect integration.</p>`
  }
];

// Category 3: Bathroom Renovation
const bathroomRenovationFAQs: FAQItem[] = [
  {
    id: "bathroom-1",
    question: "How much does a bathroom renovation cost in Northern NJ?",
    answer: `<p>Bathroom renovation costs in Northern New Jersey:</p>
      <ul>
        <li><strong>Powder room refresh:</strong> $8,000 - $15,000</li>
        <li><strong>Full bathroom update:</strong> $20,000 - $40,000</li>
        <li><strong>Master bathroom remodel:</strong> $40,000 - $75,000</li>
        <li><strong>Luxury spa bathroom:</strong> $75,000 - $150,000+</li>
      </ul>
      <p>Northern NJ costs run higher than national averages due to labor rates and material transport. Quality waterproofing and proper ventilation should never be compromised to save costs. <a href="/services/bathroom-remodeling">See our bathroom services</a>.</p>`
  },
  {
    id: "bathroom-2",
    question: "Should I choose a walk-in shower or a bathtub?",
    answer: `<p>Consider these factors:</p>
      <p><strong>Walk-in Shower Advantages:</strong></p>
      <ul>
        <li>Easier access, especially for aging in place</li>
        <li>Feels more spacious in smaller bathrooms</li>
        <li>Easier to clean and maintain</li>
        <li>Modern, spa-like aesthetic</li>
      </ul>
      <p><strong>Bathtub Advantages:</strong></p>
      <ul>
        <li>Essential for bathing young children</li>
        <li>Relaxation and therapeutic soaking</li>
        <li>Some buyers expect at least one tub in a home</li>
        <li>Freestanding tubs create a design focal point</li>
      </ul>
      <p><strong>Our recommendation:</strong> Keep at least one tub in the home for resale value. In master baths, walk-in showers are increasingly preferred with a freestanding tub as a luxury addition.</p>`
  },
  {
    id: "bathroom-3",
    question: "Why is waterproofing so important in bathroom renovations?",
    answer: `<p>Waterproofing is the most critical aspect of any bathroom renovation:</p>
      <ul>
        <li><strong>Prevents mold and mildew:</strong> Moisture behind walls creates health hazards</li>
        <li><strong>Protects structural integrity:</strong> Water damage rots framing and subfloors</li>
        <li><strong>Avoids costly repairs:</strong> Water damage can cost $10,000+ to remediate</li>
        <li><strong>Extends tile lifespan:</strong> Proper waterproofing prevents grout failure</li>
      </ul>
      <p>We use premium waterproofing systems like Schluter-KERDI or RedGard in all wet areas. Many renovation failures stem from inadequate waterproofing. We never cut corners on this critical step.</p>`
  },
  {
    id: "bathroom-4",
    question: "What is the best bathroom layout for maximum functionality?",
    answer: `<p>Optimal bathroom layouts follow these principles:</p>
      <ul>
        <li><strong>Minimum clearances:</strong> 21" in front of toilet, 30" between fixtures</li>
        <li><strong>Door swing:</strong> Should not hit fixtures when opening</li>
        <li><strong>Natural light:</strong> Position vanity near windows if possible</li>
        <li><strong>Wet zone separation:</strong> Keep toilet and vanity away from shower splash</li>
        <li><strong>Storage accessibility:</strong> Linens near point of use</li>
      </ul>
      <p>For master bathrooms, popular layouts include: separate vanity areas, private toilet compartments, and distinct wet/dry zones. We create 3D renderings so you can visualize the layout before construction.</p>`
  },
  {
    id: "bathroom-5",
    question: "How important is proper bathroom ventilation?",
    answer: `<p>Proper ventilation is essential for bathroom health and longevity:</p>
      <ul>
        <li><strong>Moisture removal:</strong> Prevents mold, mildew, and paint peeling</li>
        <li><strong>Odor control:</strong> Keeps bathroom fresh</li>
        <li><strong>Mirror clarity:</strong> Reduces fog and condensation</li>
        <li><strong>Code compliance:</strong> NJ requires exhaust fans in windowless bathrooms</li>
      </ul>
      <p><strong>Specifications:</strong> Fans should be rated at minimum 1 CFM per square foot. For luxury bathrooms with steam showers, higher CFM ratings are required. We recommend quiet models (under 1.0 sone) that you'll actually use.</p>`
  },
  {
    id: "bathroom-6",
    question: "How can I make my bathroom more accessible for aging in place?",
    answer: `<p>Universal design features for accessibility and safety:</p>
      <ul>
        <li><strong>Curbless shower:</strong> Zero-threshold entry for wheelchair access</li>
        <li><strong>Grab bars:</strong> Installed in shower and near toilet (rated for 250+ lbs)</li>
        <li><strong>Comfort-height toilet:</strong> 17-19" seat height vs. standard 15"</li>
        <li><strong>Non-slip flooring:</strong> Textured tile or matte finishes</li>
        <li><strong>Handheld showerhead:</strong> With adjustable slide bar</li>
        <li><strong>Lever faucets:</strong> Easier to operate than knobs</li>
        <li><strong>Adequate lighting:</strong> Especially in shower area</li>
      </ul>
      <p>These features can be incorporated beautifully without looking "institutional." Many younger homeowners add them for safety and future-proofing.</p>`
  },
  {
    id: "bathroom-7",
    question: "What tile options are best for bathroom floors and walls?",
    answer: `<p>Best tile options by application:</p>
      <p><strong>Floor tiles:</strong></p>
      <ul>
        <li><strong>Porcelain:</strong> Durable, water-resistant, wide variety ($3-15/sq ft)</li>
        <li><strong>Natural stone:</strong> Elegant but requires sealing ($10-30/sq ft)</li>
        <li><strong>Large-format tiles:</strong> Fewer grout lines, modern look</li>
      </ul>
      <p><strong>Wall tiles:</strong></p>
      <ul>
        <li><strong>Ceramic:</strong> Cost-effective, endless designs ($2-10/sq ft)</li>
        <li><strong>Glass mosaic:</strong> Reflective, luxury feel ($15-50/sq ft)</li>
        <li><strong>Marble:</strong> Timeless elegance, requires maintenance ($15-40/sq ft)</li>
      </ul>
      <p><strong>For shower floors:</strong> Use smaller tiles (2x2 or mosaic) with more grout lines for slip resistance.</p>`
  },
  {
    id: "bathroom-8",
    question: "How long does a bathroom remodel take from start to finish?",
    answer: `<p>Bathroom remodel timelines:</p>
      <ul>
        <li><strong>Powder room:</strong> 2-3 weeks</li>
        <li><strong>Full bathroom:</strong> 3-5 weeks</li>
        <li><strong>Master bathroom:</strong> 5-8 weeks</li>
        <li><strong>Luxury/custom bathroom:</strong> 8-12 weeks</li>
      </ul>
      <p>Timeline factors include:</p>
      <ul>
        <li>Custom vanity/tile lead times (4-8 weeks)</li>
        <li>Permit approval (1-2 weeks in most NJ municipalities)</li>
        <li>Plumbing relocations</li>
        <li>Waterproofing cure time</li>
      </ul>
      <p>We coordinate schedules to minimize time without a functional bathroom when it's your only one.</p>`
  },
  {
    id: "bathroom-9",
    question: "What luxury features should I consider for a master bathroom?",
    answer: `<p>Elevate your master bathroom with these luxury features:</p>
      <ul>
        <li><strong>Steam shower:</strong> Spa experience at home ($2,500-5,000 additional)</li>
        <li><strong>Heated floors:</strong> Radiant warmth underfoot ($10-20/sq ft)</li>
        <li><strong>Freestanding tub:</strong> Sculptural focal point ($2,000-10,000)</li>
        <li><strong>Dual vanities:</strong> His and hers sinks with separate mirrors</li>
        <li><strong>Smart toilet:</strong> Bidet, heated seat, auto-flush ($3,000-8,000)</li>
        <li><strong>Chandeliers/statement lighting:</strong> Elevates the whole room</li>
        <li><strong>Towel warmers:</strong> Electric or hydronic ($500-2,000)</li>
        <li><strong>Built-in sound system:</strong> Waterproof Bluetooth speakers</li>
      </ul>
      <p>These features are especially popular in luxury communities like Alpine, Short Hills, and Saddle River.</p>`
  }
];

// Category 4: Choosing a Contractor
const choosingContractorFAQs: FAQItem[] = [
  {
    id: "contractor-1",
    question: "How do I verify a contractor's license and insurance in New Jersey?",
    answer: `<p>Verifying a New Jersey contractor:</p>
      <ul>
        <li><strong>License verification:</strong> NJ Home Improvement Contractor (HIC) licenses can be verified at the NJ Division of Consumer Affairs website</li>
        <li><strong>Insurance requirements:</strong> Ask for certificates of:
          <ul>
            <li>General liability insurance (minimum $500,000)</li>
            <li>Workers' compensation insurance</li>
          </ul>
        </li>
        <li><strong>Bonding:</strong> Ensures financial protection if contractor fails to complete work</li>
      </ul>
      <p><strong>La Vaca Credentials:</strong> We are fully licensed (HIC# 13VH13373800), bonded ($500,000), and carry $2M in liability coverage. Copies are available upon request.</p>`
  },
  {
    id: "contractor-2",
    question: "What questions should I ask before hiring a contractor?",
    answer: `<p>Essential questions to ask any contractor:</p>
      <ul>
        <li>Are you licensed and insured? (Get proof)</li>
        <li>How long have you been in business under this name?</li>
        <li>Can you provide references from recent similar projects?</li>
        <li>Who will be my primary point of contact?</li>
        <li>Do you use employees or subcontractors?</li>
        <li>What is your payment schedule?</li>
        <li>How do you handle change orders?</li>
        <li>What warranties do you offer?</li>
        <li>What is your estimated timeline?</li>
        <li>How do you handle permits and inspections?</li>
      </ul>
      <p>A quality contractor welcomes these questions. Hesitation is a red flag. <a href="/contact">Schedule a consultation</a> to experience our transparent approach.</p>`
  },
  {
    id: "contractor-3",
    question: "How do I check contractor references and reviews?",
    answer: `<p>Thoroughly vetting a contractor:</p>
      <ul>
        <li><strong>Ask for 3-5 recent references:</strong> Projects similar in scope to yours</li>
        <li><strong>Actually call references:</strong> Ask about communication, timeline, quality, and any issues</li>
        <li><strong>Visit a completed project:</strong> If possible, see their work in person</li>
        <li><strong>Check online reviews:</strong> Google, Houzz, Yelp, Angi (look for patterns, not just individual reviews)</li>
        <li><strong>Better Business Bureau:</strong> Check for complaints and ratings</li>
        <li><strong>Social proof:</strong> Portfolio photos, before/after galleries</li>
      </ul>
      <p>We encourage prospective clients to speak with our past customers. Our 100% 5-star rating reflects our commitment to excellence. <a href="/portfolio">View our portfolio</a>.</p>`
  },
  {
    id: "contractor-4",
    question: "What are red flags to watch for when hiring a contractor?",
    answer: `<p>Warning signs to avoid:</p>
      <ul>
        <li><strong>No physical address:</strong> P.O. box only is concerning</li>
        <li><strong>Demands large upfront payments:</strong> More than 30% is unusual</li>
        <li><strong>No written contract:</strong> Everything should be documented</li>
        <li><strong>Pressure tactics:</strong> "This price is only good today"</li>
        <li><strong>Cash-only requests:</strong> For "discounts" (often tax evasion)</li>
        <li><strong>No license/insurance proof:</strong> "It's at the office"</li>
        <li><strong>Poor communication:</strong> Doesn't return calls promptly</li>
        <li><strong>Unusually low bids:</strong> Often means cut corners or change orders</li>
        <li><strong>Won't pull permits:</strong> Puts you at legal risk</li>
        <li><strong>Rebranding history:</strong> Check if they've operated under other names</li>
      </ul>
      <p>Trust your instincts. If something feels wrong, it probably is.</p>`
  },
  {
    id: "contractor-5",
    question: "What is the difference between an estimate and a quote?",
    answer: `<p>Understanding pricing terminology:</p>
      <p><strong>Estimate:</strong></p>
      <ul>
        <li>Rough approximation based on limited information</li>
        <li>Not binding; final cost may vary significantly</li>
        <li>Typically given before detailed planning</li>
      </ul>
      <p><strong>Quote (or Bid):</strong></p>
      <ul>
        <li>Fixed price based on defined scope of work</li>
        <li>Created after detailed measurements and planning</li>
        <li>Should be binding (with allowances for unforeseen issues)</li>
        <li>Includes specific materials, labor, timeline</li>
      </ul>
      <p>We provide detailed quotes after our design phase, breaking down every cost so you know exactly what you're paying for.</p>`
  },
  {
    id: "contractor-6",
    question: "What should be included in a renovation contract?",
    answer: `<p>A thorough contract protects both parties. It should include:</p>
      <ul>
        <li><strong>Full scope of work:</strong> Detailed description of all tasks</li>
        <li><strong>Materials specifications:</strong> Brands, models, colors, grades</li>
        <li><strong>Total price:</strong> With itemized breakdown</li>
        <li><strong>Payment schedule:</strong> Tied to milestones, not dates</li>
        <li><strong>Project timeline:</strong> Start date, milestones, completion date</li>
        <li><strong>Change order process:</strong> How modifications are priced and approved</li>
        <li><strong>Permit responsibilities:</strong> Who applies and pays</li>
        <li><strong>Warranty terms:</strong> Coverage period and what's included</li>
        <li><strong>Dispute resolution:</strong> Mediation/arbitration clauses</li>
        <li><strong>Cancellation terms:</strong> What happens if either party cancels</li>
        <li><strong>Insurance certificates:</strong> Attached as exhibits</li>
      </ul>
      <p>Never sign a vague contract. Ask questions about anything unclear.</p>`
  },
  {
    id: "contractor-7",
    question: "How often should I expect communication from my contractor?",
    answer: `<p>Good communication is essential. Expect:</p>
      <ul>
        <li><strong>Daily updates:</strong> During active construction (brief check-ins)</li>
        <li><strong>Weekly meetings:</strong> Review progress, upcoming work, any decisions needed</li>
        <li><strong>Immediate contact:</strong> For any issues or surprises discovered</li>
        <li><strong>Photo documentation:</strong> Progress photos, especially of hidden work</li>
        <li><strong>Decision requests:</strong> Timely when your input is needed</li>
      </ul>
      <p>At La Vaca, we assign a dedicated project manager as your single point of contact. You'll never wonder what's happening at your home. We send daily progress photos and are always available by phone or text.</p>`
  },
  {
    id: "contractor-8",
    question: "What warranty coverage should I expect from a contractor?",
    answer: `<p>Typical warranty coverage:</p>
      <ul>
        <li><strong>Workmanship warranty:</strong> 1-2 years is standard; 5+ years indicates high confidence</li>
        <li><strong>Manufacturer warranties:</strong> Appliances, fixtures, materials (varies widely)</li>
        <li><strong>Structural work:</strong> Often 10 years for framing, foundation work</li>
      </ul>
      <p><strong>What should be covered:</strong></p>
      <ul>
        <li>Defects in installation or workmanship</li>
        <li>Material failures under normal use</li>
        <li>Return visits to fix warranty issues at no cost</li>
      </ul>
      <p><strong>What's typically excluded:</strong></p>
      <ul>
        <li>Normal wear and tear</li>
        <li>Damage from misuse or neglect</li>
        <li>Issues caused by subsequent contractors</li>
      </ul>
      <p>Get warranty terms in writing. We stand behind our work with comprehensive warranty coverage.</p>`
  },
  {
    id: "contractor-9",
    question: "How should I handle disputes with a contractor?",
    answer: `<p>Steps to resolve contractor disputes:</p>
      <ul>
        <li><strong>Document everything:</strong> Photos, emails, texts, contracts</li>
        <li><strong>Communicate in writing:</strong> Create paper trail via email</li>
        <li><strong>Reference the contract:</strong> Point to specific clauses being violated</li>
        <li><strong>Request a meeting:</strong> Many issues resolve through direct conversation</li>
        <li><strong>Mediation:</strong> Neutral third party helps reach agreement</li>
        <li><strong>NJ Consumer Affairs:</strong> File a complaint for licensed contractor violations</li>
        <li><strong>Small claims court:</strong> For disputes under $3,000</li>
        <li><strong>Legal action:</strong> For larger disputes, consult an attorney</li>
      </ul>
      <p>Prevention is best: clear contracts, milestone payments, and open communication prevent most disputes.</p>`
  },
  {
    id: "contractor-10",
    question: "Why should I choose La Vaca General Contractors?",
    answer: `<p>La Vaca General Contractors stands out in Northern New Jersey:</p>
      <ul>
        <li><strong>Fully Licensed & Insured:</strong> NJ HIC# 13VH13373800, $500K bond, $2M liability coverage</li>
        <li><strong>Family-Owned Values:</strong> We treat every project like it's our own home</li>
        <li><strong>Boutique Approach:</strong> We take limited projects for dedicated attention</li>
        <li><strong>100% 5-Star Reviews:</strong> Our track record speaks for itself</li>
        <li><strong>Transparent Process:</strong> Detailed estimates with no hidden costs</li>
        <li><strong>Expert Craftsmanship:</strong> 20+ years combined experience</li>
        <li><strong>Local Focus:</strong> We know Northern NJ homes and building codes</li>
        <li><strong>Clear Communication:</strong> Daily updates and dedicated project manager</li>
      </ul>
      <p>We serve Alpine, Short Hills, Saddle River, Essex Fells, Montclair, and surrounding communities. <a href="/about">Learn more about our team</a> or <a href="/contact">schedule a free consultation</a>.</p>`
  }
];

// Category 5: Timeline & Process
const timelineProcessFAQs: FAQItem[] = [
  {
    id: "timeline-1",
    question: "How long do home renovations typically take?",
    answer: `<p>Renovation timelines by project type:</p>
      <ul>
        <li><strong>Bathroom remodel:</strong> 3-8 weeks</li>
        <li><strong>Kitchen remodel:</strong> 6-16 weeks</li>
        <li><strong>Basement finishing:</strong> 4-10 weeks</li>
        <li><strong>Home addition:</strong> 3-6 months</li>
        <li><strong>Whole-home renovation:</strong> 4-12 months</li>
      </ul>
      <p>These timelines include design, permits, and construction. Custom elements, material availability, and scope changes can extend timelines. We provide realistic schedules and communicate any changes promptly. <a href="/process">See our detailed process</a>.</p>`
  },
  {
    id: "timeline-2",
    question: "What commonly causes renovation delays?",
    answer: `<p>Common causes of project delays:</p>
      <ul>
        <li><strong>Permit delays:</strong> Municipal approval can take 1-4 weeks</li>
        <li><strong>Material lead times:</strong> Custom cabinets (6-10 weeks), specialty tile (4-8 weeks)</li>
        <li><strong>Unexpected discoveries:</strong> Hidden water damage, outdated wiring, asbestos</li>
        <li><strong>Weather:</strong> Affects exterior work, material deliveries</li>
        <li><strong>Subcontractor scheduling:</strong> Coordinating multiple trades</li>
        <li><strong>Client decisions:</strong> Delayed selections or change orders</li>
        <li><strong>Inspection failures:</strong> Requires rework and re-inspection</li>
      </ul>
      <p>We mitigate delays through thorough pre-project inspections, ordering materials early, and maintaining buffer time in schedules.</p>`
  },
  {
    id: "timeline-3",
    question: "What permits are required for home renovations in New Jersey?",
    answer: `<p>NJ permit requirements by work type:</p>
      <ul>
        <li><strong>Always requires permits:</strong>
          <ul>
            <li>Electrical work (panel upgrades, new circuits)</li>
            <li>Plumbing work (moving fixtures, new lines)</li>
            <li>Structural changes (removing walls, additions)</li>
            <li>HVAC modifications</li>
            <li>Roofing replacement</li>
          </ul>
        </li>
        <li><strong>Typically no permit needed:</strong>
          <ul>
            <li>Painting, wallpaper, flooring</li>
            <li>Cabinet replacements (same layout)</li>
            <li>Fixture swaps (same location)</li>
            <li>Cosmetic updates</li>
          </ul>
        </li>
      </ul>
      <p>We handle all permit applications and coordinate inspections. Working without required permits puts you at legal and insurance risk.</p>`
  },
  {
    id: "timeline-4",
    question: "What happens during the design and planning phase?",
    answer: `<p>Our design and planning phase includes:</p>
      <ul>
        <li><strong>Initial consultation:</strong> Understanding your vision, needs, and budget</li>
        <li><strong>Site assessment:</strong> Detailed measurements, condition evaluation</li>
        <li><strong>Concept design:</strong> Layout options, style direction</li>
        <li><strong>3D renderings:</strong> Visualize the finished space before construction</li>
        <li><strong>Material selection:</strong> Choosing finishes, fixtures, appliances</li>
        <li><strong>Engineering review:</strong> For structural modifications</li>
        <li><strong>Detailed estimate:</strong> Itemized costs for everything</li>
        <li><strong>Timeline creation:</strong> Realistic schedule with milestones</li>
      </ul>
      <p>This phase typically takes 1-3 weeks depending on project complexity. Thorough planning prevents problems during construction. <a href="/process">Learn about our 6-step process</a>.</p>`
  },
  {
    id: "timeline-5",
    question: "Can I live in my home during a major renovation?",
    answer: `<p>Living at home during renovations is possible with planning:</p>
      <ul>
        <li><strong>Workable scenarios:</strong>
          <ul>
            <li>Single bathroom being renovated (if you have another)</li>
            <li>Kitchen remodel (with temporary kitchen setup)</li>
            <li>Basement finishing (minimal disruption upstairs)</li>
          </ul>
        </li>
        <li><strong>Consider temporary housing for:</strong>
          <ul>
            <li>Only bathroom being renovated</li>
            <li>Extensive dust-generating work (major demolition)</li>
            <li>HVAC replacement in extreme weather</li>
            <li>Whole-home renovations</li>
          </ul>
        </li>
      </ul>
      <p>We install dust barriers, maintain clean pathways, and work to minimize disruption. Many clients successfully stay home throughout renovations with good communication and planning.</p>`
  },
  {
    id: "timeline-6",
    question: "How can I minimize disruption during construction?",
    answer: `<p>Strategies to reduce renovation stress:</p>
      <ul>
        <li><strong>Clear the work zone:</strong> Move furniture and valuables before work starts</li>
        <li><strong>Establish boundaries:</strong> Define where workers can and cannot go</li>
        <li><strong>Set work hours:</strong> Agree on start/end times that work for your schedule</li>
        <li><strong>Create alternative spaces:</strong> Temporary kitchen, remote work area</li>
        <li><strong>Protect your home:</strong> We use floor coverings and dust barriers</li>
        <li><strong>Communicate needs:</strong> Tell us about important meetings, events, schedules</li>
        <li><strong>Plan for pets:</strong> Keep them safe and away from work areas</li>
        <li><strong>Daily cleanup:</strong> We clean up at the end of each workday</li>
      </ul>
      <p>Open communication is key. We work with your lifestyle to minimize impact.</p>`
  },
  {
    id: "timeline-7",
    question: "What should I expect during the construction phase?",
    answer: `<p>During active construction:</p>
      <ul>
        <li><strong>Daily activity:</strong> Workers arrive typically 8-9am, leave by 4-5pm</li>
        <li><strong>Noise levels:</strong> Demolition and power tools are loud; we give advance notice</li>
        <li><strong>Dust and debris:</strong> Contained as much as possible with barriers</li>
        <li><strong>Material deliveries:</strong> Scheduled throughout the project</li>
        <li><strong>Inspections:</strong> Building inspector visits at key milestones</li>
        <li><strong>Daily communication:</strong> Progress updates, photos, any issues</li>
        <li><strong>Decision points:</strong> You'll be asked to approve/select at various stages</li>
        <li><strong>Access needs:</strong> Workers need access to work areas and utilities</li>
      </ul>
      <p>We maintain a clean, organized job site and respect your home throughout the process.</p>`
  },
  {
    id: "timeline-8",
    question: "What happens during the final walkthrough?",
    answer: `<p>The final walkthrough is your opportunity to inspect everything:</p>
      <ul>
        <li><strong>Systematic review:</strong> We go through every element of the project together</li>
        <li><strong>Punch list creation:</strong> Note any items needing adjustment or correction</li>
        <li><strong>Functionality testing:</strong> Test all fixtures, appliances, switches, doors</li>
        <li><strong>Quality inspection:</strong> Check paint, caulking, grout, trim work</li>
        <li><strong>Cleaning verification:</strong> Professional cleaning should be complete</li>
        <li><strong>Documentation:</strong> Receive manuals, warranties, care instructions</li>
        <li><strong>Final photos:</strong> We document the completed project</li>
        <li><strong>Punch list completion:</strong> Minor items addressed immediately or scheduled</li>
      </ul>
      <p>We don't consider a project complete until you're 100% satisfied. Final payment is due after the walkthrough and punch list completion.</p>`
  }
];

// Category 6: General Renovation
const generalRenovationFAQs: FAQItem[] = [
  {
    id: "general-1",
    question: "Where should I start when planning a home renovation?",
    answer: `<p>Start your renovation journey with these steps:</p>
      <ul>
        <li><strong>Define your goals:</strong> What problems are you solving? What's your vision?</li>
        <li><strong>Set a realistic budget:</strong> Research costs for your project type</li>
        <li><strong>Prioritize projects:</strong> What needs to happen first?</li>
        <li><strong>Research contractors:</strong> Read reviews, check licenses, get referrals</li>
        <li><strong>Gather inspiration:</strong> Pinterest, Houzz, magazines, showrooms</li>
        <li><strong>Understand timing:</strong> When do you need it completed?</li>
        <li><strong>Consider logistics:</strong> Living arrangements during construction</li>
        <li><strong>Get consultations:</strong> Meet with 2-3 contractors for perspectives</li>
      </ul>
      <p><a href="/contact">Schedule a free consultation</a> to discuss your project. We'll help clarify scope, budget, and timeline.</p>`
  },
  {
    id: "general-2",
    question: "When is it better to renovate vs. rebuild?",
    answer: `<p>Consider rebuilding when:</p>
      <ul>
        <li>Renovation costs exceed 50% of home replacement value</li>
        <li>Foundation or structural issues are severe</li>
        <li>Layout doesn't meet your needs and can't be reasonably modified</li>
        <li>Major systems (electrical, plumbing, HVAC) all need replacement</li>
        <li>Zoning allows for larger footprint you want</li>
      </ul>
      <p><strong>Renovate when:</strong></p>
      <ul>
        <li>Structure is sound and well-built</li>
        <li>Location and lot are valuable</li>
        <li>Historic character worth preserving</li>
        <li>Budget is limited</li>
        <li>Timeline is tight (rebuilds take longer)</li>
        <li>Sentimental value to existing home</li>
      </ul>
      <p>We can assess your home and provide honest advice on the best approach.</p>`
  },
  {
    id: "general-3",
    question: "What room should I renovate first?",
    answer: `<p>Prioritize based on your goals:</p>
      <p><strong>For daily quality of life:</strong></p>
      <ul>
        <li>Kitchen (used multiple times daily)</li>
        <li>Master bathroom (daily morning/evening routines)</li>
        <li>Living spaces where you spend the most time</li>
      </ul>
      <p><strong>For resale value:</strong></p>
      <ul>
        <li>Kitchen (highest ROI for most homes)</li>
        <li>Bathrooms (especially if dated)</li>
        <li>Curb appeal (entry, exterior)</li>
      </ul>
      <p><strong>For necessity:</strong></p>
      <ul>
        <li>Address safety issues first (electrical, structural)</li>
        <li>Fix water damage or mold issues</li>
        <li>Replace failing systems (roof, HVAC)</li>
      </ul>
      <p>If budget allows, combining kitchen and bathroom renovations is efficient since contractors and materials are already mobilized.</p>`
  },
  {
    id: "general-4",
    question: "What projects should I DIY vs. hire a professional?",
    answer: `<p><strong>DIY-friendly projects:</strong></p>
      <ul>
        <li>Painting (walls, trim, cabinets)</li>
        <li>Simple fixture replacements (same location)</li>
        <li>Hardware swaps (cabinet pulls, doorknobs)</li>
        <li>Landscaping and gardening</li>
        <li>Wallpaper removal</li>
        <li>Minor repairs (patching holes, caulking)</li>
      </ul>
      <p><strong>Hire a professional for:</strong></p>
      <ul>
        <li>Electrical work (safety, code compliance)</li>
        <li>Plumbing beyond simple swaps</li>
        <li>Structural modifications</li>
        <li>Gas appliance installation</li>
        <li>Roofing</li>
        <li>Window/door installation</li>
        <li>Anything requiring permits</li>
      </ul>
      <p>DIY gone wrong often costs more to fix than hiring a pro initially. When in doubt, consult a professional.</p>`
  },
  {
    id: "general-5",
    question: "What are the best eco-friendly and sustainable renovation options?",
    answer: `<p>Sustainable renovation choices:</p>
      <ul>
        <li><strong>Energy efficiency:</strong>
          <ul>
            <li>ENERGY STAR appliances</li>
            <li>LED lighting throughout</li>
            <li>Smart thermostats</li>
            <li>Improved insulation</li>
            <li>Energy-efficient windows</li>
          </ul>
        </li>
        <li><strong>Water conservation:</strong>
          <ul>
            <li>Low-flow faucets and showerheads</li>
            <li>Dual-flush toilets</li>
            <li>Tankless water heaters</li>
          </ul>
        </li>
        <li><strong>Sustainable materials:</strong>
          <ul>
            <li>FSC-certified wood</li>
            <li>Recycled content materials</li>
            <li>Low-VOC paints and finishes</li>
            <li>Bamboo or cork flooring</li>
          </ul>
        </li>
      </ul>
      <p>Many eco-friendly upgrades qualify for NJ Clean Energy rebates and federal tax credits. We can incorporate sustainable options into any project.</p>`
  },
  {
    id: "general-6",
    question: "What are the most common renovation mistakes to avoid?",
    answer: `<p>Learn from others' mistakes:</p>
      <ul>
        <li><strong>Underestimating budget:</strong> Always include 15-20% contingency</li>
        <li><strong>Hiring the cheapest contractor:</strong> Low bids often mean cut corners</li>
        <li><strong>Skipping permits:</strong> Creates legal, insurance, and resale problems</li>
        <li><strong>Ignoring workflow:</strong> Poor layout wastes space and frustrates daily use</li>
        <li><strong>Trend chasing:</strong> Overly trendy choices look dated quickly</li>
        <li><strong>Underestimating timeline:</strong> Plan for longer than estimated</li>
        <li><strong>Making decisions on the fly:</strong> Plan selections before construction</li>
        <li><strong>Neglecting storage:</strong> Never enough closets and cabinets</li>
        <li><strong>Cutting corners on infrastructure:</strong> Electrical, plumbing, waterproofing</li>
        <li><strong>Poor lighting design:</strong> Insufficient light ruins otherwise great spaces</li>
      </ul>
      <p>Our thorough planning process helps you avoid these common pitfalls.</p>`
  },
  {
    id: "general-7",
    question: "What is the best time of year to start a renovation?",
    answer: `<p>Timing considerations for renovations:</p>
      <p><strong>Best times:</strong></p>
      <ul>
        <li><strong>Late winter/early spring:</strong> Book contractors before busy season</li>
        <li><strong>Fall:</strong> After summer rush, before holidays</li>
      </ul>
      <p><strong>Considerations by season:</strong></p>
      <ul>
        <li><strong>Winter:</strong> Contractors less busy, possible discounts; challenges for exterior work</li>
        <li><strong>Spring:</strong> Good weather begins; contractors booking up fast</li>
        <li><strong>Summer:</strong> Peak demand, longest wait times; best for exterior work</li>
        <li><strong>Fall:</strong> Moderate demand; complete before holidays</li>
      </ul>
      <p><strong>Plan ahead:</strong> For major renovations, book 2-3 months in advance. Custom materials need even longer lead times.</p>`
  },
  {
    id: "general-8",
    question: "How should I prepare my home before renovation begins?",
    answer: `<p>Preparation checklist before construction starts:</p>
      <ul>
        <li><strong>Clear the work area:</strong> Remove furniture, decor, personal items</li>
        <li><strong>Protect valuables:</strong> Move fragile items to safe locations</li>
        <li><strong>Create pathways:</strong> Clear access for workers and materials</li>
        <li><strong>Notify neighbors:</strong> Especially for noise, parking, dumpsters</li>
        <li><strong>Prepare for dust:</strong> Cover or remove items in adjacent rooms</li>
        <li><strong>Set up alternatives:</strong> Temporary kitchen, second bathroom access</li>
        <li><strong>Secure pets:</strong> Plan for their safety during work hours</li>
        <li><strong>Document everything:</strong> Photos of existing conditions</li>
        <li><strong>Confirm logistics:</strong> Parking for workers, material delivery access</li>
        <li><strong>Stock up:</strong> On essentials if access will be limited</li>
      </ul>
      <p>We provide a detailed preparation guide before work begins and help coordinate logistics.</p>`
  }
];

// All categories combined
export const faqCategories: FAQCategory[] = [
  {
    id: "costs-budgeting",
    title: "Costs & Budgeting",
    description: "Understanding renovation costs, budgeting tips, and financing options",
    iconName: "DollarSign",
    faqs: costsBudgetingFAQs
  },
  {
    id: "kitchen-remodeling",
    title: "Kitchen Remodeling",
    description: "Kitchen design, materials, timelines, and trends",
    iconName: "ChefHat",
    faqs: kitchenRemodelingFAQs
  },
  {
    id: "bathroom-renovation",
    title: "Bathroom Renovation",
    description: "Bathroom design, fixtures, waterproofing, and accessibility",
    iconName: "Bath",
    faqs: bathroomRenovationFAQs
  },
  {
    id: "choosing-contractor",
    title: "Choosing a Contractor",
    description: "How to find, vet, and work with the right contractor",
    iconName: "ClipboardCheck",
    faqs: choosingContractorFAQs
  },
  {
    id: "timeline-process",
    title: "Timeline & Process",
    description: "What to expect during your renovation project",
    iconName: "Clock",
    faqs: timelineProcessFAQs
  },
  {
    id: "general-renovation",
    title: "General Renovation",
    description: "Planning, preparation, and best practices",
    iconName: "Home",
    faqs: generalRenovationFAQs
  }
];

// Helper function to get all FAQs flattened (for schema generation)
export function getAllFAQs(): FAQItem[] {
  return faqCategories.flatMap(category => category.faqs);
}

// Helper function to get FAQ count
export function getFAQCount(): number {
  return getAllFAQs().length;
}
