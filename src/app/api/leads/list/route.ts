import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export async function GET() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  try {
    // 200, not 50: the client splits this one response into the Active AND
    // Archived tabs, so a low cap silently empties Archived once enough newer
    // active leads exist.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/leads?select=*&order=created_at.desc&limit=200`,
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
