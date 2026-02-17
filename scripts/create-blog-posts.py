#!/usr/bin/env python3
"""
Create 16 blog posts with AI-generated images for La Vaca GC.
Schedule: Mon + Thu at 10 AM ET, starting Feb 20, 2026.
"""

import json
import os
import sys
import time
import base64
import uuid
import urllib.request
import urllib.error
from datetime import datetime, timedelta

# Config
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]  # anon/publishable key
SUPABASE_SECRET = os.environ.get("SUPABASE_SECRET_KEY", SUPABASE_KEY)  # service role key for writes
GEMINI_KEY = os.environ["GEMINI_API_KEY"]

STYLE_SUFFIX = ", professional photography, luxury home renovation, high-end finishes, bright natural lighting, architectural photography style, photorealistic, 8k quality, interior design magazine"

# Schedule: Mon + Thu starting Feb 20, 2026 (Thu)
def get_schedule_dates():
    """Generate 16 dates: Mon + Thu starting Feb 20, 2026."""
    dates = []
    # Feb 20 is a Thursday
    start = datetime(2026, 2, 20, 10, 0, 0)  # 10 AM
    current = start
    while len(dates) < 16:
        if current.weekday() in (0, 3):  # Mon=0, Thu=3
            dates.append(current.strftime("%Y-%m-%dT15:00:00+00:00"))  # 10 AM ET = 15:00 UTC
        current += timedelta(days=1)
    return dates

DATES = get_schedule_dates()

