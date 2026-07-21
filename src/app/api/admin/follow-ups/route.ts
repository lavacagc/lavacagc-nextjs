import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  cancelPendingFollowUps,
  LEAD_NURTURE_FOLLOW_UP_TYPES,
  REVIEW_REQUEST_FOLLOW_UP_TYPES,
} from '@/lib/notify/cancelFollowUps';

export const dynamic = 'force-dynamic';

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

  const { data, error } = await supabase
    .from('follow_up_queue')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('follow-ups list error:', error);
    return NextResponse.json({ error: 'Failed to load follow-ups' }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
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
    // Stop a person's drip: cancel pending rows for one sequence (nurture|review).
    if (action === 'stop') {
      const email = (body.email as string | undefined)?.trim();
      const sequence = body.sequence === 'review' ? 'review' : 'nurture';
      if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
      const types = sequence === 'review' ? REVIEW_REQUEST_FOLLOW_UP_TYPES : LEAD_NURTURE_FOLLOW_UP_TYPES;
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
    if (action === 'resend') {
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
