import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { BUILDER_CATEGORIES, type BuilderCategory } from '@/lib/proposals/builderCategories';

export const dynamic = 'force-dynamic';

/**
 * The proposal builder's category library.
 *
 * GET  - the built-in list merged with the admin-created rows in
 *        public.proposal_categories. Degrades to built-ins alone if the table
 *        is missing (pre-migration environments).
 * POST - create a custom category. STRICTLY admin (owner's rule): the role is
 *        checked against user_roles here, and RLS enforces it again at the
 *        table. A signed-in collaborator without the admin role gets the
 *        "ask your admin" answer, verbatim.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function serviceClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createClient(SUPABASE_URL, secret);
}

interface CustomRow {
  key: string;
  label: string;
  optional: boolean;
  active: boolean;
}

export async function GET() {
  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  let custom: BuilderCategory[] = [];
  try {
    const { data, error } = await supabase
      .from('proposal_categories')
      .select('key, label, optional, active')
      .order('label');
    if (!error && data) {
      custom = (data as CustomRow[])
        .filter((r) => r.active)
        .map((r) => ({ key: r.key, label: r.label, optional: r.optional, custom: true }));
    }
  } catch {
    // Table not migrated yet - the built-in library still works.
  }

  const builtinKeys = new Set(BUILDER_CATEGORIES.map((c) => c.key));
  return NextResponse.json({
    categories: [...BUILDER_CATEGORIES, ...custom.filter((c) => !builtinKeys.has(c.key))],
  });
}

export async function POST(request: NextRequest) {
  const supabase = serviceClient();
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });

  // Who is asking? Middleware already verified a session; here we need the
  // ROLE. Read the user from the request cookies, then their user_roles row.
  const authed = await createServerClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();
  if (!roleRow) {
    return NextResponse.json(
      { error: 'Only an admin can create categories - ask your admin to add it.' },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const label = String(body.label ?? '').trim();
  if (!label || label.length > 40) {
    return NextResponse.json({ error: 'A category name of 1-40 characters is required' }, { status: 400 });
  }
  const optional = body.optional === true;
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!key) return NextResponse.json({ error: 'That name has no usable characters' }, { status: 400 });

  const builtinKeys = new Set(BUILDER_CATEGORIES.map((c) => c.key));
  if (builtinKeys.has(key)) {
    return NextResponse.json({ error: 'That category already exists in the built-in library' }, { status: 409 });
  }

  const { error } = await supabase
    .from('proposal_categories')
    .upsert({ key, label, optional, active: true, created_by: user.id }, { onConflict: 'key' });
  if (error) {
    console.error('proposal category create failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ category: { key, label, optional, custom: true } });
}
