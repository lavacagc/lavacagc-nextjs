/**
 * PATCH /api/admin/cta/settings - { cta_min_visitors } on site_settings.
 *
 * The leader is only named once every active variant has at least this many
 * views. Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMinVisitors, setMinVisitors } from '@/lib/cta/admin.server';
import { readCappedJson } from '@/lib/cta/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const settingsSchema = z.object({
  cta_min_visitors: z.number().int().min(1).max(1_000_000),
}).strict();

export async function GET() {
  try {
    return NextResponse.json({ cta_min_visitors: await getMinVisitors() });
  } catch (err) {
    console.error('cta settings read failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not load settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await readCappedJson(request, 1024);
  if ('error' in body) return NextResponse.json({ error: body.error }, { status: body.status });
  const parsed = settingsSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Minimum visitors must be a whole number from 1 to 1,000,000', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    await setMinVisitors(parsed.data.cta_min_visitors);
    return NextResponse.json({ status: 'updated', cta_min_visitors: parsed.data.cta_min_visitors });
  } catch (err) {
    console.error('cta settings update failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not save settings' }, { status: 500 });
  }
}
