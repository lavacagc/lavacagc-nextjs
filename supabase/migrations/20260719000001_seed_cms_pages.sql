-- Seed CMS pages with content from existing hardcoded pages

INSERT INTO cms_pages (slug, title, meta_description, status, page_type, sections, published_at) VALUES

-- Spring Renovation page
('spring-renovation',
 'Spring 2026 Renovation Special',
 'Transform your home this spring with La Vaca General Contractors. Limited-time free consultation for kitchen, bathroom, and basement renovations in Northern NJ. Licensed & insured.',
 'published',
 'campaign',
 '[
   {
     "type": "hero",
     "heading": "Transform Your Home This Spring",
     "subheading": "Book your free consultation this spring and start your renovation project with Northern NJ''s most trusted contractor.",
     "ctaText": "Get Free Consultation",
     "ctaLink": "/contact",
     "backgroundImage": "/images/kitchen-hero.jpg"
   },
   {
     "type": "features",
     "heading": "Why Spring Is the Best Time to Renovate",
     "items": [
       { "icon": "Calendar", "title": "Ideal Weather Conditions", "description": "Moderate temperatures and lower humidity create perfect conditions for construction, painting, and material curing." },
       { "icon": "Clock", "title": "Finish Before Summer", "description": "Start now and enjoy your beautiful new space by the time summer entertaining season arrives." },
       { "icon": "Award", "title": "Flexible Scheduling", "description": "Spring bookings mean more flexible scheduling options before the busy summer construction season fills up." }
     ]
   },
   {
     "type": "before-after",
     "heading": "See the Transformation",
     "items": [
       { "beforeImage": "/images/before-kitchen.jpg", "afterImage": "/images/after-kitchen.jpg", "caption": "Kitchen Remodel — Montclair, NJ" },
       { "beforeImage": "/images/before-bathroom.jpg", "afterImage": "/images/after-bathroom.jpg", "caption": "Bathroom Renovation — Clifton, NJ" }
     ]
   },
   {
     "type": "testimonials",
     "heading": "What Our Clients Say",
     "items": [
       { "quote": "La Vaca completely transformed our kitchen. The attention to detail was incredible, and they finished right on schedule.", "author": "Maria T., Montclair, NJ", "rating": 5 },
       { "quote": "Professional from start to finish. They helped us design the perfect bathroom and the tile work is stunning.", "author": "James R., Clifton, NJ", "rating": 5 }
     ]
   },
   {
     "type": "cta",
     "heading": "Ready to Start Your Spring Renovation?",
     "description": "Call us now or fill out the form for a free, no-obligation consultation.",
     "ctaText": "Get Free Estimate",
     "ctaLink": "/contact",
     "phone": "(201) 212-4917"
   }
 ]'::jsonb,
 now()),

-- Kitchen Remodel landing page
('lp/kitchen-remodel',
 'Kitchen Remodeling in NJ',
 'Transform your kitchen with NJ''s trusted remodeling experts. Custom cabinetry, countertops, and full kitchen renovations. Licensed & insured. Get a free estimate today.',
 'published',
 'landing',
 '[
   {
     "type": "hero",
     "heading": "Your Dream Kitchen Is One Call Away",
     "subheading": "Expert kitchen remodeling in Northern New Jersey. Custom designs, premium materials, and craftsmanship that lasts a lifetime.",
     "ctaText": "Get Free Kitchen Estimate",
     "ctaLink": "/contact",
     "backgroundImage": "/images/kitchen-hero.jpg"
   },
   {
     "type": "features",
     "heading": "Why Homeowners Choose La Vaca GC",
     "items": [
       { "icon": "Award", "title": "Custom Design Expertise", "description": "From layouts to finishes, we work with you to create a kitchen that matches your style and needs perfectly." },
       { "icon": "Shield", "title": "Transparent Pricing", "description": "Detailed written estimates with no hidden fees. You know exactly what you''re paying before we start." },
       { "icon": "Clock", "title": "On-Time Completion", "description": "We respect your schedule. Our team plans meticulously to minimize disruption and finish on time." }
     ]
   },
   {
     "type": "text",
     "heading": "Our Kitchen Remodel Includes",
     "content": "- Custom cabinetry and hardware\n- Countertop installation (granite, quartz, marble)\n- Backsplash tile design and installation\n- Plumbing and electrical upgrades\n- Flooring replacement\n- Appliance installation\n- Lighting design and fixtures\n- Full project management"
   },
   {
     "type": "testimonials",
     "heading": "What Our Clients Say",
     "items": [
       { "quote": "La Vaca completely transformed our kitchen. The attention to detail was incredible, and they finished right on schedule. We couldn''t be happier with the results!", "author": "Maria T., Montclair, NJ", "rating": 5 }
     ]
   },
   {
     "type": "cta",
     "heading": "Ready to Start Your Kitchen Remodel?",
     "description": "Call us now or fill out the form for a free, no-obligation estimate.",
     "ctaText": "Get Free Estimate",
     "ctaLink": "/contact",
     "phone": "(201) 212-4917"
   }
 ]'::jsonb,
 now()),

