import React from 'react';
import Link from 'next/link';

// Each article returns JSX content for the resource page
export const resourceContent: Record<string, React.ReactNode> = {
  'nj-building-permits': (
    <>
      <p className="text-lg text-text-secondary leading-relaxed mb-6">
        If you&apos;re planning a home renovation in New Jersey, one of the first questions you&apos;ll face
        is: <strong>&quot;Do I need a building permit?&quot;</strong> The short answer is — for most renovation work,
        yes. Understanding the permit process upfront saves you headaches, fines, and project delays
        down the road.
      </p>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        When Do You Need a Building Permit in NJ?
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        New Jersey&apos;s Uniform Construction Code (UCC) requires permits for most construction work
        that changes the structure, electrical, plumbing, or mechanical systems of your home. Here&apos;s
        a breakdown:
      </p>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        Projects That Typically Require Permits
      </h3>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li><strong>Kitchen remodeling</strong> — Especially if you&apos;re moving plumbing, adding electrical circuits, or removing walls. See our <Link href="/services/kitchen-remodeling" className="text-primary hover:underline">kitchen remodeling services</Link>.</li>
        <li><strong>Bathroom renovations</strong> — Any plumbing changes, new fixtures with different locations, or electrical work. Learn more about our <Link href="/services/bathroom-renovation" className="text-primary hover:underline">bathroom renovation services</Link>.</li>
        <li><strong>Basement finishing</strong> — Adding livable space requires permits for framing, electrical, plumbing, HVAC, and egress. Check out our <Link href="/services/basement-finishing" className="text-primary hover:underline">basement finishing services</Link>.</li>
        <li><strong>Home additions</strong> — Always require full permits including structural, electrical, plumbing, and sometimes fire protection. See our <Link href="/services/home-additions" className="text-primary hover:underline">home addition services</Link>.</li>
        <li><strong>Structural changes</strong> — Removing or modifying load-bearing walls, adding beams, or changing the roofline</li>
        <li><strong>Electrical work</strong> — New circuits, panel upgrades, rewiring</li>
        <li><strong>Plumbing work</strong> — Moving or adding fixtures, water heater replacement</li>
        <li><strong>HVAC changes</strong> — New systems, ductwork modifications, adding zones</li>
        <li><strong>Roofing</strong> — Full roof replacement (some municipalities require permits)</li>
        <li><strong>Decks and patios</strong> — Especially if attached to the house or elevated</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        Projects That Usually Don&apos;t Need Permits
      </h3>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li>Painting and wallpapering</li>
        <li>Replacing flooring (same level, no structural changes)</li>
        <li>Cabinet refacing (without moving plumbing or electrical)</li>
        <li>Replacing fixtures in the same location (like-for-like)</li>
        <li>Minor cosmetic upgrades</li>
      </ul>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        How to Get a Building Permit in New Jersey
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        The permit process varies slightly by municipality, but the general steps are consistent
        across Northern NJ:
      </p>
      <ol className="list-decimal pl-6 space-y-3 text-text-secondary mb-6">
        <li><strong>Hire a licensed contractor.</strong> In NJ, your contractor (HIC license holder) typically handles permit applications on your behalf. Make sure they&apos;re licensed — you can verify at the NJ Division of Consumer Affairs.</li>
        <li><strong>Prepare plans and drawings.</strong> Depending on scope, you may need architectural drawings, engineering calculations, or a simple sketch. Larger projects like additions need stamped architectural plans.</li>
        <li><strong>Submit the application.</strong> Applications go to your local construction office (building department). Many NJ towns now accept online submissions.</li>
        <li><strong>Pay permit fees.</strong> Fees are based on the estimated project cost. Typical range is $75-$500+ depending on scope and municipality.</li>
        <li><strong>Wait for approval.</strong> Review timelines vary: simple permits may be approved in 1-2 weeks, while complex projects (additions, structural) can take 4-8 weeks.</li>
        <li><strong>Display the permit.</strong> Once approved, the permit must be posted visibly at the job site.</li>
        <li><strong>Schedule inspections.</strong> Throughout construction, inspectors will check work at various stages (rough framing, rough electrical/plumbing, insulation, final).</li>
        <li><strong>Get the Certificate of Approval (CO or CA).</strong> After the final inspection passes, you&apos;ll receive official sign-off that the work meets code.</li>
      </ol>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Typical Permit Timelines in NJ
      </h2>
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold text-text-primary">Project Type</th>
              <th className="text-left py-3 px-4 font-semibold text-text-primary">Approval Time</th>
              <th className="text-left py-3 px-4 font-semibold text-text-primary">Est. Fee Range</th>
            </tr>
          </thead>
          <tbody className="text-text-secondary">
            <tr className="border-b border-border/50"><td className="py-3 px-4">Kitchen/Bathroom</td><td className="py-3 px-4">1-3 weeks</td><td className="py-3 px-4">$100-$300</td></tr>
            <tr className="border-b border-border/50"><td className="py-3 px-4">Basement Finishing</td><td className="py-3 px-4">2-4 weeks</td><td className="py-3 px-4">$150-$400</td></tr>
            <tr className="border-b border-border/50"><td className="py-3 px-4">Home Addition</td><td className="py-3 px-4">4-8 weeks</td><td className="py-3 px-4">$300-$1,000+</td></tr>
            <tr className="border-b border-border/50"><td className="py-3 px-4">Structural Changes</td><td className="py-3 px-4">3-6 weeks</td><td className="py-3 px-4">$200-$500</td></tr>
            <tr><td className="py-3 px-4">Electrical/Plumbing</td><td className="py-3 px-4">1-2 weeks</td><td className="py-3 px-4">$75-$200</td></tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        What Happens If You Skip the Permit?
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        Skipping permits might seem tempting to save time and money, but it can backfire:
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li><strong>Fines and penalties</strong> — Municipal fines for unpermitted work can be substantial</li>
        <li><strong>Forced removal</strong> — You may be required to tear out completed work for inspection</li>
        <li><strong>Insurance issues</strong> — Your homeowner&apos;s insurance may not cover damage related to unpermitted work</li>
        <li><strong>Selling problems</strong> — Unpermitted work creates title issues and can derail a home sale</li>
        <li><strong>Safety risks</strong> — Inspections exist to ensure your home is safe for your family</li>
      </ul>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        How La Vaca Handles Permits for You
      </h2>
      <p className="text-text-secondary leading-relaxed mb-6">
        As a licensed NJ Home Improvement Contractor (HIC# 13VH13373800), La Vaca General Contractors
        handles the entire permit process for every project. We prepare all necessary documentation,
        submit applications, coordinate inspections, and ensure everything is properly closed out.
        You never have to set foot in a building department.
      </p>
      <p className="text-text-secondary leading-relaxed">
        Have questions about permits for your specific project? <Link href="/contact" className="text-primary hover:underline">Contact us for a free consultation</Link> and
        we&apos;ll walk you through exactly what&apos;s needed. You can also learn more about our step-by-step
        approach on our <Link href="/process" className="text-primary hover:underline">process page</Link>.
      </p>
    </>
  ),

  'renovation-timeline': (
    <>
      <p className="text-lg text-text-secondary leading-relaxed mb-6">
        One of the most common questions we hear from homeowners is <strong>&quot;How long will my renovation
        take?&quot;</strong> The honest answer depends on your project scope, but we believe in setting
        realistic expectations from day one. Here&apos;s what typical renovation timelines look like
        in Northern New Jersey.
      </p>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Kitchen Remodeling Timeline
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        A <Link href="/services/kitchen-remodeling" className="text-primary hover:underline">kitchen remodel</Link> is
        one of the most involved renovation projects because it touches nearly every trade — demolition,
        framing, electrical, plumbing, HVAC, drywall, cabinets, countertops, tile, painting, and
        appliance installation.
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li><strong>Minor kitchen refresh</strong> (new countertops, cabinet refacing, backsplash): 2-4 weeks</li>
        <li><strong>Mid-range remodel</strong> (new cabinets, countertops, flooring, appliances): 6-10 weeks</li>
        <li><strong>Full gut renovation</strong> (new layout, moved plumbing/electrical, structural changes): 10-16 weeks</li>
        <li><strong>Kitchen expansion</strong> (knocking out walls, adding space): 12-20 weeks</li>
      </ul>
      <p className="text-text-secondary leading-relaxed mb-6">
        <strong>Key delay factors:</strong> Custom cabinetry (6-10 week lead time), natural stone
        countertops (2-4 week fabrication), appliance backorders, and permit approval.
      </p>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Bathroom Renovation Timeline
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        <Link href="/services/bathroom-renovation" className="text-primary hover:underline">Bathroom renovations</Link> are
        typically faster than kitchens due to smaller scope, but plumbing and waterproofing add complexity.
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li><strong>Cosmetic update</strong> (new fixtures, paint, accessories): 1-2 weeks</li>
        <li><strong>Standard renovation</strong> (new tile, vanity, toilet, fixtures): 3-5 weeks</li>
        <li><strong>Full gut renovation</strong> (new layout, moved plumbing, custom shower): 5-8 weeks</li>
        <li><strong>Primary suite bathroom</strong> (luxury finishes, custom features): 6-10 weeks</li>
      </ul>
      <p className="text-text-secondary leading-relaxed mb-6">
        <strong>What takes time:</strong> Proper waterproofing membranes need curing time (you
        don&apos;t want shortcuts here), custom tile work is meticulous, and custom vanities have lead times.
      </p>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Basement Finishing Timeline
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        A <Link href="/services/basement-finishing" className="text-primary hover:underline">basement finishing</Link> project
        transforms raw space into livable area. The timeline depends heavily on the scope — a simple
        rec room is much faster than a full basement suite with bathroom and kitchenette.
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li><strong>Basic rec room</strong> (framing, drywall, flooring, lighting): 4-6 weeks</li>
        <li><strong>Basement with bathroom</strong> (adds plumbing rough-in, fixtures): 6-10 weeks</li>
        <li><strong>Full basement suite</strong> (bedroom, bathroom, kitchenette, storage): 8-14 weeks</li>
        <li><strong>Walkout basement renovation</strong> (with exterior work): 10-16 weeks</li>
      </ul>
      <p className="text-text-secondary leading-relaxed mb-6">
        <strong>Common challenges:</strong> Moisture issues that need waterproofing first, low ceiling
        heights requiring creative solutions, running plumbing to new bathrooms (sometimes requiring
        sewer ejector pumps), and HVAC extensions.
      </p>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Home Addition Timeline
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        <Link href="/services/home-additions" className="text-primary hover:underline">Home additions</Link> are
        the longest projects because they involve new construction from the ground up — foundation,
        framing, roofing, and tying into existing systems.
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li><strong>Bump-out addition</strong> (small room extension, 100-200 sq ft): 8-12 weeks</li>
        <li><strong>Single room addition</strong> (master bedroom, family room): 12-18 weeks</li>
        <li><strong>Multi-room addition</strong> (primary suite with bathroom): 16-24 weeks</li>
        <li><strong>Second story addition</strong>: 20-30+ weeks</li>
      </ul>
      <p className="text-text-secondary leading-relaxed mb-6">
        <strong>Why additions take longer:</strong> Architectural plans need engineering stamps, permit
        review for additions is more thorough (4-8 weeks alone), foundation work is weather-dependent,
        and tying new construction into existing structures requires careful sequencing.
      </p>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Tips to Keep Your Project on Schedule
      </h2>
      <ol className="list-decimal pl-6 space-y-3 text-text-secondary mb-6">
        <li><strong>Make decisions early.</strong> The number one cause of delays is indecision on materials, colors, and fixtures. Select everything before demo begins.</li>
        <li><strong>Order materials with lead time.</strong> Custom cabinets, specialty tile, and certain appliances have long lead times. Order early.</li>
        <li><strong>Be available for questions.</strong> Quick turnaround on decisions keeps the crew moving. Even a 2-day delay on a tile choice cascades into bigger delays.</li>
        <li><strong>Build in a buffer.</strong> Add 15-20% to any timeline estimate. Surprises happen — especially in older NJ homes where you might find outdated wiring, hidden water damage, or asbestos.</li>
        <li><strong>Trust the process.</strong> Rushing leads to mistakes. Quality work takes time, and good contractors plan each phase carefully.</li>
      </ol>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Our Approach to Timelines
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        At La Vaca General Contractors, we provide detailed project schedules before work begins.
        We use project management tools to track progress, keep you updated with regular check-ins,
        and proactively communicate if anything changes.
      </p>
      <p className="text-text-secondary leading-relaxed">
        Want a realistic timeline for your specific project? <Link href="/contact" className="text-primary hover:underline">Contact us for a free consultation</Link>.
        We&apos;ll walk through your space, discuss your goals, and give you an honest assessment of
        how long it will take. Learn more about how we work on our <Link href="/process" className="text-primary hover:underline">process page</Link>.
      </p>
    </>
  ),

  'choosing-materials': (
    <>
      <p className="text-lg text-text-secondary leading-relaxed mb-6">
        Choosing materials for your home renovation can feel overwhelming. There are hundreds of options
        for countertops alone, and every choice affects your budget, timeline, and final result.
        This guide breaks down the most important material decisions and helps you choose what&apos;s right
        for your home and lifestyle.
      </p>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Countertops
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        Your countertop choice is one of the most visible and impactful decisions in a <Link href="/services/kitchen-remodeling" className="text-primary hover:underline">kitchen remodel</Link> or <Link href="/services/bathroom-renovation" className="text-primary hover:underline">bathroom renovation</Link>. Here are the most popular options:
      </p>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">Quartz</h3>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-4">
        <li><strong>Pros:</strong> Non-porous (no sealing needed), consistent patterns, extremely durable, wide color range</li>
        <li><strong>Cons:</strong> Not heat-resistant (use trivets), can look less natural than stone</li>
        <li><strong>Cost:</strong> $50-$150 per square foot installed</li>
        <li><strong>Best for:</strong> Busy kitchens, families with kids, anyone who wants low maintenance</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">Granite</h3>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-4">
        <li><strong>Pros:</strong> Natural beauty, heat-resistant, unique patterns, adds home value</li>
        <li><strong>Cons:</strong> Needs annual sealing, can chip, heavy (may need reinforced cabinets)</li>
        <li><strong>Cost:</strong> $40-$200 per square foot installed</li>
        <li><strong>Best for:</strong> Those who love natural stone character and don&apos;t mind annual maintenance</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">Marble</h3>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-4">
        <li><strong>Pros:</strong> Timeless luxury, beautiful veining, stays cool (great for baking)</li>
        <li><strong>Cons:</strong> Porous (stains easily), scratches, requires regular sealing, etches from acids</li>
        <li><strong>Cost:</strong> $75-$250 per square foot installed</li>
        <li><strong>Best for:</strong> Bathrooms, low-traffic areas, or homeowners who embrace the patina</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">Butcher Block</h3>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-4">
        <li><strong>Pros:</strong> Warm, natural look, can sand out scratches, great for prep areas</li>
        <li><strong>Cons:</strong> Needs regular oiling, not heat-proof, can harbor bacteria if not maintained</li>
        <li><strong>Cost:</strong> $40-$100 per square foot installed</li>
        <li><strong>Best for:</strong> Farmhouse/rustic style, island tops as an accent, prep stations</li>
      </ul>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Flooring
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        Your flooring choice needs to balance aesthetics, durability, and practicality. Here&apos;s what
        works best in NJ homes:
      </p>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">Hardwood</h3>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-4">
        <li><strong>Pros:</strong> Classic beauty, increases home value, can be refinished multiple times, lasts decades</li>
        <li><strong>Cons:</strong> Susceptible to moisture and scratches, higher cost, not ideal for basements</li>
        <li><strong>Cost:</strong> $8-$15 per square foot installed</li>
        <li><strong>Best for:</strong> Living rooms, bedrooms, hallways, dining rooms</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">Luxury Vinyl Plank (LVP)</h3>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-4">
        <li><strong>Pros:</strong> Waterproof, extremely durable, looks like real wood, easy to install, budget-friendly</li>
        <li><strong>Cons:</strong> Can&apos;t be refinished, may off-gas, not as prestigious as real hardwood</li>
        <li><strong>Cost:</strong> $4-$10 per square foot installed</li>
        <li><strong>Best for:</strong> Basements, kitchens, bathrooms, rental properties, high-traffic areas</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">Porcelain/Ceramic Tile</h3>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-4">
        <li><strong>Pros:</strong> Waterproof, highly durable, endless design options, can mimic wood or stone</li>
        <li><strong>Cons:</strong> Cold underfoot (consider heated floors), hard surface, grout needs maintenance</li>
        <li><strong>Cost:</strong> $6-$20 per square foot installed</li>
        <li><strong>Best for:</strong> Bathrooms, entryways, kitchens, mudrooms</li>
      </ul>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Cabinets
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        Kitchen cabinets typically account for 30-40% of a kitchen renovation budget. The three main
        tiers offer different trade-offs:
      </p>
      <ul className="list-disc pl-6 space-y-3 text-text-secondary mb-6">
        <li><strong>Stock cabinets ($100-$300 per linear foot):</strong> Pre-made in standard sizes. Limited styles and finishes. Best for budget-friendly projects. 1-2 week delivery.</li>
        <li><strong>Semi-custom cabinets ($150-$650 per linear foot):</strong> Standard construction with customizable sizes, finishes, and features. The sweet spot for most renovations. 4-8 week lead time.</li>
        <li><strong>Custom cabinets ($500-$1,200+ per linear foot):</strong> Built to your exact specifications. Unlimited options for wood, finish, hardware, and configuration. 8-14 week lead time.</li>
      </ul>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Fixtures and Hardware
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        Don&apos;t overlook fixtures — they&apos;re the jewelry of your renovation. A few guidelines:
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li><strong>Faucets:</strong> Invest in quality. A good faucet lasts 15-20 years. Budget brands may need replacement in 3-5 years.</li>
        <li><strong>Cabinet hardware:</strong> Choose one finish family (brushed gold, matte black, brushed nickel) and carry it throughout.</li>
        <li><strong>Lighting:</strong> Layer your lighting — ambient, task, and accent. Recessed lights, pendant lights, and under-cabinet lights create a complete look.</li>
        <li><strong>Showerheads:</strong> Rain shower heads are popular but pair with a handheld for practicality.</li>
      </ul>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Our Material Selection Process
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        At La Vaca General Contractors, we guide you through material selection with showroom visits,
        sample presentations, and honest recommendations based on your lifestyle and budget. We work
        with trusted NJ suppliers and pass along our trade relationships to get you the best value.
      </p>
      <p className="text-text-secondary leading-relaxed">
        Overwhelmed by choices? <Link href="/contact" className="text-primary hover:underline">Schedule a free consultation</Link> and
        let us help you narrow down the options. We&apos;ll bring samples right to your home so you can
        see everything in your actual space and lighting.
      </p>
    </>
  ),

  'financing-your-renovation': (
    <>
      <p className="text-lg text-text-secondary leading-relaxed mb-6">
        A quality home renovation is a significant investment. The good news is there are several
        ways to finance your project, and understanding your options early helps you plan smarter
        and avoid surprises. Here&apos;s what NJ homeowners need to know about paying for a remodel.
      </p>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Financing Options for Home Renovations
      </h2>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        1. Home Equity Loan (HEL)
      </h3>
      <p className="text-text-secondary leading-relaxed mb-4">
        A home equity loan lets you borrow against the equity you&apos;ve built in your home. You
        receive a lump sum with a fixed interest rate and predictable monthly payments.
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-4">
        <li><strong>Typical rates:</strong> 6-9% (as of 2024-2025)</li>
        <li><strong>Terms:</strong> 5-30 years</li>
        <li><strong>Best for:</strong> Homeowners with significant equity, larger projects ($50K+)</li>
        <li><strong>Tax benefit:</strong> Interest may be tax-deductible if used for home improvements (consult your tax advisor)</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        2. Home Equity Line of Credit (HELOC)
      </h3>
      <p className="text-text-secondary leading-relaxed mb-4">
        A HELOC works like a credit card secured by your home. You have a credit limit and draw
        funds as needed, paying interest only on what you use.
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-4">
        <li><strong>Typical rates:</strong> Variable, currently 7-10%</li>
        <li><strong>Draw period:</strong> Usually 10 years, then 20-year repayment</li>
        <li><strong>Best for:</strong> Phased renovations or projects with uncertain scope</li>
        <li><strong>Watch out for:</strong> Variable rates can increase your payments</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        3. Personal Loan
      </h3>
      <p className="text-text-secondary leading-relaxed mb-4">
        Unsecured personal loans don&apos;t require your home as collateral. They&apos;re faster to get
        and don&apos;t put your home at risk, but rates are typically higher.
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-4">
        <li><strong>Typical rates:</strong> 6-18% depending on credit score</li>
        <li><strong>Terms:</strong> 2-7 years</li>
        <li><strong>Best for:</strong> Smaller projects ($10K-$50K), homeowners with limited equity, or those who want quick funding</li>
        <li><strong>Advantage:</strong> No risk to your home, fast approval (sometimes same day)</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        4. Cash-Out Refinance
      </h3>
      <p className="text-text-secondary leading-relaxed mb-4">
        Replace your existing mortgage with a new, larger one and pocket the difference for your
        renovation. This makes sense when current mortgage rates are close to or lower than your
        existing rate.
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-4">
        <li><strong>Best for:</strong> Large projects when you can improve your mortgage rate</li>
        <li><strong>Watch out for:</strong> Closing costs, extended repayment, and currently high rates may not make this viable</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        5. Contractor Financing / Payment Plans
      </h3>
      <p className="text-text-secondary leading-relaxed mb-4">
        Some contractors (including us) offer structured payment plans tied to project milestones.
        This spreads the cost over the duration of the project without third-party lenders.
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li><strong>Typical structure:</strong> Deposit at signing, payments at milestones (demo complete, rough-in, finish), final payment at completion</li>
        <li><strong>Advantage:</strong> Aligned with project progress, no interest charges</li>
        <li><strong>NJ law:</strong> NJ Consumer Affairs limits deposits to 1/3 of the total contract price</li>
      </ul>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Budgeting Tips for Your Renovation
      </h2>
      <ol className="list-decimal pl-6 space-y-3 text-text-secondary mb-6">
        <li><strong>Set a realistic budget.</strong> Get multiple estimates and understand what quality costs in your area. In Northern NJ, a quality kitchen remodel typically starts at $35K-$50K and goes up from there.</li>
        <li><strong>Keep a 15-20% contingency.</strong> Unexpected issues are common in renovation — old homes may have outdated wiring, hidden water damage, or structural surprises. A contingency fund prevents panic.</li>
        <li><strong>Prioritize where you spend.</strong> Invest most in things that are hard to change later (layout, plumbing, electrical) and save on things you can upgrade later (hardware, accessories, paint).</li>
        <li><strong>Don&apos;t forget the extras.</strong> Budget for permits, temporary living arrangements (for major renovations), dining out during kitchen remodels, storage for furniture, and landscaping restoration.</li>
        <li><strong>Get it in writing.</strong> Your contract should include a detailed scope of work, payment schedule, timeline, and how change orders are handled. In NJ, contractors are required to provide written contracts for projects over $500.</li>
      </ol>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        ROI: What Renovations Pay for Themselves?
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        Not all renovations return equal value. Here&apos;s what typically delivers the best ROI in
        Northern NJ:
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li><strong>Kitchen remodel:</strong> 60-80% ROI (mid-range)</li>
        <li><strong>Bathroom renovation:</strong> 60-70% ROI</li>
        <li><strong>Basement finishing:</strong> 70-75% ROI</li>
        <li><strong>Home addition:</strong> 50-65% ROI (but adds livable square footage)</li>
      </ul>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Plan Your Project Finances
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        Use our <Link href="/resources#financing-calculator" className="text-primary hover:underline">financing calculator</Link> to
        estimate monthly payments based on your project cost. And when you&apos;re ready, <Link href="/contact" className="text-primary hover:underline">contact us
        for a free estimate</Link> — we&apos;ll give you a detailed breakdown so you can plan with confidence.
      </p>
      <p className="text-text-secondary leading-relaxed">
        You can also use our <Link href="/project-calculator" className="text-primary hover:underline">project cost calculator</Link> to
        get a ballpark estimate for your renovation scope before we meet in person.
      </p>
    </>
  ),

  'working-with-contractor': (
    <>
      <p className="text-lg text-text-secondary leading-relaxed mb-6">
        Hiring a contractor is a big decision, and the relationship you build with them directly
        impacts how smoothly your renovation goes. Whether it&apos;s your first renovation or your fifth,
        these tips will help you get the best experience — and the best results.
      </p>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Before Construction Starts
      </h2>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        Verify Credentials
      </h3>
      <p className="text-text-secondary leading-relaxed mb-4">
        In New Jersey, contractors performing home improvement work over $500 must hold an active
        Home Improvement Contractor (HIC) registration. Before signing anything:
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li>Verify their HIC license at the NJ Division of Consumer Affairs</li>
        <li>Confirm they carry liability insurance and workers&apos; comp</li>
        <li>Check reviews on Google, Yelp, and the Better Business Bureau</li>
        <li>Ask for references from recent projects similar to yours</li>
        <li>Make sure they&apos;re bonded (provides financial protection if they fail to complete work)</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        Get a Detailed Contract
      </h3>
      <p className="text-text-secondary leading-relaxed mb-4">
        NJ law requires written contracts for home improvement projects. A good contract should include:
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li>Detailed scope of work (what&apos;s included AND what&apos;s not)</li>
        <li>Total price and payment schedule</li>
        <li>Estimated start and completion dates</li>
        <li>Material specifications (brand, model, color — not just &quot;contractor grade&quot;)</li>
        <li>Change order process and pricing</li>
        <li>Warranty information</li>
        <li>License number and insurance details</li>
        <li>3-day right to cancel (required by NJ law for door-to-door sales)</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        Understand the Payment Structure
      </h3>
      <p className="text-text-secondary leading-relaxed mb-6">
        In NJ, contractors cannot require a deposit exceeding one-third of the total contract price.
        Legitimate payment schedules are tied to project milestones. Be wary of anyone asking for full
        payment upfront or cash-only deals.
      </p>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        During Construction
      </h2>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        What to Expect Day-to-Day
      </h3>
      <p className="text-text-secondary leading-relaxed mb-4">
        Living through a renovation takes patience. Here&apos;s what&apos;s normal:
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li><strong>Noise and dust:</strong> Demolition and construction generate both. A good contractor puts up dust barriers and cleans up daily.</li>
        <li><strong>Work hours:</strong> Most contractors work 7:30 AM - 4:30 PM, Monday through Friday. Weekend work is rare unless you&apos;ve agreed to it.</li>
        <li><strong>Subcontractors:</strong> You&apos;ll see different crews for different trades (electricians, plumbers, tile setters). This is normal — your general contractor coordinates them all.</li>
        <li><strong>Inspections:</strong> The building inspector will visit at various stages. Your contractor schedules these. Inspections may cause brief pauses while waiting for approval to proceed.</li>
        <li><strong>Quiet days:</strong> Some days the house may be quiet — materials are being ordered, permits are being processed, or the next trade is scheduled for the following day. This is normal.</li>
      </ul>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        Communication Best Practices
      </h3>
      <p className="text-text-secondary leading-relaxed mb-4">
        Good communication is the single biggest factor in renovation satisfaction. Here&apos;s how
        to do it right:
      </p>
      <ol className="list-decimal pl-6 space-y-3 text-text-secondary mb-6">
        <li><strong>Establish one point of contact.</strong> Communicate through your project manager or GC, not individual subcontractors. This avoids confusion.</li>
        <li><strong>Use written communication for decisions.</strong> Text or email so there&apos;s a record. &quot;We discussed&quot; is less reliable than &quot;here&apos;s the text where we agreed.&quot;</li>
        <li><strong>Ask for regular updates.</strong> A good contractor will proactively update you. If yours doesn&apos;t, ask for weekly check-ins.</li>
        <li><strong>Bring up concerns early.</strong> If something doesn&apos;t look right, say something immediately. It&apos;s easier (and cheaper) to fix things before the next phase covers them up.</li>
        <li><strong>Avoid scope creep.</strong> &quot;While you&apos;re at it, can you also...&quot; is how budgets balloon. Every addition should go through a written change order with an agreed price.</li>
      </ol>

      <h3 className="text-xl font-semibold text-text-primary mt-8 mb-3">
        Handling Change Orders
      </h3>
      <p className="text-text-secondary leading-relaxed mb-6">
        Changes during construction are almost inevitable. Maybe you discover outdated wiring behind
        a wall, or you decide you want that upgraded tile after all. A professional change order
        process includes: description of the change, cost impact, timeline impact, and written
        approval before work proceeds. Never approve verbal-only changes.
      </p>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        Red Flags to Watch For
      </h2>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li>Contractor asks for more than 1/3 upfront or full payment before completion</li>
        <li>No written contract or vague scope of work</li>
        <li>Can&apos;t provide license number or proof of insurance</li>
        <li>Pressures you to make quick decisions</li>
        <li>Offers a price that seems too good to be true (it usually is)</li>
        <li>No references or unwilling to show past work</li>
        <li>Wants to skip permits (&quot;it&apos;ll save you money&quot;)</li>
        <li>Disappears for days without communication</li>
      </ul>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        After Construction
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        Once your renovation is complete:
      </p>
      <ul className="list-disc pl-6 space-y-2 text-text-secondary mb-6">
        <li><strong>Do a thorough walkthrough.</strong> Create a punch list of any items that need attention. A professional contractor will address these promptly.</li>
        <li><strong>Get all documentation.</strong> Collect warranties, permit sign-offs, material information, and paint colors for your records.</li>
        <li><strong>Understand your warranty.</strong> Know what&apos;s covered and for how long. Most reputable contractors offer 1-2 year workmanship warranties.</li>
        <li><strong>Leave a review.</strong> If you had a good experience, online reviews are the best way to thank your contractor and help other homeowners. Our <Link href="/leave-a-review" className="text-primary hover:underline">review page</Link> makes it easy.</li>
      </ul>

      <h2 className="text-2xl font-bold text-text-primary mt-10 mb-4">
        The La Vaca Difference
      </h2>
      <p className="text-text-secondary leading-relaxed mb-4">
        At La Vaca General Contractors, we prioritize transparent communication, detailed contracts,
        and regular project updates. We use technology to keep you informed with photos, progress
        reports, and easy communication channels. Our process is designed to make your renovation
        as stress-free as possible.
      </p>
      <p className="text-text-secondary leading-relaxed">
        Ready to experience the difference? <Link href="/contact" className="text-primary hover:underline">Contact us for a free consultation</Link>.
        Learn more about our approach on our <Link href="/process" className="text-primary hover:underline">process page</Link>,
        or read what our clients say on our <Link href="/reviews" className="text-primary hover:underline">reviews page</Link>.
      </p>
    </>
  ),
};