# All 16 blog posts
POSTS = [
    {
        "title": "How Much Does a Kitchen Remodel Cost in Northern NJ? 2026 Price Breakdown",
        "slug": "kitchen-remodel-cost-northern-nj-2026",
        "category": "Cost Guides",
        "keywords": "kitchen remodel cost NJ, kitchen renovation cost Northern NJ, how much does kitchen remodel cost Essex County",
        "image_prompt": "Stunning modern kitchen mid-renovation in a Northern New Jersey home, white shaker cabinets being installed, quartz countertops, construction tools neatly arranged, natural light from large windows",
        "outline": [
            "Average kitchen remodel costs by scope (minor refresh vs. full gut)",
            "Cost breakdown by component (cabinets, countertops, appliances, labor)",
            "Northern NJ market factors (permits, labor rates, material costs)",
            "Budget-friendly vs. mid-range vs. luxury examples",
            "La Vaca's transparent pricing approach"
        ],
        "links": ["/services/kitchen-remodeling", "/locations/montclair", "/locations/west-orange"]
    },
    {
        "title": "Bathroom Renovation in Montclair NJ: What Homeowners Need to Know",
        "slug": "bathroom-renovation-montclair-nj-guide",
        "category": "Location Guides",
        "keywords": "bathroom renovation Montclair NJ, Montclair bathroom remodel, bathroom contractor Montclair",
        "image_prompt": "Elegant spa-like bathroom renovation in a classic Montclair New Jersey colonial home, freestanding soaking tub, marble tile floor, brass fixtures, window with natural light",
        "outline": [
            "Why Montclair homes have unique bathroom renovation needs (older homes, period-specific styles)",
            "Popular bathroom styles in Montclair (vintage-meets-modern, spa-like retreats)",
            "Permit requirements and local regulations",
            "Average timeline and cost for Montclair bathroom projects",
            "Featured before/after case study"
        ],
        "links": ["/services/bathroom-renovation", "/locations/montclair"]
    },
    {
        "title": "Basement Finishing in Essex County: Complete 2026 Guide",
        "slug": "basement-finishing-essex-county-nj-2026",
        "category": "Cost Guides",
        "keywords": "basement finishing Essex County, finished basement cost NJ, basement remodeling Essex County NJ",
        "image_prompt": "Beautifully finished basement in an Essex County New Jersey home, open living area with recessed lighting, luxury vinyl plank flooring, modern entertainment setup, warm neutral tones",
        "outline": [
            "Why Essex County basements are ideal for finishing (home values, space needs)",
            "Common uses: home office, rec room, in-law suite, gym",
            "Waterproofing and moisture control (critical for NJ basements)",
            "Egress window requirements and permits",
            "Cost breakdown and ROI for Essex County homeowners"
        ],
        "links": ["/services/basement-finishing", "/locations/west-orange", "/locations/livingston"]
    },
    {
        "title": "Spring 2026 Home Renovation Checklist for NJ Homeowners",
        "slug": "spring-2026-home-renovation-checklist-nj",
        "category": "Seasonal Tips",
        "keywords": "spring home renovation NJ, best time to remodel kitchen NJ, spring home improvement checklist",
        "image_prompt": "Beautiful Northern New Jersey suburban home in springtime, blooming cherry blossoms and green lawn, contractor's truck in driveway, home with visible renovation scaffolding on exterior, bright sunny day",
        "outline": [
            "Why spring is ideal for renovations in NJ (weather, contractor availability)",
            "Top 5 spring renovation projects (kitchen, bathroom, deck, exterior)",
            "How to prepare your home for a spring remodel",
            "Scheduling tips: book early for summer completion",
            "Spring-specific considerations (outdoor access, ventilation)"
        ],
        "links": ["/services/kitchen-remodeling", "/services/deck-construction"]
    },
    {
        "title": "Home Remodeling in West Orange NJ: Your Complete Neighborhood Guide",
        "slug": "home-remodeling-west-orange-nj-guide",
        "category": "Location Guides",
        "keywords": "home remodeling West Orange NJ, West Orange general contractor, renovation contractor West Orange",
        "image_prompt": "Charming colonial home in West Orange New Jersey undergoing renovation, classic architectural details, professional contractors working on front porch, tree-lined residential street, golden hour lighting",
        "outline": [
            "West Orange housing stock overview (Colonials, Tudors, ranch homes)",
            "Most popular renovation projects in West Orange",
            "Local permit process and building department info",
            "Property value impact: which renovations add most value",
            "Why La Vaca knows West Orange homes inside-out"
        ],
        "links": ["/locations/west-orange", "/services/whole-home-renovation", "/services/kitchen-remodeling"]
    },
    {
        "title": "How to Choose a General Contractor in Northern NJ: 10 Questions to Ask",
        "slug": "choose-general-contractor-northern-nj-questions",
        "category": "How-To Guides",
        "keywords": "how to choose general contractor NJ, best contractor Northern NJ, licensed contractor Essex County",
        "image_prompt": "Professional contractor reviewing blueprints with homeowner at a kitchen table in a Northern NJ home, plans spread out, contractor in clean polo shirt, bright well-lit room, collaborative consultation scene from behind",
        "outline": [
            "Red flags: unlicensed contractors, no insurance, vague estimates",
            "10 essential questions (license, insurance, references, timeline, payment)",
            "What to look for in a contract",
            "La Vaca's licensing and credentials",
            "Local contractor vs. out-of-area firms"
        ],
        "links": ["/services/general-contracting", "/locations/montclair", "/locations/maplewood"]
    },
    {
        "title": "Bathroom Remodel Cost in NJ: 2026 Price Guide by Scope",
        "slug": "bathroom-remodel-cost-nj-2026-price-guide",
        "category": "Cost Guides",
        "keywords": "bathroom remodel cost NJ, how much bathroom renovation NJ, bathroom remodel price Essex County",
        "image_prompt": "Luxurious master bathroom renovation in progress in New Jersey, large walk-in shower with glass enclosure and premium tile, double vanity with marble countertop, chrome fixtures, professional installation",
        "outline": [
            "Small bathroom (5x8) vs. master bath remodel costs",
            "Cost per square foot in Northern NJ",
            "Line-item breakdown: tile, fixtures, vanity, labor",
            "Budget vs. mid-range vs. luxury material options",
            "Hidden costs: structural issues, plumbing upgrades"
        ],
        "links": ["/services/bathroom-renovation", "/locations/livingston"]
    },
    {
        "title": "Kitchen Renovation in Livingston NJ: Design Trends and Cost Insights",
        "slug": "kitchen-renovation-livingston-nj-design-trends",
        "category": "Location Guides",
        "keywords": "kitchen renovation Livingston NJ, Livingston kitchen remodel, kitchen contractor Livingston",
        "image_prompt": "Stunning open-concept kitchen renovation in Livingston New Jersey, white shaker cabinets, large quartz waterfall island, pendant lighting, hardwood floors, family-friendly layout with breakfast nook",
        "outline": [
            "Livingston homeowner preferences (open-concept, family-friendly kitchens)",
            "Popular design trends: white cabinets, quartz countertops, statement islands",
            "Before/after project showcase (real La Vaca project)",
            "Timeline and budget expectations for Livingston kitchens",
            "Working with La Vaca in Livingston"
        ],
        "links": ["/locations/livingston", "/services/kitchen-remodeling"]
    },
    {
        "title": "Do I Need a Permit for My Home Renovation in Essex County?",
        "slug": "building-permit-home-renovation-essex-county-nj",
        "category": "How-To Guides",
        "keywords": "building permit Essex County NJ, renovation permit Northern NJ, do I need permit kitchen remodel NJ",
        "image_prompt": "Close-up of building permits and architectural blueprints on a desk, Essex County NJ municipal building visible through window, official stamps and documents, professional organized workspace",
        "outline": [
            "Which projects require permits (structural, plumbing, electrical)",
            "Projects that typically don't need permits (cosmetic updates)",
            "How to apply for permits in Essex County towns",
            "Why working with a licensed contractor matters (permit expertise)",
            "Consequences of unpermitted work (insurance, resale issues)"
        ],
        "links": ["/services/general-contracting", "/locations/montclair", "/locations/west-orange"]
    },
    {
        "title": "Top 5 Summer Home Improvement Projects for NJ Homeowners",
        "slug": "summer-home-improvement-projects-nj-2026",
        "category": "Seasonal Tips",
        "keywords": "summer home improvement NJ, outdoor renovation projects NJ, deck building Northern NJ",
        "image_prompt": "Beautiful new composite deck with outdoor seating area being built at a Northern New Jersey suburban home in summer, lush green backyard, professional deck construction in progress, warm afternoon light",
        "outline": [
            "Deck construction and outdoor living spaces",
            "Exterior painting and siding",
            "Kitchen remodels (schedule for early summer)",
            "Basement finishing (work indoors during heat)",
            "Bathroom upgrades (guest bath before holiday season)"
        ],
        "links": ["/services/deck-construction", "/services/kitchen-remodeling"]
    },
    {
        "title": "Home Renovation in Maplewood NJ: What Makes This Town Unique",
        "slug": "home-renovation-maplewood-nj-unique-guide",
        "category": "Location Guides",
        "keywords": "home renovation Maplewood NJ, Maplewood contractor, remodeling Maplewood NJ",
        "image_prompt": "Beautiful Victorian-era home in Maplewood New Jersey being carefully renovated, craftsman details preserved, new windows being installed, charming tree-lined street, professional renovation crew working respectfully",
        "outline": [
            "Maplewood's diverse home styles (Victorians, Craftsman, mid-century)",
            "Preserving historic character while modernizing",
            "Popular renovation projects in Maplewood neighborhoods",
            "Local building codes and historic district considerations",
            "La Vaca's experience with Maplewood homes"
        ],
        "links": ["/locations/maplewood", "/services/whole-home-renovation", "/services/kitchen-remodeling"]
    },
    {
        "title": "How Long Does a Kitchen Remodel Take in Northern NJ?",
        "slug": "kitchen-remodel-timeline-northern-nj",
        "category": "How-To Guides",
        "keywords": "kitchen remodel timeline NJ, how long kitchen renovation, kitchen remodel schedule Northern NJ",
        "image_prompt": "Professional kitchen renovation in progress showing multiple phases, demolition area transitioning to newly tiled backsplash, timeline concept, Northern NJ home, organized construction site",
        "outline": [
            "Typical timeline by scope (minor refresh: 2-3 weeks, full remodel: 6-10 weeks)",
            "Phase-by-phase breakdown (demo, rough-in, install, finish)",
            "Factors that extend timelines (permits, custom orders, structural surprises)",
            "How to minimize disruption to your daily life",
            "La Vaca's project management approach"
        ],
        "links": ["/services/kitchen-remodeling", "/locations/montclair", "/services/general-contracting"]
    },
    {
        "title": "Basement Waterproofing in NJ: Must-Do Before Finishing Your Space",
        "slug": "basement-waterproofing-nj-before-finishing",
        "category": "How-To Guides",
        "keywords": "basement waterproofing NJ, waterproof basement before finishing, basement moisture control Essex County",
        "image_prompt": "Professional basement waterproofing installation in a New Jersey home, French drain system being installed along foundation walls, sump pump visible, concrete floor, professional lighting showing the work",
        "outline": [
            "Why NJ basements are prone to moisture (water table, clay soil)",
            "Signs your basement needs waterproofing first",
            "Interior vs. exterior waterproofing solutions",
            "Sump pumps, French drains, vapor barriers",
            "Cost and ROI of proper waterproofing"
        ],
        "links": ["/services/basement-finishing", "/locations/west-orange"]
    },
    {
        "title": "Luxury Kitchen Remodels in Short Hills NJ: Design and Investment Guide",
        "slug": "luxury-kitchen-remodel-short-hills-nj",
        "category": "Location Guides",
        "keywords": "luxury kitchen remodel Short Hills, high-end kitchen NJ, Short Hills kitchen renovation",
        "image_prompt": "Ultra-luxury kitchen in a Short Hills New Jersey estate, custom walnut cabinetry, marble waterfall island, professional-grade Wolf range and Sub-Zero refrigerator, statement pendant chandelier, floor-to-ceiling windows",
        "outline": [
            "Short Hills homeowner expectations (high-end finishes, chef-quality)",
            "Premium materials: marble countertops, custom cabinetry, designer appliances",
            "Smart home integration and luxury features",
            "Investment range for luxury kitchens in Short Hills",
            "Showcasing La Vaca's high-end portfolio"
        ],
        "links": ["/locations/short-hills", "/services/kitchen-remodeling"]
    },
    {
        "title": "Fall Home Renovation Guide for Northern NJ: Planning for Success",
        "slug": "fall-home-renovation-guide-northern-nj",
        "category": "Seasonal Tips",
        "keywords": "fall home renovation NJ, best time remodel NJ, autumn home improvement Northern NJ",
        "image_prompt": "Gorgeous Northern New Jersey home surrounded by fall foliage with vibrant orange and red leaves, renovation work visible on the exterior, new siding installation, crisp autumn day with blue sky",
        "outline": [
            "Why fall is a strategic time to renovate (contractor availability, pre-holiday completion)",
            "Interior projects ideal for fall (kitchen, bathroom, basement)",
            "Planning winter-ready renovations (insulation, windows, HVAC)",
            "Booking your project: lead times and scheduling",
            "Holiday-ready renovations (finish before Thanksgiving)"
        ],
        "links": ["/services/kitchen-remodeling", "/services/bathroom-renovation", "/services/basement-finishing"]
    },
    {
        "title": "Home Renovation ROI in Essex County: Which Projects Add the Most Value?",
        "slug": "home-renovation-roi-essex-county-nj-value",
        "category": "Cost Guides",
        "keywords": "home renovation ROI NJ, which renovations add most value NJ, Essex County home value increase",
        "image_prompt": "Split view showing before and after of a home renovation in Essex County NJ, left side showing dated kitchen, right side showing modern luxury kitchen, dramatic transformation, real estate value concept",
        "outline": [
            "Kitchen remodel ROI (typically 60-80% in Essex County)",
            "Bathroom renovation returns",
            "Basement finishing value-add",
            "Curb appeal projects (doors, siding, landscaping)",
            "Data-backed insights for Northern NJ market",
            "When to renovate for resale vs. personal enjoyment"
        ],
        "links": ["/services/kitchen-remodeling", "/services/bathroom-renovation", "/locations/livingston", "/locations/short-hills"]
    },
]


