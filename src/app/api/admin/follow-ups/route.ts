import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  cancelPendingFollowUps,
  followUpTypesForSequence,
  DEDICATED_SENDER_FOLLOW_UP_TYPES,
} from '@/lib/notify/cancelFollowUps';

export const dynamic = 'force-dynamic';

/** Matches the history half below - a queue longer than this needs paging, not a bigger page. */
const PENDING_CAP = 100;

/**
 * Admin follow_up_queue access, SERVER-SIDE with the secret key.
 *
 * The table's RLS grants the `anon` role but not the logged-in `authenticated`
 * role the admin browser uses, so a direct browser read/write returns nothing
 * (the Follow-Ups list showed all zeros, and browser-side "stop" no-op'd). Like
 * leads/homeowners, admin access goes through the server with SUPABASE_SECRET_KEY
 * (bypasses RLS). Gated to admins by middleware (path is under /api/admin/).
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function serviceClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createClient(SUPABASE_URL, secret);
}

export async function GET() {
  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  // Bounded, in two parts: the queue is append-only and shared by every
  // sequence, and each row carries the full rendered email HTML, so an
  // unbounded read grows forever. Pending rows are the actionable set (the
  // Active Drips view is built from them), so they are ALWAYS fetched in full -
  // a pure recency cap could silently drop an old still-pending drip email.
  // Sent/failed/cancelled history is capped at the newest 100.
  const [pending, history] = await Promise.all([
    supabase
      .from('follow_up_queue')
      // CM-14: uncapped, and every row carries the full rendered email HTML -
      // so this was both the largest payload on the page and silently
      // truncated at the server's own ceiling. The history half below already
      // had a limit; the pending half did not.
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(PENDING_CAP),
    supabase
      .from('follow_up_queue')
      .select('*')
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const error = pending.error || history.error;
  if (error) {
    console.error('follow-ups list error:', error);
    return NextResponse.json({ error: 'Failed to load follow-ups' }, { status: 500 });
  }
  const rows = [...(pending.data ?? []), ...(history.data ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return NextResponse.json({ rows });
}

export async function POST(request: NextRequest) {
  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const action = body.action as string | undefined;

  try {
    // Stop a person's drip: cancel pending rows for one sequence.
    //
    // The sequence is resolved through the shared registry rather than a local
    // `=== 'review' ? ... : nurture` ternary. Spelled that way, every sequence
    // it did not name collapsed to the nurture types, so the Stop button on a
    // visit-reminder drip cancelled nothing and reported "Nothing left to stop"
    // while the drip stayed in the list. An unknown name is now refused instead
    // of quietly cancelling somebody's nurture drip.
    if (action === 'stop') {
      const email = (body.email as string | undefined)?.trim();
      if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
      const sequence = typeof body.sequence === 'string' ? body.sequence : 'nurture';
      const types = followUpTypesForSequence(sequence);
      if (!types) return NextResponse.json({ error: `Unknown sequence: ${sequence}` }, { status: 400 });
      const stopped = await cancelPendingFollowUps(supabase, email, types);
      return NextResponse.json({ stopped });
    }

    // Cancel a single queued email by id.
    if (action === 'cancel') {
      const id = body.id as string | undefined;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      const { error } = await supabase.from('follow_up_queue').update({ status: 'cancelled' }).eq('id', id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    // Re-queue an email to send now.
    //
    // Not for a type with its own sender: those rows are the send-once ledger
    // their cron claims against, and each carries columns this generic insert
    // knows nothing about (a reminder needs `visit_start` to be found at all).
    // A copy without them is a row no cron will ever pick up - pending forever,
    // and back on this page tomorrow.
    if (action === 'resend') {
      const type = String(body.follow_up_type ?? '');
      if ((DEDICATED_SENDER_FOLLOW_UP_TYPES as readonly string[]).includes(type)) {
        return NextResponse.json(
          { error: `${type} is sent by its own cron and cannot be re-queued here - re-book the visit instead` },
          { status: 400 },
        );
      }
      const { error } = await supabase.from('follow_up_queue').insert({
        lead_email: body.lead_email,
        lead_name: body.lead_name,
        follow_up_type: body.follow_up_type,
        scheduled_at: new Date().toISOString(),
        status: 'pending',
        email_subject: body.email_subject,
        email_body: body.email_body,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('follow-ups action error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