-- Bathroom Renovation landing page
('lp/bathroom-renovation',
 'Bathroom Renovation in NJ',
 'Upgrade your bathroom with NJ''s trusted renovation experts. Tile, vanities, showers, and full bathroom remodels. Licensed & insured. Free estimates.',
 'published',
 'landing',
 '[
   {
     "type": "hero",
     "heading": "A Beautiful Bathroom Without the Stress",
     "subheading": "Full-service bathroom renovations in Northern New Jersey. From tile work to custom vanities, we handle every detail so you don''t have to.",
     "ctaText": "Get Free Bathroom Estimate",
     "ctaLink": "/contact",
     "backgroundImage": "/images/bathroom-hero.jpg"
   },
   {
     "type": "features",
     "heading": "Why Homeowners Choose La Vaca GC",
     "items": [
       { "icon": "Award", "title": "Expert Tile & Stonework", "description": "Our skilled craftsmen specialize in intricate tile patterns, natural stone, and waterproof installations that last." },
       { "icon": "Shield", "title": "Full-Service Renovation", "description": "Plumbing, electrical, tiling, fixtures — we handle everything in-house. One team, one point of contact." },
       { "icon": "Clock", "title": "Minimal Disruption", "description": "We know you need your bathroom back. Our efficient process keeps timelines tight and your home clean." }
     ]
   },
   {
     "type": "text",
     "heading": "Our Bathroom Renovation Includes",
     "content": "- Custom tile and stonework\n- Walk-in shower conversions\n- Vanity and fixture upgrades\n- Plumbing and electrical work\n- Waterproofing and moisture control\n- Heated flooring options\n- Custom glass enclosures\n- Full project management"
   },
   {
     "type": "testimonials",
     "heading": "What Our Clients Say",
     "items": [
       { "quote": "Professional from start to finish. They helped us design the perfect bathroom and the tile work is stunning.", "author": "James R., Clifton, NJ", "rating": 5 }
     ]
   },
   {
     "type": "cta",
     "heading": "Ready to Start Your Bathroom Renovation?",
     "description": "Call us now or fill out the form for a free, no-obligation estimate.",
     "ctaText": "Get Free Estimate",
     "ctaLink": "/contact",
     "phone": "(201) 212-4917"
   }
 ]'::jsonb,
 now()),

-- Basement Finishing landing page
('lp/basement-finishing',
 'Basement Finishing in NJ',
 'Unlock your basement''s full potential with NJ''s expert finishing contractors. Custom designs, waterproofing, and full buildouts. Licensed & insured. Free estimates.',
 'published',
 'landing',
 '[
   {
     "type": "hero",
     "heading": "Turn Your Basement Into Living Space You''ll Love",
     "subheading": "Professional basement finishing in Northern New Jersey. Add a family room, home office, gym, or entertainment space below your home.",
     "ctaText": "Get Free Basement Estimate",
     "ctaLink": "/contact",
     "backgroundImage": "/images/basement-hero.jpg"
   },
   {
     "type": "features",
     "heading": "Why Homeowners Choose La Vaca GC",
     "items": [
       { "icon": "Award", "title": "Maximize Your Home Value", "description": "A finished basement adds significant square footage and can increase your home''s value by 70% of the investment." },
       { "icon": "Shield", "title": "Waterproofing Included", "description": "Every basement project starts with proper moisture control. We ensure your new space stays dry and comfortable year-round." },
       { "icon": "Clock", "title": "Efficient Build Process", "description": "Our team coordinates framing, electrical, plumbing, HVAC, and finishing in a streamlined process with clear timelines." }
     ]
   },
   {
     "type": "text",
     "heading": "Our Basement Finishing Includes",
     "content": "- Custom room layouts and design\n- Framing and drywall\n- Electrical and lighting\n- Plumbing for bathrooms and wet bars\n- HVAC extension\n- Waterproofing and moisture barriers\n- Flooring installation\n- Full project management"
   },
   {
     "type": "testimonials",
     "heading": "What Our Clients Say",
     "items": [
       { "quote": "They turned our dark, unused basement into a beautiful family room with a home theater. The kids love it!", "author": "David P., Passaic, NJ", "rating": 5 }
     ]
   },
   {
     "type": "cta",
     "heading": "Ready to Finish Your Basement?",
     "description": "Call us now or fill out the form for a free, no-obligation estimate.",
     "ctaText": "Get Free Estimate",
     "ctaLink": "/contact",
     "phone": "(201) 212-4917"
   }
 ]'::jsonb,
 now());
