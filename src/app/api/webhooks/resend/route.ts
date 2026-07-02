import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { cleanEnv } from '@/lib/envClean';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { getOrCreateByEmail, applyUpdate, STREAM_KEYS } from '@/lib/preferences/preferences';

/**
 * POST /api/webhooks/resend
 *
 * Receives Resend delivery events and backfills them onto the matching
 * public.email_log row (matched by resend_message_id). This is what turns the
 * admin email log from "we sent it" into "it was delivered / opened / clicked /
 * bounced".
 *
 * Security: Resend signs webhooks with Svix. We verify the signature against
 * RESEND_WEBHOOK_SECRET (the "whsec_..." value from the Resend dashboard). An
 * unsigned or mis-signed request is rejected 400 — this route is public
 * (declared in middleware PUBLIC_ROUTES) so the signature IS the auth.
 *
 * Runs in-process. Configure the endpoint + secret in the Resend dashboard:
 *   https://resend.com → Webhooks → add https://www.lavacagc.com/api/webhooks/resend
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ResendEvent {
  type: string; // e.g. "email.delivered"
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    [k: string]: unknown;
  };
}

// A hard bounce or spam complaint means we should stop marketing to this address
// (deliverability + reputation). Turn OFF every marketing stream, audited as a
// webhook-driven change. Best-effort — never fail the webhook over this.
async function autoSuppress(email: string, event: string): Promise<void> {
  try {
    const pref = await getOrCreateByEmail(email);
    await applyUpdate({
      current: pref,
      changes: Object.fromEntries(STREAM_KEYS.map((k) => [k, false])),
      actor: 'webhook',
      actorDetail: event,
    });
  } catch (e) {
    console.error('auto-suppress failed (non-fatal):', e instanceof Error ? e.message : e);
  }
}

// Delivery progression rank — we only advance status forward so an out-of-order
// "sent" webhook can't clobber an already-recorded "opened". Negative terminal
// states (bounced/complained/failed) are always applied regardless of rank.
const PROGRESS_RANK: Record<string, number> = {
  queued: 0,
  skipped: 0,
  sent: 1,
  delivery_delayed: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
};
const NEGATIVE_STATUSES = new Set(['bounced', 'complained', 'failed']);

function statusFromEvent(type: string): string | null {
  const map: Record<string, string> = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.delivery_delayed': 'delivery_delayed',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.failed': 'failed',
  };
  return map[type] ?? null;
}

interface EmailLogRow {
  id: string;
  status: string;
  open_count: number;
  click_count: number;
  first_opened_at: string | null;
  first_clicked_at: string | null;
}

export async function POST(request: NextRequest) {
  const secret = cleanEnv(process.env.RESEND_WEBHOOK_SECRET);
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET not configured — cannot verify webhook');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // Read the RAW body — signature verification is over the exact bytes.
  const payload = await request.text();
  const headers = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  };

  let event: ResendEvent;
  try {
    event = new Webhook(secret).verify(payload, headers) as ResendEvent;
  } catch (err) {
    console.warn('Resend webhook signature verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const messageId = event.data?.email_id;
  const newStatus = statusFromEvent(event.type);
  if (!messageId || !newStatus) {
    // Unknown/irrelevant event type, or no id to match — ack so Resend stops retrying.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const eventTime = event.created_at ?? new Date().toISOString();

  try {
    const rows = await supabaseRest<EmailLogRow[]>(
      'GET',
      `email_log?resend_message_id=eq.${encodeURIComponent(messageId)}` +
        `&select=id,status,open_count,click_count,first_opened_at,first_clicked_at&limit=1`,
    );
    const row = rows?.[0];
    if (!row) {
      // We didn't originate this message (or logging was skipped). Ack anyway.
      return NextResponse.json({ ok: true, unmatched: true });
    }

    const patch: Record<string, unknown> = { last_event_at: eventTime };

    // Advance status only forward; negative terminal states always apply and
    // are sticky — a later positive event (e.g. an open from the spam folder)
    // must not hide a recorded bounce/complaint.
    const curRank = PROGRESS_RANK[row.status] ?? -1;
    const newRank = PROGRESS_RANK[newStatus] ?? -1;
    if (NEGATIVE_STATUSES.has(newStatus)) {
      patch.status = newStatus;
    } else if (!NEGATIVE_STATUSES.has(row.status) && newRank >= curRank) {
      patch.status = newStatus;
    }

    // Per-event fields.
    switch (newStatus) {
      case 'delivered':
        patch.delivered_at = eventTime;
        break;
      case 'opened':
        patch.open_count = (row.open_count ?? 0) + 1;
        if (!row.first_opened_at) patch.first_opened_at = eventTime;
        break;
      case 'clicked':
        patch.click_count = (row.click_count ?? 0) + 1;
        if (!row.first_clicked_at) patch.first_clicked_at = eventTime;
        break;
      case 'bounced':
        patch.bounced_at = eventTime;
        break;
      case 'complained':
        patch.complained_at = eventTime;
        break;
    }

    await supabaseRest('PATCH', `email_log?id=eq.${row.id}`, patch, {
      prefer: 'return=minimal',
    });

    // Hard bounce / spam complaint → stop all marketing to this address.
    if (newStatus === 'bounced' || newStatus === 'complained') {
      const recipient = event.data?.to?.[0];
      if (recipient) await autoSuppress(recipient, event.type);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Resend webhook update failed:', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
