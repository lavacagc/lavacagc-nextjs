/**
 * Daily purge of home services photos nobody claimed (05:00 UTC, vercel.json).
 *
 * A photo is uploaded the moment it is picked, before a request exists (see
 * src/lib/home-services/photos.ts). One whose flow was abandoned, or that the
 * homeowner removed on screen, keeps request_id null forever. After 48 hours it
 * is deleted: the storage object first, then the row, so a failed object
 * delete leaves the row for the next run instead of an orphan nobody can find.
 *
 * Auth: CRON_SECRET bearer, enforced by middleware for every /api/cron/ path.
 * ?dry=1 reports what it would delete and deletes nothing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { DRAFT_TTL_HOURS, PHOTO_BUCKET, storageClient } from '@/lib/home-services/photos';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** One page per run is plenty at expected volume; a backlog drains over a few days. */
const PAGE = 500;

export async function GET(request: NextRequest) {
  const dry = request.nextUrl.searchParams.get('dry') === '1';
  const cutoff = new Date(Date.now() - DRAFT_TTL_HOURS * 60 * 60 * 1000).toISOString();
  try {
    const rows = await supabaseRest<Array<{ id: string; storage_path: string }>>(
      'GET',
      `lead_photos?select=id,storage_path&request_id=is.null&created_at=lt.${encodeURIComponent(cutoff)}&order=created_at.asc&limit=${PAGE}`,
    );
    if (!rows?.length || dry) {
      return NextResponse.json({ ok: true, dry, candidates: rows?.length ?? 0, deleted: 0 });
    }

    const storage = storageClient();
    if (!storage) return NextResponse.json({ ok: false, error: 'storage_not_configured' }, { status: 500 });

    const { error } = await storage.storage.from(PHOTO_BUCKET).remove(rows.map((r) => r.storage_path));
    if (error) {
      console.error('[cron/purge-draft-photos] object delete failed:', error.message);
      return NextResponse.json({ ok: false, error: 'object_delete_failed', candidates: rows.length }, { status: 502 });
    }
    // Still conditional on request_id null: a row claimed since the read is kept.
    await supabaseRest(
      'DELETE',
      `lead_photos?id=in.(${rows.map((r) => r.id).join(',')})&request_id=is.null`,
      undefined,
      { prefer: 'return=minimal' },
    );
    console.log(`[cron/purge-draft-photos] deleted ${rows.length} unclaimed photos older than ${DRAFT_TTL_HOURS}h`);
    return NextResponse.json({ ok: true, dry, candidates: rows.length, deleted: rows.length, more: rows.length === PAGE });
  } catch (err) {
    console.error('[cron/purge-draft-photos] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: 'purge_failed' }, { status: 500 });
  }
}
