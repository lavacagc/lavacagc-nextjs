/**
 * Server-only read of a homeowner's saved "home facts" (My Home Systems), used
 * to prefill the inline capture panels and seed the "My Home" recap on the
 * checklist.
 *
 * This lives in its own module - NOT in records.ts - on purpose: records.ts is a
 * pure registry that client components import (getFactForTask, the consent text,
 * field shapes), so it must stay free of the service-role supabaseRest import.
 *
 * home_records is created by migration but applied to the real database only at
 * go-live, so this read is FAIL-SOFT: it returns [] on a missing secret key or
 * any Supabase error (including a 404 for a not-yet-created table), so the
 * checklist page renders normally before the table exists. Sensitive shut-off
 * data is never exposed to the browser - the read is server-side and the
 * homeowner id is the signed-in owner's, so a homeowner only ever sees their own.
 */
import { supabaseRest } from '@/lib/notify/supabase-rest';

export interface HomeRecordRow {
  fact_key: string;
  note: string | null;
  detail: Record<string, unknown>;
  updated_by: string;
}

export async function readHomeRecords(homeownerId: string): Promise<HomeRecordRow[]> {
  if (!process.env.SUPABASE_SECRET_KEY) return [];
  try {
    const rows = await supabaseRest<HomeRecordRow[]>(
      'GET',
      `home_records?select=fact_key,note,detail,updated_by&homeowner_id=eq.${encodeURIComponent(homeownerId)}`,
    );
    return Array.isArray(rows) ? rows : [];
  } catch {
    // Table not yet created (pre-go-live) or any transient Supabase error: the
    // checklist must still render, just without prefill. Never throws.
    return [];
  }
}
