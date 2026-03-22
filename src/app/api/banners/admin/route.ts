import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function getSecretKey() {
  return process.env.SUPABASE_SECRET_KEY;
}

// GET all banners (admin)
export async function GET() {
  const secretKey = getSecretKey();
  if (!secretKey) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/smart_banners?select=*&order=priority.asc`,
    { headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` } }
  );
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}

// POST — create new banner
export async function POST(req: NextRequest) {
  const secretKey = getSecretKey();
  if (!secretKey) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/smart_banners`,
    {
      method: 'POST',
      headers: {
        'apikey': secretKey,
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}

// PATCH — update banner
export async function PATCH(req: NextRequest) {
  const secretKey = getSecretKey();
  if (!secretKey) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  updates.updated_at = new Date().toISOString();

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/smart_banners?id=eq.${id}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': secretKey,
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(updates),
    }
  );
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json(await res.json());
}

// DELETE — delete banner
export async function DELETE(req: NextRequest) {
  const secretKey = getSecretKey();
  if (!secretKey) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/smart_banners?id=eq.${id}`,
    {
      method: 'DELETE',
      headers: { 'apikey': secretKey, 'Authorization': `Bearer ${secretKey}` },
    }
  );
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: res.status });
  return NextResponse.json({ success: true });
}
