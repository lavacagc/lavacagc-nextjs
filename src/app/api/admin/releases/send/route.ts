/**
 * Send the release-notes email (R1) — an explicit, admin-only action.
 *
 *   POST /api/admin/releases/send { mode: 'test' }              → one email to the signed-in admin only
 *   POST /api/admin/releases/send { mode: 'all', confirm: true } → every active Home Care member,
 *        preference-aware (home_care stream), capped at RECIPIENT_CAP recipients
 *        per run (the response carries a warning naming how many were left
 *        out). The queued entries are claimed
 *        (stamped 'sent') atomically up front so a concurrent trigger or a
 *        retry after a mid-batch crash can never double-send; if nothing was
 *        delivered for a non-suppression reason the claim is rolled back to
 *        'queued' (an all-suppressed batch counts as a successful send).
 *
 * Stamping 'sent' is also what publishes an entry: the public
 * /home-care/whats-new page renders sent rows (statically, revalidated hourly).
 *
 * Never runs on a schedule — the whole point is that the owner pulls the trigger.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { buildReleaseEmail, type ReleaseFeature } from '@/lib/homecare/releaseEmail';
import { preferencesUrlFor } from '@/lib/preferences/preferences';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const FROM = 'Alex from La Vaca GC <alex@email.lavaca.link>';
const PROD_BASE = 'https://www.lavacagc.com';
const RECIPIENT_CAP = 1000;

interface QueuedRow extends ReleaseFeature {
  id: string;
  sort_order: number;
  created_at: string;
}
interface HomeownerRow {
  id: string;
  first_name: string | null;
  email: string;
  unsubscribe_token: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { mode?: string; confirm?: boolean };
  const mode = body.mode === 'all' ? 'all' : 'test';
  if (mode === 'all' && body.confirm !== true) {
    return NextResponse.json({ error: 'confirm required to send to all members' }, { status: 400 });
  }

  // Resolve the acting admin (middleware already gated us) — the test
  // recipient and the sent_by audit value.
  let adminEmail: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    adminEmail = user?.email ?? null;
  } catch {
    adminEmail = null;
  }
  if (mode === 'test' && !adminEmail) {
    return NextResponse.json({ error: 'could not resolve your admin email for the test send' }, { status: 400 });
  }

  try {
    // Screenshot/link URLs must be absolute for email clients, and prod assets
    // only exist on the deployed site — always build against prod.
    const baseUrl = PROD_BASE;

    if (mode === 'test') {
      const queued = (await supabaseRest<QueuedRow[]>(
        'GET',
        'feature_releases?select=id,headline,subhead,benefit,screenshot_path,sort_order,created_at&status=eq.queued&order=sort_order.asc,created_at.asc',
      )) ?? [];
      if (queued.length === 0) {
        return NextResponse.json({ error: 'nothing queued — add at least one feature first' }, { status: 400 });
      }
      const { subject, html, text } = buildReleaseEmail({
        firstName: null,
        features: queued,
        baseUrl,
        unsubscribeUrl: `${baseUrl}/home-care`,
        preferencesUrl: undefined,
      });
      const res = await sendTrackedEmail({
        from: FROM,
        to: adminEmail!,
        subject: `[TEST] ${subject}`,
        html,
        text,
        category: 'release',
        sentBy: adminEmail,
        campaign: { release_test: true, features: queued.length },
      });
      if (res.status !== 'sent') {
        return NextResponse.json(
          {
            error: `test email was not delivered (${[res.status, res.reason].filter(Boolean).join(': ')})`,
            mode,
            status: res.status,
          },
          { status: 502 },
        );
      }
      return NextResponse.json({ ok: true, mode, status: res.status, features: queued.length, to: adminEmail });
    }

    const homeowners = (await supabaseRest<HomeownerRow[]>(
      'GET',
      'homeowners?select=id,first_name,email,unsubscribe_token&status=eq.active',
    )) ?? [];
    const recipients = homeowners.slice(0, RECIPIENT_CAP);
    const truncated = homeowners.length - recipients.length;
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'no active members to send to' }, { status: 400 });
    }

    // Claim the whole queue atomically BEFORE sending: a concurrent second
    // trigger claims nothing and gets the "nothing queued" 400, and a
    // mid-batch crash cannot cause a retry to re-email everyone - the failure
    // mode is "some members missed it", visible per-recipient in email_log.
    const queued = ((await supabaseRest<QueuedRow[]>(
      'PATCH',
      'feature_releases?status=eq.queued&select=id,headline,subhead,benefit,screenshot_path,sort_order,created_at',
      { status: 'sent', sent_at: new Date().toISOString() },
      { prefer: 'return=representation' },
    )) ?? []).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    if (queued.length === 0) {
      return NextResponse.json({ error: 'nothing queued — add at least one feature first' }, { status: 400 });
    }

    let sent = 0;
    let suppressed = 0;
    const failures: string[] = [];
    for (const h of recipients) {
      const preferencesUrl = await preferencesUrlFor(baseUrl, h.email).catch(() => undefined);
      const { subject, html, text } = buildReleaseEmail({
        firstName: h.first_name,
        features: queued,
        baseUrl,
        unsubscribeUrl: `${baseUrl}/api/home-care/unsubscribe?token=${encodeURIComponent(h.unsubscribe_token)}`,
        preferencesUrl,
      });
      const res = await sendTrackedEmail({
        from: FROM,
        to: h.email,
        toName: h.first_name,
        subject,
        html,
        text,
        category: 'release',
        homeownerId: h.id,
        sentBy: adminEmail,
        preferenceStream: 'home_care',
        campaign: { release_batch: queued.map((q) => q.id) },
      });
      if (res.status === 'sent') sent += 1;
      else if (res.status === 'skipped' && res.reason === 'unsubscribed') suppressed += 1;
      else failures.push(`${h.email}:${res.status}`);
    }

    // Nothing was delivered for a non-suppression reason (e.g. RESEND_API_KEY
    // unset → every send skipped): release the claim so the announcements
    // aren't silently lost. An all-suppressed batch is a success — every
    // recipient's opt-out was honored — so it stays stamped 'sent'.
    if (sent === 0 && failures.length > 0) {
      const ids = queued.map((q) => q.id).join(',');
      try {
        await supabaseRest('PATCH', `feature_releases?id=in.(${ids})`, { status: 'queued', sent_at: null });
      } catch (unclaimErr) {
        console.error('release unclaim failed:', unclaimErr instanceof Error ? unclaimErr.message : unclaimErr);
        return NextResponse.json(
          {
            error: 'no emails were delivered AND automatic requeue failed - the queue may still show sent; use Refresh and requeue manually',
            sent,
            suppressed,
            failures: failures.length,
          },
          { status: 500 },
        );
      }
      return NextResponse.json(
        { error: 'no emails were delivered - the queue was left intact', sent, suppressed, failures: failures.length },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      mode,
      features: queued.length,
      recipients: recipients.length,
      sent,
      suppressed,
      failures: failures.length,
      ...(truncated > 0 ? { warning: `recipient list capped at ${RECIPIENT_CAP}; ${truncated} active member(s) not emailed this run` } : {}),
    });
  } catch (err) {
    console.error('release send failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
