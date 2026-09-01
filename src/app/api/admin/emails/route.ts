import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import type { EmailCategory } from '@/lib/notify/sendEmail';

/**
 * GET /api/admin/emails?category=&status=&q=&limit=
 *
 * The universal email audit list — every email the app has sent (via
 * sendTrackedEmail → public.email_log). Returns light rows (no html/text) for
 * the admin list view, newest first. The full body is fetched per-row from
 * /api/admin/emails/[id].
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */

export const dynamic = 'force-dynamic';

interface EmailListRow {
  id: string;
  category: string;
  to_email: string;
  to_name: string | null;
  from_email: string;
  subject: string;
  status: string;
  resend_message_id: string | null;
  sent_by: string | null;
  delivered_at: string | null;
  first_opened_at: string | null;
  open_count: number;
  first_clicked_at: string | null;
  click_count: number;
  bounced_at: string | null;
  created_at: string;
  sent_at: string | null;
}

// Whitelist the values we let flow into a PostgREST eq filter. A `Record` over
// the `EmailCategory` union (same trick as the client page) so the compiler
// enforces sync: this list started as a bare array and drifted six categories
// behind, silently returning the UNfiltered log for the missing ones.
const FILTERABLE: Record<EmailCategory, true> = {
  verification: true,
  welcome: true,
  estimate: true,
  lead_followup: true,
  lead_notification: true,
  home_care_newsletter: true,
  buy_remodel: true,
  seo_report: true,
  staged_draft: true,
  rollback_digest: true,
  form_error: true,
  feedback_request: true,
  broadcast: true,
  release: true,
  service_quote: true,
  visit_reminder: true,
  crew_dispatch: true,
  crew_dispatch_cancelled: true,
  proposal_delivery: true,
  proposal_submission: true,
  other: true,
};
const ALLOWED_CATEGORY = new Set(Object.keys(FILTERABLE));
const ALLOWED_STATUS = new Set([
  'queued', 'sent', 'failed', 'error', 'skipped',
  'delivered', 'opened', 'clicked', 'bounced', 'complained', 'delivery_delayed',
]);

const SELECT =
  'id,category,to_email,to_name,from_email,subject,status,resend_message_id,' +
  'sent_by,delivered_at,first_opened_at,open_count,first_clicked_at,click_count,' +
  'bounced_at,created_at,sent_at';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const category = sp.get('category');
  const status = sp.get('status');
  const q = sp.get('q');
  const limit = Math.min(Math.max(Number.parseInt(sp.get('limit') ?? '100', 10) || 100, 1), 500);

  let path = `email_log?select=${SELECT}&order=created_at.desc&limit=${limit}`;
  if (category && ALLOWED_CATEGORY.has(category)) path += `&category=eq.${category}`;
  if (status && ALLOWED_STATUS.has(status)) path += `&status=eq.${status}`;
  // Match on recipient email, name, or subject. The or= value is percent-decoded
  // by PostgREST before its filter grammar is parsed, so URL-encoding alone can't
  // protect reserved characters — wrap the pattern in PostgREST double quotes
  // (commas/parens are literal inside them) and strip the characters that would
  // escape the quoting or act as like-wildcards.
  const term = q ? q.trim().replace(/[*%"\\]/g, '').trim() : '';
  if (term) {
    const quoted = encodeURIComponent(`"*${term}*"`);
    path += `&or=(to_email.ilike.${quoted},to_name.ilike.${quoted},subject.ilike.${quoted})`;
  }

  try {
    const rows = await supabaseRest<EmailListRow[]>('GET', path);
    return NextResponse.json({ rows: rows ?? [] });
  } catch (err) {
    console.error('Admin emails list fetch failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Fetch failed' },
      { status: 500 },
    );
  }
}
