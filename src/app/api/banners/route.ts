import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// GET — public, returns enabled banners (cached 60s)
export async function GET() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/smart_banners?select=*&enabled=eq.true&order=priority.asc`,
      {
        headers: {
          'apikey': secretKey,
          'Authorization': `Bearer ${secretKey}`,
        },
        next: { revalidate: 60 },
      }
    );

    if (!res.ok) return NextResponse.json([], { status: 200 });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
