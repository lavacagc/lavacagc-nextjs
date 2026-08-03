/**
 * Server-only read of a homeowner's saved "home facts" (My Home Systems), used
 * to prefill the inline capture panels and seed the "My Home" recap on the
 * checklist (readHomeRecords), and to attach the booked services' saved details
 * to the booking owner-alert (readBookedHomeDetails, Slice 5).
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
import { HOME_FACTS, getFactForTask, factValueSummary } from '@/lib/homecare/records';

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

/**
 * The saved home details relevant to a set of booked task keys, formatted as
 * "Label: value" lines for the booking owner-alert rider (Slice 5).
 *
 * The homeowner id MUST come from the caller's verified hc_access cookie, never
 * from the client payload - a client must not be able to name someone else's
 * home and exfiltrate their shut-off locations through the owner alert. Sensitive
 * data is read server-side and rendered only into La Vaca's internal alert; it
 * never reaches the browser or the leads table.
 *
 * Scoping: each booked task key maps to its canonical fact via getFactForTask
 * (many aliased task keys collapse onto one fact), and only saved rows whose
 * fact_key is in that booked set ride along - a homeowner's other saved details
 * stay off a booking that didn't request the related service. De-duplicated by
 * fact and emitted in registry order. Fail-soft: returns [] on no cookie, no
 * booked tasks, no matching facts, or any Supabase error (readHomeRecords).
 */
export async function readBookedHomeDetails(
  homeownerId: string,
  bookedTaskKeys: string[],
): Promise<string[]> {
  if (!homeownerId || !bookedTaskKeys.length) return [];
  const neededFactKeys = new Set<string>();
  for (const tk of bookedTaskKeys) {
    const fact = getFactForTask(tk);
    if (fact) neededFactKeys.add(fact.key);
  }
  if (!neededFactKeys.size) return [];

  const rows = await readHomeRecords(homeownerId);
  if (!rows.length) return [];
  const byFactKey = new Map(rows.map((r) => [r.fact_key, r]));

  const lines: string[] = [];
  // Iterate the registry so the order is stable and matches the recap, and so a
  // single fact reached by multiple booked tasks appears at most once.
  for (const fact of HOME_FACTS) {
    if (!neededFactKeys.has(fact.key)) continue;
    const row = byFactKey.get(fact.key);
    if (!row) continue;
    const summary = factValueSummary(fact, { note: row.note, detail: row.detail ?? {} }).trim();
    if (!summary) continue;
    lines.push(`${fact.label}: ${summary}`);
  }
  return lines;
}
