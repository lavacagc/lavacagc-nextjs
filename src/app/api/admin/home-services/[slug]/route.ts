/**
 * PATCH /api/admin/home-services/[slug] - save one service from the Services &
 * Prices editor (docs/phase-2/acceptance-criteria.md, CAT2 to CAT5).
 *
 * The body is validated whole by ServicePatchSchema before anything is
 * written; a 400 carries `fieldErrors` keyed by field for the form. A save
 * stamps `updated_at` and `updated_by` (the admin's user id), then expires the
 * catalog cache and revalidates the landing page, the service pages and the
 * sitemap, so the next request shows the change.
 *
 * Admin auth is enforced by middleware on /api/admin/* (CAT8).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { isServiceSlug } from '@/lib/home-services/catalog';
import { HOME_SERVICE_COLUMNS, type HomeServiceRow } from '@/lib/home-services/catalogRow';
import { invalidateCatalog } from '@/lib/home-services/catalogData';
import { fieldErrors, ServicePatchSchema } from '@/lib/home-services/catalogSchema';
import { actingAdminId, readJson, serverError } from '@/lib/home-services/adminRoute';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Params = Promise<{ slug: string }>;

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const { slug } = await params;
  if (!isServiceSlug(slug)) return NextResponse.json({ error: 'Unknown service' }, { status: 404 });

  const read = await readJson(request, 64 * 1024);
  if (read.ok === false) return read.response;
  const parsed = ServicePatchSchema.safeParse(read.body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Fix the highlighted fields', fieldErrors: fieldErrors(parsed.error) }, { status: 400 });
  }

  try {
    const updatedBy = await actingAdminId();
    const rows = await supabaseRest<HomeServiceRow[]>(
      'PATCH',
      `home_services?slug=eq.${slug}&select=${HOME_SERVICE_COLUMNS}`,
      { ...parsed.data, updated_at: new Date().toISOString(), updated_by: updatedBy },
    );
    const service = rows?.[0];
    if (!service) return NextResponse.json({ error: 'Unknown service' }, { status: 404 });
    invalidateCatalog();
    return NextResponse.json({ service });
  } catch (err) {
    return serverError('Could not save the service', err);
  }
}
