/**
 * GET /api/home-care/visit.ics
 *
 * The CUSTOMER's calendar file, downloaded from their portal.
 *
 * Deliberately the 'customer' variant: no VALARM blocks at all. The owner's
 * copy carries two internal ops alarms ("text the customer when the crew is on
 * the way"), and those must never reach a customer. Generating the customer's
 * copy from a separate endpoint that hard-codes the variant makes that
 * impossible rather than merely unlikely.
 *
 * Cookie-gated to a Home Care member, like the rest of the portal.
 */
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { HC_ACCESS_COOKIE, verifyHomeAccess } from '@/lib/homecare/accessCookie';
import { buildIcs } from '@/lib/homecare/ics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const access = await verifyHomeAccess(cookieStore.get(HC_ACCESS_COOKIE)?.value);
  if (!access) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const q = request.nextUrl.searchParams;
  const start = q.get('start');
  const end = q.get('end');
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }
  const startAt = new Date(start);
  const endAt = new Date(end);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return NextResponse.json({ error: 'Invalid window' }, { status: 400 });
  }

  const ics = buildIcs({
    uid: `lavaca-visit-${access.homeownerId}-${startAt.getTime()}`,
    start: startAt,
    end: endAt,
    services: (q.get('services') || 'Home Care visit').split('|').filter(Boolean).slice(0, 20),
    address: (q.get('address') || '').slice(0, 300),
    customerName: '',
    // 'customer' guarantees no VALARM and no internal contact detail.
    variant: 'customer',
  });

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lavaca-visit.ics"',
      'Cache-Control': 'no-store',
    },
  });
}
