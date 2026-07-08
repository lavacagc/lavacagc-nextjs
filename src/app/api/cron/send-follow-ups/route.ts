import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

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

    // Query pending follow-ups that are due
    const { data: pendingItems, error: queryError } = await supabase
      .from('follow_up_queue')
      .select('*')
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
          await supabase
            .from('follow_up_queue')
            .update({
              status: 'failed',
              error_message: 'Invalid email address',
              sent_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          failed++;
          continue;
        }

        // Detect if body is HTML or plain text
        const isHtml = item.email_body?.trim().startsWith('<!DOCTYPE') || item.email_body?.trim().startsWith('<html');
        const sendResult = await sendTrackedEmail({
          from: 'La Vaca General Contractors <info@email.lavaca.link>',
          to: item.lead_email,
          subject: item.email_subject,
          ...(isHtml ? { html: item.email_body } : { text: item.email_body }),
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
          const { count } = await supabase
            .from('follow_up_queue')
            .update(
              {
                status: 'cancelled',
                error_message: 'Recipient unsubscribed from follow-ups',
                sent_at: new Date().toISOString(),
              },
              { count: 'exact' },
            )
            .eq('lead_email', item.lead_email)
            .eq('status', 'pending');
          cancelled += count ?? 1;
          cancelledEmails.add(item.lead_email);
        } else if (sendResult.status !== 'sent') {
          console.error(`Failed to send follow-up ${item.id}:`, sendResult.error);
          await supabase
            .from('follow_up_queue')
            .update({
              status: 'failed',
              error_message: sendResult.error || 'Send failed',
              sent_at: new Date().toISOString(),
            })
            .eq('id', item.id);
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
        await supabase
          .from('follow_up_queue')
          .update({
            status: 'failed',
            error_message: itemError instanceof Error ? itemError.message : 'Unknown error',
            sent_at: new Date().toISOString(),
          })
          .eq('id', item.id);
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
