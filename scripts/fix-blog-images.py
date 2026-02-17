#!/usr/bin/env python3
"""
Generate and upload missing featured images for existing blog posts.
Also clean up duplicates.
"""

import json
import os
import sys
import time
import base64
import uuid
import urllib.request
import urllib.error

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SECRET = os.environ["SUPABASE_SECRET_KEY"]
GEMINI_KEY = os.environ["GEMINI_API_KEY"]

STYLE_SUFFIX = ", professional photography, luxury home renovation, high-end finishes, bright natural lighting, architectural photography style, photorealistic, 8k quality, interior design magazine"

# Image prompts keyed by slug pattern
IMAGE_PROMPTS = {
    "basement-finishing-essex-county": "Beautifully finished basement in an Essex County New Jersey home, open living area with recessed lighting, luxury vinyl plank flooring, modern entertainment setup, warm neutral tones",
    "spring-20": "Beautiful Northern New Jersey suburban home in springtime, blooming cherry blossoms and green lawn, contractor truck in driveway, home with renovation scaffolding, bright sunny day",
    "home-remodeling-west-orange": "Charming colonial home in West Orange New Jersey undergoing renovation, classic architectural details, professional contractors working on front porch, tree-lined street, golden hour",
    "how-to-choose-general-contractor": "Professional contractor reviewing blueprints with homeowner at kitchen table in Northern NJ home, plans spread out, bright well-lit room, collaborative consultation from behind",
    "bathroom-remodel-cost-nj": "Luxurious master bathroom renovation in progress in New Jersey, large walk-in shower with glass enclosure, double vanity with marble countertop, chrome fixtures",
    "kitchen-renovation-livingston": "Stunning open-concept kitchen renovation in Livingston New Jersey, white shaker cabinets, large quartz waterfall island, pendant lighting, hardwood floors, family-friendly layout",
    "building-permit": "Close-up of building permits and architectural blueprints on desk, official stamps and documents, professional organized workspace, warm office lighting",
    "summer-home-improvement": "Beautiful new composite deck with outdoor seating being built at Northern New Jersey suburban home in summer, lush green backyard, warm afternoon light",
    "home-renovation-maplewood": "Beautiful Victorian-era home in Maplewood New Jersey being carefully renovated, craftsman details preserved, new windows being installed, charming tree-lined street",
    "how-long-kitchen-remodel": "Professional kitchen renovation in progress showing multiple phases, demolition area transitioning to newly tiled backsplash, timeline concept, organized construction site",
    "basement-waterproofing": "Professional basement waterproofing installation in New Jersey home, French drain system along foundation walls, sump pump visible, concrete floor, professional lighting",
    "luxury-kitchen-remodel": "Ultra-luxury kitchen in Short Hills New Jersey estate, custom walnut cabinetry, marble waterfall island, professional-grade Wolf range, statement pendant chandelier, floor-to-ceiling windows",
    "fall-home-renovation": "Gorgeous Northern New Jersey home surrounded by fall foliage with vibrant orange and red leaves, renovation work on exterior, new siding installation, crisp autumn day",
    "home-renovation-roi": "Split view before and after home renovation in Essex County NJ, left side dated kitchen, right side modern luxury kitchen, dramatic transformation"
}


def get_image_prompt(slug):
    """Match slug to image prompt."""
    for pattern, prompt in IMAGE_PROMPTS.items():
        if pattern in slug:
            return prompt
    return f"Professional home renovation photography in Northern New Jersey, high-end remodeling project"


