#!/usr/bin/env python3
"""Insert SEO blog posts from seo-blog-posts-batch2.ts into Supabase."""
import os, re, json, urllib.request, urllib.parse

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].strip()
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY", os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")).strip()

def read_ts_posts(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    posts = []
    # Split by each object in the array
    chunks = re.split(r'\n  \{', content)
    
    for chunk in chunks[1:]:  # Skip the first part (before first object)
        def extract(field):
            # Match field: "value" or field: `value`
            m = re.search(rf'{field}:\s*"([^"]*)"', chunk)
            if m:
                return m.group(1)
            m = re.search(rf"{field}:\s*'([^']*)'", chunk)
            if m:
                return m.group(1)
            return ""
        
        def extract_array(field):
            m = re.search(rf'{field}:\s*\[(.*?)\]', chunk, re.DOTALL)
            if m:
                items = re.findall(r'"([^"]*)"', m.group(1))
                return items
            return []
        
        # Extract content (backtick template literal)
        content_match = re.search(r'content:\s*`(.*?)`', chunk, re.DOTALL)
        content_text = content_match.group(1) if content_match else ""
        
        slug = extract("slug")
        if not slug:
            continue
            
        post = {
            "slug": slug,
            "title": extract("title"),
            "excerpt": extract("excerpt"),
            "content": content_text,
            "author": extract("author") or "La Vaca Team",
            "category": extract("category"),
            "meta_title": extract("title"),
            "meta_description": extract("excerpt"),
            "meta_keywords": ", ".join(extract_array("tags")),
            "published": True,
        }
        posts.append(post)
        print(f"Parsed: {post['slug']} ({len(post['content'])} chars)")
    
    return posts

def insert_post(post):
    url = f"{SUPABASE_URL}/rest/v1/blog_posts"
    data = json.dumps(post).encode('utf-8')
    
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('apikey', SUPABASE_KEY)
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', 'return=minimal')
    
    try:
        resp = urllib.request.urlopen(req)
        print(f"  ✅ Inserted: {post['slug']} (HTTP {resp.status})")
        return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if 'duplicate' in body.lower() or '23505' in body:
            print(f"  ⚠️ Already exists: {post['slug']}")
            return True
        print(f"  ❌ Error: {post['slug']} - {e.code} {body[:200]}")
        return False

if __name__ == "__main__":
    filepath = "src/data/seo-blog-posts-batch2.ts"
    posts = read_ts_posts(filepath)
    print(f"\nInserting {len(posts)} posts into Supabase...\n")
    
    success = 0
    for post in posts:
        if insert_post(post):
            success += 1
    
    print(f"\nDone: {success}/{len(posts)} posts inserted successfully")
