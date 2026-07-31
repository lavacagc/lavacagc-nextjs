import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { isActiveHomeCareSubscriber } from '@/lib/homecare/homeowners';
import { sharedFollowUpQueue, withoutDedicatedSenders } from '@/lib/notify/cancelFollowUps';
import { HC_PROMO_START, HC_PROMO_END } from '@/lib/emailTemplates';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/**
 * Remove the Home Care promo block (and only that block) from a follow-up body.
 * Lead follow-ups 2 & 3 embed a "join Home Care" pitch between HC_PROMO_START and
 * HC_PROMO_END; we strip it at send time for recipients who are already active
 * Home Care subscribers so we never pitch them a membership they already have.
 * Safe on bodies without the markers (older queued rows) — it's a no-op.
 */
function stripHomeCarePromo(html: string): string {
  const pattern = new RegExp(
    `${HC_PROMO_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${HC_PROMO_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'g',
  );
  return html.replace(pattern, '');
}

/**
 * GET /api/cron/send-follow-ups
 * Processes pending follow-up emails from the follow_up_queue table.
 *
 * Call this endpoint on a schedule (e.g., Vercel Cron every 15 minutes)
 * or via an external cron service.
 *
 * Setup required:
 * 1. Sign up at https://resend.com
 * 2. Verify the email.lavaca.link domain in Resend dashboard
 * 3. Add RESEND_API_KEY to Vercel env vars:
 *    vercel env add RESEND_API_KEY production
 * 4. Add a Vercel cron job in vercel.json:
 *    { "crons": [{ "path": "/api/cron/send-follow-ups", "schedule": "0,15,30,45 * * * *" }] }
 *
 * Optional: Add CRON_SECRET env var and pass as Authorization header
 * to protect this endpoint from unauthorized access.
 */
export async function GET(request: NextRequest) {
  try {
    // CRON_SECRET is enforced by middleware — this is a defense-in-depth check
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ error: 'Server misconfiguration: CRON_SECRET not set' }, { status: 500 });
    }
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check for required env vars
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.warn('⚠️ RESEND_API_KEY not configured — cannot send follow-up emails');
      return NextResponse.json({
        status: 'skipped',
        reason: 'no_api_key',
        message: 'RESEND_API_KEY not configured. See route comments for setup instructions.',
      });
    }

    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!secretKey) {
      console.error('SUPABASE_SECRET_KEY not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, secretKey);

    // Query pending follow-ups that are due.
    //
    // Through `sharedFollowUpQueue`, which excludes the types with a dedicated
    // cron: this drain runs at 09:00 UTC (~4am Eastern), which is fine for a
    // nurture email nobody times and wrong for anything scheduled to land at a
    // particular hour. Without that exclusion it picks up those rows too and
    // sends a second copy.
    const { data: pendingItems, error: queryError } = await sharedFollowUpQueue(supabase)
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20); // Process in batches to avoid timeouts

    if (queryError) {
      console.error('Error querying follow_up_queue:', queryError);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    if (!pendingItems || pendingItems.length === 0) {
      return NextResponse.json({ status: 'ok', processed: 0, message: 'No pending follow-ups' });
    }

    let sent = 0;
    let failed = 0;
    let cancelled = 0;

    // Emails cancelled earlier in THIS batch (unsubscribed). The cancel query
    // already flipped their DB rows to 'cancelled', but sibling items for the
    // same address were loaded into this batch before that — skip them here so
    // we don't re-invoke Resend or write duplicate 'skipped' audit rows.
    const cancelledEmails = new Set<string>();

    // Helper: wait between sends to respect Resend 2 req/s rate limit
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (const item of pendingItems) {
      try {
        if (item.lead_email && cancelledEmails.has(item.lead_email)) {
          continue;
        }

        // Validate email before sending
        if (!item.lead_email || !item.lead_email.includes('@')) {
          console.warn(`Skipping invalid email: ${item.lead_email}`);
          // NOTE: follow_up_queue has no error_message column - failure detail
          // lives in the logs. Writing an unknown column makes PostgREST
          // reject the whole update (PGRST204), leaving the row 'pending'
          // forever and jamming the queue.
          const { error: invalidEmailMarkError } = await supabase
            .from('follow_up_queue')
            .update({
              status: 'failed',
              sent_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          if (invalidEmailMarkError) console.error(`Failed to mark follow-up ${item.id} failed:`, invalidEmailMarkError);
          failed++;
          continue;
        }

        // Home Care promo suppression: follow-ups 2 & 3 embed a "join Home Care"
        // pitch. Because the body was frozen at lead-submit time (24–48h ago),
        // decide HERE, at send time, using live subscription state — someone may
        // have subscribed in the interim. If they're already an active Home Care
        // subscriber, strip just that block so we don't pitch them a membership
        // they already have. Only query when the marker is actually present.
        let bodyToSend: string = item.email_body ?? '';
        if (bodyToSend.includes(HC_PROMO_START)) {
          const alreadySubscribed = await isActiveHomeCareSubscriber(item.lead_email);
          if (alreadySubscribed) {
            bodyToSend = stripHomeCarePromo(bodyToSend);
          }
        }

        // Detect if body is HTML or plain text
        const isHtml = bodyToSend.trim().startsWith('<!DOCTYPE') || bodyToSend.trim().startsWith('<html');
        const sendResult = await sendTrackedEmail({
          from: 'La Vaca General Contractors <info@email.lavaca.link>',
          to: item.lead_email,
          subject: item.email_subject,
          ...(isHtml ? { html: bodyToSend } : { text: bodyToSend }),
          category: 'lead_followup',
          toName: item.lead_name ?? null,
          leadId: item.lead_id ?? null,
          campaign: { follow_up_type: item.follow_up_type },
          // Honor the follow-ups opt-out at send time — covers both lead
          // follow-ups and review requests, which share this queue. A recipient
          // who used the unsubscribe link is skipped (status recorded as
          // 'skipped' in email_log) rather than emailed.
          preferenceStream: 'follow_ups',
        });

        if (sendResult.status === 'skipped' && sendResult.reason === 'unsubscribed') {
          // Recipient opted out of follow-ups — cancel this AND every other
          // still-pending item for the same email so we never email them again.
          // Rows owned by a dedicated cron are left alone: opting out of the
          // follow-ups stream must not silently drop the transactional
          // "we're coming tomorrow" reminder for a visit they booked.
          const { count, error: cancelMarkError } = await withoutDedicatedSenders(
            supabase
              .from('follow_up_queue')
              .update(
                {
                  status: 'cancelled',
                  sent_at: new Date().toISOString(),
                },
                { count: 'exact' },
              ),
          )
            .eq('lead_email', item.lead_email)
            .eq('status', 'pending');
          if (cancelMarkError) console.error(`Failed to cancel follow-ups for unsubscribed ${item.lead_email}:`, cancelMarkError);
          cancelled += count ?? 1;
          cancelledEmails.add(item.lead_email);
        } else if (sendResult.status !== 'sent') {
          console.error(`Failed to send follow-up ${item.id}:`, sendResult.error);
          const { error: sendFailMarkError } = await supabase
            .from('follow_up_queue')
            .update({
              status: 'failed',
              sent_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          if (sendFailMarkError) console.error(`Failed to mark follow-up ${item.id} failed:`, sendFailMarkError);
          failed++;
        } else {
          await supabase
            .from('follow_up_queue')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          sent++;
        }
      } catch (itemError) {
        console.error(`Error processing follow-up ${item.id}:`, itemError);
        const { error: crashMarkError } = await supabase
          .from('follow_up_queue')
          .update({
            status: 'failed',
            sent_at: new Date().toISOString(),
          })
          .eq('id', item.id);
        if (crashMarkError) console.error(`Failed to mark follow-up ${item.id} failed:`, crashMarkError);
        failed++;
      }

      // Rate limit: wait 1 second between sends (Resend limit is 2 req/s)
      await delay(1000);
    }

    return NextResponse.json({
      status: 'ok',
      processed: pendingItems.length,
      sent,
      failed,
      cancelled,
    });
  } catch (error) {
    console.error('Cron endpoint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
