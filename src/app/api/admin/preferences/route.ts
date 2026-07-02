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

interface PrefRow extends EmailPreferences {
  updated_at?: string;
  created_at?: string;
}

function csvEscape(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  // Neutralize spreadsheet formula injection: a cell starting with = + - @ or a
  // tab/CR executes as a formula when the export is opened in Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const emailParam = sp.get('email');
  const all = sp.get('all');

  try {
    // Bulk list / export mode: every contact's stream state.
    if (all) {
      const stream = sp.get('stream'); // optional: home_care|buy_remodel|announcements
      const state = sp.get('state'); // optional: on|off (requires stream)
      const format = sp.get('format'); // csv → download
      const limit = Math.min(Math.max(Number.parseInt(sp.get('limit') ?? '1000', 10) || 1000, 1), 5000);

      let path = `email_preferences?select=email,home_care,buy_remodel,announcements,updated_at,created_at&order=updated_at.desc&limit=${limit}`;
      if (stream && STREAM_KEYS.includes(stream as StreamKey) && (state === 'on' || state === 'off')) {
        path += `&${stream}=eq.${state === 'on'}`;
      }
      const rows = (await supabaseRest<PrefRow[]>('GET', path)) ?? [];

      if (format === 'csv') {
        const header = 'email,home_care,buy_remodel,announcements,updated_at';
        const lines = rows.map((r) =>
          [r.email, r.home_care, r.buy_remodel, r.announcements, r.updated_at].map(csvEscape).join(','),
        );
        const csv = [header, ...lines].join('\n');
        return new NextResponse(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="email-preferences.csv"',
          },
        });
      }
      return NextResponse.json({ rows, count: rows.length });
    }

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
