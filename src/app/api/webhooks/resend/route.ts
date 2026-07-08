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
  type: string; // e.g. "email.delivered" | "contact.updated"
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    // contact.* events carry the contact's address here (assumption — see
    // handleContactEvent). Some payloads may nest it under `contact`.
    email?: string;
    unsubscribed?: boolean;
    contact?: { email?: string; unsubscribed?: boolean };
    bounce?: {
      type?: string; // "Permanent" | "Transient" | "Undetermined"
      [k: string]: unknown;
    };
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

// Pull a single email address out of a payload field that may be a string, a
// string array (Resend `to`), or absent.
function firstEmail(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    const v = value.trim();
    // Same '@' guard as the array branch — a non-address string must not reach
    // autoSuppress → getOrCreateByEmail and create a junk email_preferences row.
    return v.includes('@') ? v : undefined;
  }
  if (Array.isArray(value)) return value.find((v) => typeof v === 'string' && v.includes('@'));
  return undefined;
}

/**
 * A Resend-side unsubscribe (Gmail / Resend native one-click List-Unsubscribe on
 * a dashboard broadcast) flips the contact's `unsubscribed` flag or deletes the
 * contact, and never touches our DB. Mirror it back so email_preferences stays
 * the source of truth.
 *
 * ASSUMPTIONS (field names verified against Resend's documented Contact object —
 * `email` + `unsubscribed` — but NOT yet validated against a real captured
 * contact webhook payload; do that before fully relying on this path):
 *   - event.type is 'contact.updated' or 'contact.deleted'
 *   - the contact email is in data.email (fallbacks: data.to, data.contact.email)
 *   - on contact.updated the opt-out state is data.unsubscribed === true
 *     (fallback data.contact.unsubscribed)
 * We only suppress marketing streams (STREAM_KEYS) via autoSuppress — the
 * transactional follow_ups stream is deliberately left untouched.
 *
 * If a contact.* event arrives but we CANNOT resolve an email (payload shape
 * differs from the above), we log a WARNING rather than silently no-op — a real
 * shape mismatch then shows up in logs instead of becoming a hidden CAN-SPAM gap.
 *
 * @returns true if this was a contact event (handled — caller should ack 200).
 */
async function handleContactEvent(event: ResendEvent): Promise<boolean> {
  if (event.type !== 'contact.updated' && event.type !== 'contact.deleted') {
    return false;
  }
  const email =
    firstEmail(event.data?.email) ??
    firstEmail(event.data?.to) ??
    firstEmail(event.data?.contact?.email);
  // A deletion removes the contact entirely → treat as an unsubscribe. An
  // update only suppresses when the flag actually flipped to unsubscribed
  // (a name/property edit must not opt anyone out).
  const optedOut =
    event.type === 'contact.deleted' ||
    event.data?.unsubscribed === true ||
    event.data?.contact?.unsubscribed === true;
  if (email && optedOut) {
    await autoSuppress(email, event.type);
  } else if (optedOut && !email) {
    // Opt-out signalled but no address resolved → almost certainly a payload
    // shape we didn't anticipate. Surface it loudly so it can be fixed before it
    // silently drops real unsubscribes.
    console.warn(
      `resend webhook: ${event.type} indicated an unsubscribe but no email could be resolved from the payload — ` +
        `verify the contact webhook shape. Keys seen: ${Object.keys(event.data ?? {}).join(', ')}`,
    );
  }
  return true;
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

  // Contact events (native unsubscribe / contact deletion) flow back into our
  // suppression state before we consider email.* delivery events.
  if (await handleContactEvent(event)) {
    return NextResponse.json({ ok: true });
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
      // No email_log row yet. A fresh event may have raced sendTrackedEmail's
      // post-send insert, so return 404 to make Svix retry with backoff. Events
      // past the cutoff (deliberately unlogged sends, e.g. log:false) are acked
      // so they stop retrying.
      const UNMATCHED_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
      const createdAtMs = event.created_at ? Date.parse(event.created_at) : NaN;
      const withinRetryWindow =
        Number.isFinite(createdAtMs) && Date.now() - createdAtMs < UNMATCHED_RETRY_WINDOW_MS;
      if (withinRetryWindow) {
        return NextResponse.json({ error: 'No matching email_log row yet' }, { status: 404 });
      }
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
    // Only PERMANENT bounces suppress — a transient/undetermined bounce (e.g.
    // mailbox full) must not permanently unsubscribe the contact. Complaints
    // suppress unconditionally.
    const isPermanentBounce =
      newStatus === 'bounced' && event.data?.bounce?.type?.toLowerCase() === 'permanent';
    if (isPermanentBounce || newStatus === 'complained') {
      const recipient = firstEmail(event.data?.to);
      if (recipient) await autoSuppress(recipient, event.type);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Resend webhook update failed:', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
