/**
 * GET /api/admin/cta/report - the CTA Tests leader board.
 *
 * Per button and variant: views, clicks, requests, valid leads, won, click and
 * request rates; per button: the leader (or why there is none) and the sample
 * size. The response carries the valid-lead and leader rules it applied, in
 * `valid_lead_rule` and `leader_rule`. See src/lib/cta/report.ts.
 *
 * Admin auth is enforced by middleware on /api/admin/*. Secret key only.
 */
import { NextResponse } from 'next/server';
import { loadCtaReport } from '@/lib/cta/admin.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(await loadCtaReport(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('cta report failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not load the CTA report' }, { status: 500 });
  }
}
