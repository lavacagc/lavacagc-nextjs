import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function GET() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/leads?select=*&order=created_at.desc&limit=50`,
      {
        headers: {
          'apikey': secretKey,
          'Authorization': `Bearer ${secretKey}`,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
