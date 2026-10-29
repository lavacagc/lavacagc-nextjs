/**
 * /api/admin/subs - the sub roster (AD5).
 *
 * GET   every sub, with compliance flags (insurance / HIC expired) computed on
 *       the same New Jersey calendar the bid eligibility uses.
 * POST  add a sub.
 * PATCH edit any field, including approve / suspend.
 *
 * Admin auth is enforced by middleware on /api/admin/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { COUNTIES, TRADE_LABEL } from '@/lib/home-services/catalog';
import { complianceFlags, todayInNewJersey, type SubRow } from '@/lib/home-services/offerRules';
import { SUB_COLUMNS } from '@/lib/home-services/offers';
import { isSpecNookConfigured } from '@/lib/specnook/client';
import { readJson, serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TRADES = Object.keys(TRADE_LABEL) as [string, ...string[]];
const dateOrNull = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates are YYYY-MM-DD'), z.literal(''), z.null()])
  .transform((v) => (v ? v : null));

const fields = {
  business_name: z.string().trim().min(1, 'Business name is required').max(160),
  contact_name: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  email: z.union([z.string().trim().email('That email does not look right').max(200), z.literal('')]),
  trades: z.array(z.enum(TRADES)).max(TRADES.length),
  counties: z.array(z.enum(COUNTIES)).max(COUNTIES.length),
  language: z.enum(['en', 'es']),
  status: z.enum(['pending', 'approved', 'suspended']),
  specnook_sub_id: z.union([z.string().trim().max(120), z.null()]).transform((v) => (v ? v : null)),
  insurance_expires_at: dateOrNull,
  hic_expires_at: dateOrNull,
  notes: z.string().max(4000),
};

const createSchema = z.object({
  ...fields,
  contact_name: fields.contact_name.default(''),
  phone: fields.phone.default(''),
  email: fields.email.default(''),
  trades: fields.trades.default([]),
  counties: fields.counties.default([]),
  language: fields.language.default('en'),
  status: fields.status.default('pending'),
  specnook_sub_id: fields.specnook_sub_id.default(null),
  insurance_expires_at: fields.insurance_expires_at.default(null),
  hic_expires_at: fields.hic_expires_at.default(null),
  notes: fields.notes.default(''),
}).refine((s) => s.email || s.phone, { message: 'Give at least a phone or an email, or offers cannot reach them' });

const updateSchema = z.object({ id: z.string().uuid() }).extend(
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])) as { [K in keyof typeof fields]: z.ZodOptional<(typeof fields)[K]> },
);

function withFlags(sub: SubRow, today: string) {
  return { ...sub, ...complianceFlags(sub, today) };
}

export async function GET() {
  try {
    const subs = (await supabaseRest<SubRow[]>('GET', `subs?select=${SUB_COLUMNS}&order=business_name.asc&limit=1000`)) ?? [];
    const today = todayInNewJersey();
    return NextResponse.json({ subs: subs.map((s) => withFlags(s, today)), today, specnook: isSpecNookConfigured() });
  } catch (err) {
    return serverError('Could not load subs', err);
  }
}

export async function POST(request: NextRequest) {
  const read = await readJson(request, 16 * 1024);
  if (read.ok === false) return read.response;
  const parsed = createSchema.safeParse(read.body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const [created] = await supabaseRest<SubRow[]>('POST', `subs?select=${SUB_COLUMNS}`, [{
      ...parsed.data, email: parsed.data.email.toLowerCase(),
    }]);
    return NextResponse.json({ sub: withFlags(created, todayInNewJersey()) }, { status: 201 });
  } catch (err) {
    return serverError('Could not add the sub', err);
  }
}

export async function PATCH(request: NextRequest) {
  const read = await readJson(request, 16 * 1024);
  if (read.ok === false) return read.response;
  const parsed = updateSchema.safeParse(read.body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(clean).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  if (typeof clean.email === 'string') clean.email = clean.email.toLowerCase();
  if (clean.business_name === '') return NextResponse.json({ error: 'Business name is required' }, { status: 400 });
  try {
    const rows = await supabaseRest<SubRow[]>('PATCH', `subs?id=eq.${id}&select=${SUB_COLUMNS}`, clean);
    if (!rows || rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ sub: withFlags(rows[0], todayInNewJersey()) });
  } catch (err) {
    return serverError('Could not update the sub', err);
  }
}
