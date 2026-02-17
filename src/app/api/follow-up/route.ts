import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// GET: Return pending follow-ups due for sending
export async function GET() {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('follow_up_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('Error fetching follow-ups:', error);
      return NextResponse.json({ error: 'Failed to fetch follow-ups' }, { status: 500 });
    }

    return NextResponse.json({
      pending: data || [],
      count: data?.length || 0,
      checkedAt: now,
    });
  } catch (error) {
    console.error('Follow-up GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Process and "send" follow-ups
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, followUpId } = body as { action?: string; followUpId?: string };

    // Process a specific follow-up
    if (action === 'process' && followUpId) {
      const { data: followUp, error } = await supabase
        .from('follow_up_queue')
        .select('*')
        .eq('id', followUpId)
        .eq('status', 'pending')
        .single();

      if (error || !followUp) {
        return NextResponse.json({ error: 'Follow-up not found or already processed' }, { status: 404 });
      }

      // Check if lead has responded (cancel remaining follow-ups)
      const { data: respondedCheck } = await supabase
        .from('follow_up_queue')
        .select('id')
        .eq('lead_email', followUp.lead_email)
        .eq('status', 'responded')
        .limit(1);

      if (respondedCheck && respondedCheck.length > 0) {
        await supabase
          .from('follow_up_queue')
          .update({ status: 'cancelled' })
          .eq('id', followUpId);

        return NextResponse.json({ status: 'cancelled', reason: 'lead_responded' });
      }

      // Mark as sent
      const { error: updateError } = await supabase
        .from('follow_up_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', followUpId);

      if (updateError) {
        console.error('Failed to update follow-up status:', updateError);
        return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
      }

      return NextResponse.json({ status: 'sent', followUpId });
    }

    // Process all pending follow-ups
    if (action === 'process-all') {
      const now = new Date().toISOString();
      const { data: pending, error } = await supabase
        .from('follow_up_queue')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(50);

      if (error) {
        return NextResponse.json({ error: 'Failed to fetch pending follow-ups' }, { status: 500 });
      }

      const results: Array<{ id: string; status: string }> = [];

      for (const followUp of pending || []) {
        // Check for responded leads
        const { data: respondedCheck } = await supabase
          .from('follow_up_queue')
          .select('id')
          .eq('lead_email', followUp.lead_email)
          .eq('status', 'responded')
          .limit(1);

        if (respondedCheck && respondedCheck.length > 0) {
          await supabase
            .from('follow_up_queue')
            .update({ status: 'cancelled' })
            .eq('id', followUp.id);
          results.push({ id: followUp.id, status: 'cancelled' });
          continue;
        }

        await supabase
          .from('follow_up_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
          })
          .eq('id', followUp.id);

        results.push({ id: followUp.id, status: 'sent' });
      }

      return NextResponse.json({
        processed: results.length,
        results,
      });
    }

    // Mark lead as responded (cancels remaining sequence)
    if (action === 'mark-responded') {
      const { email } = body as { email?: string };
      if (!email) {
        return NextResponse.json({ error: 'Email required' }, { status: 400 });
      }

      // Mark the earliest pending as responded, cancel the rest
      const { data: pendingForLead } = await supabase
        .from('follow_up_queue')
        .select('id')
        .eq('lead_email', email)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true });

      if (pendingForLead && pendingForLead.length > 0) {
        // Mark first as responded
        await supabase
          .from('follow_up_queue')
          .update({ status: 'responded' })
          .eq('id', pendingForLead[0].id);

        // Cancel the rest
        if (pendingForLead.length > 1) {
          const remainingIds = pendingForLead.slice(1).map(f => f.id);
          await supabase
            .from('follow_up_queue')
            .update({ status: 'cancelled' })
            .in('id', remainingIds);
        }
      }

      return NextResponse.json({ status: 'marked_responded', email });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Follow-up POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
