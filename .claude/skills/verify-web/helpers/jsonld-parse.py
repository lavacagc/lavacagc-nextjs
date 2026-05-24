#!/usr/bin/env python3
"""
JSON-LD entity-merge parser for the Lavaca site.

Schema.org allows multiple <script type="application/ld+json"> blocks on a
page that share the same @id — Google's rich-results parser merges them
into a single entity. A naive "count aggregateRating blocks" check
double-counts when partial nodes share an @id, and misses floating
duplicates that have no @id. This script does the entity-merge correctly.

Usage:
    python3 jsonld-parse.py <url>           # full report
    python3 jsonld-parse.py <url> --strict  # exit non-zero if not exactly 1 entity has aggregateRating

Both forms also flag "floating" business entities (no @id, type LocalBusiness
or subtype) because those bypass merge and always count as duplicates.

Example:
    python3 jsonld-parse.py https://www.lavacagc.com/projects/some-slug --strict
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request

UA = (
    "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
BUSINESS_TYPES = {
    "LocalBusiness",
    "GeneralContractor",
    "HomeAndConstructionBusiness",
    "Organization",
}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req).read().decode("utf-8", errors="ignore")


def extract_scripts(html: str) -> list[dict]:
    blobs = re.findall(
        r'<script type="application/ld\+json"[^>]*>(.*?)</script>',
        html,
        re.DOTALL,
    )
    out = []
    for blob in blobs:
        try:
            out.append(json.loads(blob))
        except json.JSONDecodeError as e:
            print(f"  WARN: failed to parse one JSON-LD block: {e}", file=sys.stderr)
    return out


def assess(url: str) -> dict:
    scripts = extract_scripts(fetch(url))
    by_id: dict[str, dict] = {}
    floating: list[tuple[str, bool]] = []
    has_webpage_datemod = False

    for d in scripts:
        ident = d.get("@id")
        t = d.get("@type", "?")
        has_rating = "aggregateRating" in d
        prov = d.get("provider")
        if isinstance(prov, dict) and "aggregateRating" in prov:
            has_rating = True
        if t == "WebPage" and "dateModified" in d:
            has_webpage_datemod = True

        if ident:
            entry = by_id.setdefault(ident, {"types": set(), "has_rating": False})
            entry["types"].add(t)
            if has_rating:
                entry["has_rating"] = True
        elif t in BUSINESS_TYPES:
            floating.append((t, has_rating))

    entities_with_rating = sum(
        1 for info in by_id.values() if info["has_rating"]
    ) + sum(1 for _, r in floating if r)

    return {
        "url": url,
        "script_count": len(scripts),
        "merged_entities": {
            k: {"types": sorted(v["types"]), "has_rating": v["has_rating"]}
            for k, v in by_id.items()
        },
        "floating_business_entities": floating,
        "distinct_entities_with_rating": entities_with_rating,
        "webpage_has_datemod": has_webpage_datemod,
    }


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    url = sys.argv[1]
    strict = "--strict" in sys.argv[2:]

    report = assess(url)

    print(f"URL: {report['url']}")
    print(f"  scripts: {report['script_count']}")
    print(f"  merged entities ({len(report['merged_entities'])}):")
    for ident, info in report["merged_entities"].items():
        marker = "*" if info["has_rating"] else " "
        print(f"    {marker} {ident}  types={info['types']}")
    if report["floating_business_entities"]:
        print(f"  floating business entities (no @id):")
        for t, r in report["floating_business_entities"]:
            print(f"    ! {t}  has_rating={r}")
    print(f"  distinct entities w/ aggregateRating: {report['distinct_entities_with_rating']}")
    print(f"  WebPage has dateModified: {report['webpage_has_datemod']}")

    if strict:
        ok = report["distinct_entities_with_rating"] == 1 and not report["floating_business_entities"]
        print(f"\n{'PASS' if ok else 'FAIL'} (strict mode)")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
