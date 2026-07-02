import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import {
  getOrCreateByEmail,
  applyUpdate,
  normalizeEmail,
  STREAM_KEYS,
  type StreamKey,
  type EmailPreferences,
} from '@/lib/preferences/preferences';

/**
 * Admin view + control of a contact's email preferences.
 *
 *   GET  /api/admin/preferences            → recent preference-change activity
 *   GET  /api/admin/preferences?email=…    → that contact's streams + audit trail
 *   POST /api/admin/preferences            → { email, changes } toggle as admin
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */

export const dynamic = 'force-dynamic';

interface PrefEvent {
  id: string;
  email: string;
  stream: string;
  old_value: boolean | null;
  new_value: boolean;
  actor: string;
  actor_detail: string | null;
  created_at: string;
}

function stateOf(p: EmailPreferences) {
  return { home_care: p.home_care, buy_remodel: p.buy_remodel, announcements: p.announcements };
}

export async function GET(request: NextRequest) {
  const emailParam = request.nextUrl.searchParams.get('email');

  try {
    if (emailParam) {
      const email = normalizeEmail(emailParam);
      const rows = await supabaseRest<EmailPreferences[]>(
        'GET',
        `email_preferences?email=eq.${encodeURIComponent(email)}&limit=1`,
      );
      const events = await supabaseRest<PrefEvent[]>(
        'GET',
        `preference_events?email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=100`,
      );
      return NextResponse.json({
        email,
        preferences: rows?.[0] ? stateOf(rows[0]) : null,
        exists: !!rows?.[0],
        events: events ?? [],
      });
    }

    // No email → recent activity across everyone.
    const events = await supabaseRest<PrefEvent[]>(
      'GET',
      'preference_events?order=created_at.desc&limit=100',
    );
    return NextResponse.json({ events: events ?? [] });
  } catch (err) {
    console.error('Admin preferences GET failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Fetch failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { email: rawEmail, changes } = (body ?? {}) as {
    email?: string;
    changes?: Record<string, unknown>;
  };
  if (!rawEmail || typeof rawEmail !== 'string') {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  const clean: Partial<Record<StreamKey, boolean>> = {};
  if (changes && typeof changes === 'object') {
    for (const key of STREAM_KEYS) {
      const v = (changes as Record<string, unknown>)[key];
      if (typeof v === 'boolean') clean[key] = v;
    }
  }

  // Resolve the acting admin for the audit trail (middleware already gated us).
  let adminEmail: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    adminEmail = user?.email ?? null;
  } catch {
    // Non-fatal: event just records a null actor_detail.
  }

  try {
    const current = await getOrCreateByEmail(rawEmail);
    const updated = await applyUpdate({
      current,
      changes: clean,
      actor: 'admin',
      actorDetail: adminEmail,
    });
    return NextResponse.json({ email: updated.email, preferences: stateOf(updated) });
  } catch (err) {
    console.error('Admin preferences POST failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 },
    );
  }
}
