import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sanitizeLeadForInsert } from '@/lib/leadSanitize';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/customers - "save a new customer" from the admin typeahead.
 *
 * Stores the person as a lead with source 'manual' (owner's decision
 * 2026-08-08: one people list, no separate customers table), so both the
 * Send Estimate and Send Service Quote searches find them from then on.
 *
 * Server-side on purpose: a browser-side supabase insert would be blocked by
 * the site's connect-src CSP against the stub backend, and every other admin
 * write already goes through /api/admin/*. Gated to admins by middleware.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function POST(request: NextRequest) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const firstName = String(body.firstName ?? '').trim();
  const email = String(body.email ?? '').trim();
  if (!firstName || !email) {
    return NextResponse.json({ error: 'First name and email are required' }, { status: 400 });
  }

  // Through the sanitizer chokepoint like every other leads write.
  const { lead } = sanitizeLeadForInsert({
    first_name: firstName,
    last_name: String(body.lastName ?? '').trim(),
    email,
    phone: String(body.phone ?? '').trim(),
    inquiry_type: 'contact',
    city: String(body.city ?? '').trim() || null,
    message: '[Saved manually from the admin customer search]',
    source: 'manual',
  });

  const supabase = createClient(SUPABASE_URL, secret);
  const { data, error } = await supabase
    .from('leads')
    .insert(lead as unknown as { email: string; first_name: string; last_name: string; phone: string; inquiry_type: string })
    .select('id, first_name, last_name, email, phone, project_type, city, created_at')
    .single();

  if (error) {
    console.error('manual customer insert failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    customer: {
      id: data.id,
      name: [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || null,
      email: data.email,
      phone: data.phone,
      project_type: data.project_type,
      city: data.city,
      source: 'manual',
      created_at: data.created_at,
    },
  });
}
