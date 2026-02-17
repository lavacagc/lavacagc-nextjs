import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/**
 * GET /api/feedback/list
 * Returns all feedback-type follow-up queue entries for the admin page.
 */
export async function GET() {
  try {
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(SUPABASE_URL, secretKey);

    const { data, error } = await supabase
      .from('follow_up_queue')
      .select('*')
      .like('follow_up_type', 'feedback%')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching feedback requests:', error);
      return NextResponse.json({ error: 'Failed to fetch feedback requests' }, { status: 500 });
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('Feedback list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