def generate_content(post):
    """Generate 1000+ word blog post content using Gemini."""
    internal_links_text = "\n".join([f"- [{link}](https://www.lavacagc.com{link})" for link in post["links"]])
    outline_text = "\n".join([f"- {item}" for item in post["outline"]])
    
    prompt = f"""Write a comprehensive, SEO-optimized blog post for a New Jersey general contracting company called La Vaca General Contractors (lavacagc.com). 

Title: {post["title"]}
Target Keywords: {post["keywords"]}
Category: {post["category"]}

Outline to cover:
{outline_text}

Requirements:
- Write 1000-1500 words of high-quality, informative content
- Write in a friendly, authoritative tone — like a knowledgeable neighbor who happens to be a contractor
- Naturally incorporate the target keywords throughout (not stuffed)
- Include specific NJ-relevant details (towns, costs, regulations)
- Use markdown formatting with ## headers for sections
- Include practical, actionable advice homeowners can use
- Mention La Vaca General Contractors naturally 2-3 times (not salesy)
- Reference Northern NJ / Essex County / Bergen County where relevant
- Include realistic cost ranges for the NJ market
- End with a call-to-action suggesting readers contact La Vaca for a free estimate
- Do NOT include the title as an H1 (it's handled by the page template)
- Do NOT include any frontmatter or metadata
- Include these internal links naturally in the content:
{internal_links_text}

Write the blog post content now in markdown:"""

    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 4096
        }
    })

    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_KEY}",
        data=body.encode(),
        headers={"Content-Type": "application/json"}
    )
    
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    # Strip any markdown code fences
    if text.startswith("```markdown"):
        text = text[len("```markdown"):].strip()
    if text.startswith("```"):
        text = text[3:].strip()
    if text.endswith("```"):
        text = text[:-3].strip()
    return text