def generate_image(prompt):
    """Generate image using Gemini 3 Pro Image."""
    enhanced = f"{prompt}{STYLE_SUFFIX}"
    body = json.dumps({
        "contents": [{"parts": [{"text": enhanced}]}],
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
    
    for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
        if "inlineData" in part:
            return base64.b64decode(part["inlineData"]["data"]), part["inlineData"].get("mimeType", "image/png")
    raise Exception("No image in response")


def upload_image(image_bytes, mime_type):
    """Upload to Supabase Storage."""
    ext = "png" if "png" in mime_type else "jpg"
    filename = f"{uuid.uuid4().hex[:12]}.{ext}"
    url = f"{SUPABASE_URL}/storage/v1/object/blog-images/{filename}"
    req = urllib.request.Request(url, data=image_bytes, headers={
        "Authorization": f"Bearer {SUPABASE_SECRET}",
        "apikey": SUPABASE_SECRET,
        "Content-Type": mime_type,
    }, method="POST")
    with urllib.request.urlopen(req) as resp:
        resp.read()
    return f"{SUPABASE_URL}/storage/v1/object/public/blog-images/{filename}"


def update_post(post_id, updates):
    """Update a blog post."""
    url = f"{SUPABASE_URL}/rest/v1/blog_posts?id=eq.{post_id}"
    body = json.dumps(updates)
    req = urllib.request.Request(url, data=body.encode(), headers={
        "Authorization": f"Bearer {SUPABASE_SECRET}",
        "apikey": SUPABASE_SECRET,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        resp.read()


def delete_post(post_id):
    """Delete a blog post."""
    url = f"{SUPABASE_URL}/rest/v1/blog_posts?id=eq.{post_id}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {SUPABASE_SECRET}",
        "apikey": SUPABASE_SECRET,
    }, method="DELETE")
    with urllib.request.urlopen(req) as resp:
        resp.read()


def main():
    # Get all posts missing images
    url = f"{SUPABASE_URL}/rest/v1/blog_posts?select=id,title,slug,featured_image,scheduled_publish_at&order=scheduled_publish_at.asc"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {SUPABASE_SECRET}",
        "apikey": SUPABASE_SECRET,
    })
    with urllib.request.urlopen(req) as resp:
        all_posts = json.loads(resp.read())
    
    # Find duplicates (same title, keep the one with image or newer)
    seen_titles = {}
    duplicates = []
    for p in all_posts:
        title_key = p["title"].lower().strip()
        if title_key in seen_titles:
            # Keep the one with an image, or the first one
            existing = seen_titles[title_key]
            if p.get("featured_image") and not existing.get("featured_image"):
                duplicates.append(existing["id"])
                seen_titles[title_key] = p
            else:
                duplicates.append(p["id"])
        else:
            seen_titles[title_key] = p
    
    if duplicates:
        print(f"🗑 Removing {len(duplicates)} duplicate post(s)...")
        for dup_id in duplicates:
            dup_title = next(p["title"] for p in all_posts if p["id"] == dup_id)
            print(f"   Deleting: {dup_title[:60]}")
            delete_post(dup_id)
        print()
    
    # Find posts missing images (excluding deleted duplicates)
    missing = [p for p in all_posts if not p.get("featured_image") and p["id"] not in duplicates]
    
    if not missing:
        print("✅ All posts have images!")
        return
    
    print(f"📸 {len(missing)} posts need images\n")
    
    for i, post in enumerate(missing):
        print(f"[{i+1}/{len(missing)}] {post['title'][:60]}")
        prompt = get_image_prompt(post["slug"])
        
        print(f"  🖼 Generating image...")
        try:
            img_bytes, mime = generate_image(prompt)
            print(f"  ✅ Image: {len(img_bytes)//1024}KB")
        except Exception as e:
            print(f"  ❌ Image failed: {e}")
            continue
        
        print(f"  ☁️ Uploading...")
        try:
            img_url = upload_image(img_bytes, mime)
            print(f"  ✅ Uploaded")
        except Exception as e:
            print(f"  ❌ Upload failed: {e}")
            continue
        
        print(f"  💾 Updating post...")
        try:
            update_post(post["id"], {"featured_image": img_url})
            print(f"  ✅ Updated!")
        except Exception as e:
            print(f"  ❌ Update failed: {e}")
        
        if i < len(missing) - 1:
            print(f"  ⏳ Rate limit (5s)...")
            time.sleep(5)
    
    print(f"\n🎉 Done!")


if __name__ == "__main__":
    main()
