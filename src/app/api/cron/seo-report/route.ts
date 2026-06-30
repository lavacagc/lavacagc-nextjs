/**
 * SEO Autonomy — Phase 1 (Observer): read-only insight report.
 *
 * Reads the trailing 28 days from public.seo_metrics and surfaces:
 *   - refresh_candidates: pages ranking 5–15 with high impressions / low CTR
 *   - winners: pages with conversions in the window (don't break these)
 *   - new_article_candidates: queries with impressions but no dedicated page
 *   - trend: 14d-over-14d clicks delta per page
 *
 * Phase 1 takes NO action — just reports. Phase 2 will read the same signals
 * and enqueue rows in content_actions for human review.
 *
 * Query params:
 *   ?email=1  — also send the weekly digest via Resend (the weekly cron uses this)
 *
 * Auth: Bearer CRON_SECRET (also enforced by middleware on /api/cron/*).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/seo/supabase-rest';
import { buildSeoReport, reportWindow, type SeoMetricRow } from '@/lib/seo/report';
import { sendSeoReportEmail } from '@/lib/notify/sendSeoReportEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const { startDate, endDate } = reportWindow(now);
  const sendEmail = new URL(request.url).searchParams.get('email') === '1';

  try {
    const rows = await supabaseRest<SeoMetricRow[]>(
      'GET',
      `seo_metrics?select=source,url,query,date,impressions,clicks,position,ctr,users,engaged_sessions,conversions&date=gte.${startDate}&date=lte.${endDate}`,
    );

    const report = buildSeoReport(rows ?? [], now);

    let emailed: { status: string; reason?: string; error?: string } | undefined;
    if (sendEmail) {
      const res = await sendSeoReportEmail(report);
      emailed = { status: res.status, reason: res.reason, error: res.error };
    }

    return NextResponse.json({ ok: true, ...report, ...(emailed ? { emailed } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('seo-report failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
