import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';

/**
 * Admin "Subscribers" data — who the Buy + Remodel users are and how they use
 * the site. Admin-gated by the middleware (/api/admin/* requires a session).
 *
 * Two modes:
 *  - list (default): every subscriber + recent-activity aggregates (view count
 *    in the recent window, top listings, last path), newest activity first.
 *  - drill-down (?subscriber_id=…): that subscriber's recent page-view trail.
 */

export const dynamic = 'force-dynamic';

interface SubscriberRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  zip_codes: string[];
  status: string;
  source: string | null;
  verified_at: string | null;
  last_seen_at: string | null;
  visitor_id: string | null;
  created_at: string | null;
}

interface ActivityRow {
  subscriber_id: string;
  path: string;
  listing_slug: string | null;
  created_at: string;
}

const ACTIVITY_WINDOW = 2000; // recent rows scanned for list aggregates

export async function GET(request: NextRequest) {
  try {
    const subscriberId = request.nextUrl.searchParams.get('subscriber_id');

    // Drill-down: a single subscriber's recent page-view trail.
    if (subscriberId) {
      const trail = await supabaseRest<Array<ActivityRow & { referrer: string | null }>>(
        'GET',
        `subscriber_activity?subscriber_id=eq.${encodeURIComponent(subscriberId)}` +
          `&select=path,listing_slug,referrer,created_at&order=created_at.desc&limit=200`,
      );
      return NextResponse.json({ activity: trail ?? [] });
    }

    // List: subscribers, most-recently-seen first.
    const subscribers = await supabaseRest<SubscriberRow[]>(
      'GET',
      'newsletter_subscribers?select=id,email,first_name,last_name,phone,zip_codes,status,source,verified_at,last_seen_at,visitor_id,created_at' +
        '&order=last_seen_at.desc.nullslast&limit=500',
    );

    // Recent activity window, aggregated per subscriber in-process.
    const activity = await supabaseRest<ActivityRow[]>(
      'GET',
      `subscriber_activity?select=subscriber_id,path,listing_slug,created_at&order=created_at.desc&limit=${ACTIVITY_WINDOW}`,
    );

    const agg = new Map<string, { recentViews: number; lastPath: string | null; listings: Map<string, number> }>();
    for (const a of activity ?? []) {
      const e = agg.get(a.subscriber_id) ?? { recentViews: 0, lastPath: null, listings: new Map() };
      e.recentViews += 1;
      if (e.lastPath === null) e.lastPath = a.path; // first seen = newest (desc order)
      if (a.listing_slug) e.listings.set(a.listing_slug, (e.listings.get(a.listing_slug) ?? 0) + 1);
      agg.set(a.subscriber_id, e);
    }

    const rows = (subscribers ?? []).map((s) => {
      const e = agg.get(s.id);
      const topListings = e
        ? [...e.listings.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([slug, n]) => ({ slug, views: n }))
        : [];
      return {
        ...s,
        recent_views: e?.recentViews ?? 0,
        last_path: e?.lastPath ?? null,
        top_listings: topListings,
      };
    });

    return NextResponse.json({
      subscribers: rows,
      activity_window: ACTIVITY_WINDOW,
      total: rows.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
