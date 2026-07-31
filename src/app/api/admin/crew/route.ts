/**
 * /api/admin/crew - the list of people a visit dispatch can be sent to.
 *
 * Deliberately thin: names and email addresses, active or not. No roles, no
 * permissions, no login - these people never sign in to anything, they act on
 * a tokenized link in an email.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const createSchema = z.object({
  name: z.string().trim().min(1, 'A name is required').max(120),
  email: z.string().trim().email().max(200),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

/** Everyone, active first - the admin page needs to see who is switched off. */
export async function GET() {
  try {
    const rows = (await supabaseRest(
      'GET',
      'dispatch_recipients?select=id,name,email,active&order=active.desc,name.asc',
    )) ?? [];
    return NextResponse.json({ recipients: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('crew list failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }

  // Lower-cased on the way in so "Alex@" and "alex@" cannot become two
  // recipients who both receive every dispatch. The unique index enforces the
  // same thing from below.
  const email = parsed.data.email.toLowerCase();
  try {
    const created = await supabaseRest<{ id: string }[]>('POST', 'dispatch_recipients', [{
      name: parsed.data.name, email,
    }]);
    return NextResponse.json({ status: 'created', recipient: created?.[0] ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 23505 is the unique index on lower(email).
    if (/duplicate key|23505/i.test(message)) {
      return NextResponse.json({ error: `${email} is already on the list.` }, { status: 409 });
    }
    console.error('crew create failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Rename, or switch someone off.
 *
 * Deactivating rather than deleting is the point: a past dispatch still
 * references the recipient, and `visit_dispatch_recipients` stores the address
 * as sent so the record of what happened does not rewrite itself either way.
 */
export async function PATCH(request: NextRequest) {
  let raw: unknown;
  try { raw = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    await supabaseRest('PATCH', `dispatch_recipients?id=eq.${id}`, {
      ...patch, updated_at: new Date().toISOString(),
    });
    return NextResponse.json({ status: 'updated' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('crew update failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
