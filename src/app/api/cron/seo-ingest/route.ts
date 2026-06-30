/**
 * SEO Autonomy — Phase 1 (Observer): nightly metric ingest.
 *
 * Pulls the trailing N-day window from Google Search Console + GA4 and upserts
 * into public.seo_metrics. Idempotent — safe to re-run for the same window.
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 *
 * Local testing: SEO_INGEST_MODE=fixture bypasses Google credentials and uses
 * canned fixtures so the full pipeline can be exercised offline.
 *
 * Query params:
 *   ?days=N     — window size (default 3, max 30) to backfill any missed runs
 *   ?dryRun=1   — fetch + log row counts but skip the Supabase upsert
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchGscRows } from '@/lib/seo/gsc-client';
import { fetchGa4Rows } from '@/lib/seo/ga4-client';
import { supabaseRest } from '@/lib/seo/supabase-rest';
import { toPagePath } from '@/lib/seo/url';
import { isFixtureMode } from '@/lib/seo/google-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SeoMetricInsert {
  source: 'gsc' | 'ga4';
  url: string;
  query: string | null;
  date: string;
  impressions: number;
  clicks: number;
  position: number | null;
  ctr: number | null;
  users: number;
  engaged_sessions: number;
  conversions: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateWindow(days: number): { startDate: string; endDate: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2); // GSC has ~2-day finalization lag
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

async function chunkedUpsert(rows: SeoMetricInsert[], chunkSize = 500): Promise<number> {
  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    await supabaseRest('POST', 'seo_metrics', slice, {
      onConflict: 'source,url,query,date',
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    total += slice.length;
  }
  return total;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get('days') || '3');
  const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 3, 1), 30);
  const dryRun = url.searchParams.get('dryRun') === '1';

  const { startDate, endDate } = dateWindow(days);

  try {
    const [gscRows, ga4Rows] = await Promise.all([
      fetchGscRows({ startDate, endDate }),
      fetchGa4Rows({ startDate, endDate }),
    ]);

    const inserts: SeoMetricInsert[] = [];
    for (const r of gscRows) {
      inserts.push({
        source: 'gsc',
        url: toPagePath(r.page),
        query: r.query || null,
        date: r.date,
        impressions: r.impressions ?? 0,
        clicks: r.clicks ?? 0,
        position: r.position ?? null,
        ctr: r.ctr ?? null,
        users: 0,
        engaged_sessions: 0,
        conversions: 0,
      });
    }
    for (const r of ga4Rows) {
      inserts.push({
        source: 'ga4',
        url: toPagePath(r.page),
        query: null,
        date: r.date,
        impressions: 0,
        clicks: 0,
        position: null,
        ctr: null,
        users: r.users ?? 0,
        engaged_sessions: r.engaged_sessions ?? 0,
        conversions: r.conversions ?? 0,
      });
    }

    let upserted = 0;
    if (!dryRun && inserts.length > 0) {
      upserted = await chunkedUpsert(inserts);
    }

    return NextResponse.json({
      ok: true,
      mode: isFixtureMode() ? 'fixture' : 'live',
      window: { startDate, endDate, days },
      counts: { gsc: gscRows.length, ga4: ga4Rows.length, upserted },
      dryRun,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('seo-ingest failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
