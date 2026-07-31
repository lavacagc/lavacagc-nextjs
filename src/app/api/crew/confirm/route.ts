/**
 * POST /api/crew/confirm - a crew member confirms a visit, or flags a problem.
 *
 * Public by design: auth is the token, which is random, per (dispatch,
 * recipient), and only ever sent to that one person's inbox. Requiring a login
 * would defeat the point - this has to work from a phone lock screen at 5pm.
 *
 * POST ONLY, and that is the whole reason this route exists separately from the
 * page. Mail scanners, link-preview bots and Gmail's own image proxy fetch every
 * URL in an email; a GET that confirmed would mark visits confirmed that no
 * human has looked at, and the 5pm escalation would then never fire for exactly
 * the visits it exists to catch. The same rule the Home Care unsubscribe route
 * already follows.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  token: z.string().trim().min(16).max(200),
  action: z.enum(['confirm', 'flag']),
  note: z.string().trim().max(1000).optional(),
});

interface AssignmentRow {
  id: string;
  status: string;
  confirmed_at: string | null;
  name: string | null;
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { token, action, note } = parsed.data;

  try {
    const rows = (await supabaseRest<AssignmentRow[]>(
      'GET',
      `visit_dispatch_recipients?select=id,status,confirmed_at,name` +
        `&confirm_token=eq.${encodeURIComponent(token)}&limit=1`,
    )) ?? [];
    const assignment = rows[0];
    // Deliberately the same answer for an unknown token and a malformed one:
    // this endpoint is public, and telling the difference would let anyone
    // enumerate live tokens.
    if (!assignment) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });

    const now = new Date().toISOString();
    await supabaseRest('PATCH', `visit_dispatch_recipients?id=eq.${assignment.id}`, {
      status: action === 'confirm' ? 'confirmed' : 'flagged',
      // Stamped for a flag too. It is the record of when somebody actually
      // looked at this, which is what the escalation is really asking about -
      // a flagged visit has been dealt with by a human, so chasing it at 6pm
      // would be nagging about something already reported.
      confirmed_at: now,
      note: action === 'flag' ? (note ?? null) : null,
      updated_at: now,
    });

    return NextResponse.json({ status: action === 'confirm' ? 'confirmed' : 'flagged' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('crew confirm failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