def generate_image(prompt):
    """Generate a blog featured image using Gemini 3 Pro Image."""
    enhanced_prompt = f"{prompt}{STYLE_SUFFIX}"
    
    body = json.dumps({
        "contents": [{"parts": [{"text": enhanced_prompt}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"aspectRatio": "16:9"}
        }
    })

    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key={GEMINI_KEY}",
        data=body.encode(),
        headers={"Content-Type": "application/json"}
    )
    
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    
    image_part = None
    for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if "inlineData" in part:
            image_part = part
            break
    
    if not image_part:
        raise Exception("No image data in response")
    
    return base64.b64decode(image_part["inlineData"]["data"]), image_part["inlineData"].get("mimeType", "image/png")


def upload_to_supabase_storage(image_bytes, mime_type):
    """Upload image to Supabase Storage blog-images bucket."""
    ext = "png" if "png" in mime_type else "jpg"
    filename = f"{uuid.uuid4().hex[:12]}.{ext}"
    
    url = f"{SUPABASE_URL}/storage/v1/object/blog-images/{filename}"
    req = urllib.request.Request(
        url,
        data=image_bytes,
        headers={
            "Authorization": f"Bearer {SUPABASE_SECRET}",
            "apikey": SUPABASE_SECRET,
            "Content-Type": mime_type,
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"     Upload error detail: {body[:300]}")
        raise
    
    # Return public URL
    return f"{SUPABASE_URL}/storage/v1/object/public/blog-images/{filename}"


def insert_blog_post(post_data):
    """Insert blog post into Supabase using service role key."""
    url = f"{SUPABASE_URL}/rest/v1/blog_posts"
    body = json.dumps(post_data)
    
    req = urllib.request.Request(
        url,
        data=body.encode(),
        headers={
            "Authorization": f"Bearer {SUPABASE_SECRET}",
            "apikey": SUPABASE_SECRET,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"     Insert error detail: {body[:300]}")
        raise


def main():
    start_idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    end_idx = int(sys.argv[2]) if len(sys.argv) > 2 else len(POSTS)
    
    for i in range(start_idx, end_idx):
        post = POSTS[i]
        date = DATES[i]
        print(f"\n{'='*60}")
        print(f"[{i+1}/16] {post['title']}")
        print(f"  Scheduled: {date}")
        print(f"{'='*60}")
        
        # Step 1: Generate content
        print("  📝 Generating content...")
        try:
            content = generate_content(post)
            word_count = len(content.split())
            print(f"  ✅ Content: {word_count} words")
        except Exception as e:
            print(f"  ❌ Content generation failed: {e}")
            continue
        
        # Step 2: Generate image
        print("  🖼 Generating image...")
        try:
            image_bytes, mime_type = generate_image(post["image_prompt"])
            print(f"  ✅ Image: {len(image_bytes)//1024}KB")
        except Exception as e:
            print(f"  ⚠️ Image generation failed: {e}")
            image_bytes = None
        
        # Step 3: Upload image
        image_url = ""
        if image_bytes:
            print("  ☁️ Uploading image...")
            try:
                image_url = upload_to_supabase_storage(image_bytes, mime_type)
                print(f"  ✅ Uploaded: {image_url[-30:]}")
            except Exception as e:
                print(f"  ⚠️ Upload failed: {e}")
        
        # Step 4: Generate excerpt
        excerpt = content[:300].rsplit(".", 1)[0] + "." if len(content) > 300 else content
        # Clean excerpt of markdown
        excerpt = excerpt.replace("#", "").replace("**", "").replace("*", "").strip()
        if len(excerpt) > 250:
            excerpt = excerpt[:250].rsplit(" ", 1)[0] + "..."
        
        # Step 5: Insert into DB
        print("  💾 Inserting into database...")
        try:
            post_data = {
                "title": post["title"],
                "slug": post["slug"],
                "excerpt": excerpt,
                "content": content,
                "author": "Alex T.",
                "category": post["category"],
                "featured_image": image_url,
                "meta_title": post["title"],
                "meta_description": excerpt,
                "meta_keywords": post["keywords"],
                "published": False,  # Start as draft, cron publishes
                "scheduled_publish_at": date,
                "suggested_image_prompt": post["image_prompt"]
            }
            insert_blog_post(post_data)
            print(f"  ✅ Inserted as draft (scheduled: {date[:10]})")
        except Exception as e:
            print(f"  ❌ DB insert failed: {e}")
            # Try to read error body
            if hasattr(e, 'read'):
                print(f"     Detail: {e.read().decode()[:200]}")
            continue
        
        # Rate limiting for Gemini
        if i < end_idx - 1:
            print("  ⏳ Rate limit pause (5s)...")
            time.sleep(5)
    
    print(f"\n{'='*60}")
    print("🎉 Done!")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
