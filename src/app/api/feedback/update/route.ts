import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/**
 * POST /api/feedback/update
 * Update feedback queue entries (mark responded, cancel, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, secretKey);
    const body = await request.json();
    const { action, email } = body as { action: string; email: string };

    if (!action || !email) {
      return NextResponse.json({ error: 'Action and email required' }, { status: 400 });
    }

    if (action === 'mark_responded') {
      const { error } = await supabase
        .from('follow_up_queue')
        .update({ status: 'responded' })
        .eq('lead_email', email)
        .like('follow_up_type', 'feedback%')
        .in('status', ['pending', 'sent']);

      if (error) {
        console.error('Error marking responded:', error);
        return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
      }

      return NextResponse.json({ status: 'ok' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Feedback update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
