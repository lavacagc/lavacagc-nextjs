/**
 * Home Care "My Home Systems" retention purge (Slice 8).
 *
 * The consent text and privacy policy v2.4 promise that saved home details are
 * "deleted when you leave the program". Unsubscribing does NOT delete the
 * homeowners row (it only sets status='unsubscribed'), so the schema's
 * ON DELETE CASCADE never fires on an ordinary leave - this module is the
 * explicit enforcement. It deletes the homeowner's home_records rows AND their
 * home_record_access_log rows (the access log references them and carries no
 * independent value once the record is gone; keeping it would contradict
 * "deleted when you leave"). Photos join in Slice 7 when that table exists.
 *
 * Call sites - every path that takes a homeowner OUT of the program:
 *   1. /api/home-care/unsubscribe (the legacy one-click link)
 *   2. syncLegacyStatus in src/lib/preferences/preferences.ts (preference
 *      center, unsubscribe-by-email, admin Subscriptions, Resend webhook -
 *      they all funnel through applyUpdate -> syncLegacyStatus)
 * A manual homeowners-row deletion still purges via the FK cascade.
 *
 * FAILURE POSTURE: never throws - an unsubscribe must always complete (the
 * opt-out is legally required to stick even if cleanup hiccups). But a failed
 * purge silently breaking the deletion promise is not acceptable either, so a
 * real failure console.errors AND fires the internal form-failure alert
 * (in-process, never a self-fetch) so it gets fixed the same day. A missing
 * table (404 / undefined_table) is NOT a failure: pre-go-live there is nothing
 * to purge, and the whole slice batch deploys together.
 *
 * Re-consent stays coherent: after a purge there are no homeowner-authored
 * rows left, so if the homeowner ever re-joins, both the client recap and the
 * server-side consent check (updated_by=eq.homeowner) require fresh consent
 * before anything is stored again (Slice 3 decision c/d).
 */
import { supabaseRest } from '@/lib/notify/supabase-rest';

/**
 * Lazy alert dispatch: preferences.ts imports this module, and the alert
 * pipeline (formErrorAlert -> sendEmail) imports preferences.ts back - a
 * static import here would close that cycle. The alert only matters on the
 * rare failure path, so resolve it at call time; never throws.
 */
async function alertPurgeFailure(payload: {
  source: string;
  message: string;
  lead?: { email?: string };
}): Promise<void> {
  try {
    const { sendFormFailureAlert } = await import('@/lib/notify/formErrorAlert');
    await sendFormFailureAlert({
      stage: 'home-care-retention-purge',
      severity: 'failure',
      ...payload,
    });
  } catch (err) {
    console.error('home-care retention purge alert failed:', err instanceof Error ? err.message : String(err));
  }
}

export interface PurgeOutcome {
  ok: boolean;
  purgedRecords: number;
  purgedAccessLogRows: number;
}

/** True for "the table isn't there yet" errors - nothing to purge, not a failure. */
function isMissingTableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(' 404 ') || msg.includes('42P01') || /relation .* does not exist/i.test(msg);
}

async function deleteReturningIds(path: string): Promise<number> {
  try {
    const rows = await supabaseRest<{ id: string }[]>('DELETE', path);
    return Array.isArray(rows) ? rows.length : 0;
  } catch (err) {
    if (isMissingTableError(err)) return 0;
    throw err;
  }
}

/**
 * Delete every saved home detail (and its access-log trail) for one homeowner.
 * Never throws; a real failure alerts internally and returns ok: false.
 */
export async function purgeHomeRecords(homeownerId: string, trigger: string): Promise<PurgeOutcome> {
  const outcome: PurgeOutcome = { ok: true, purgedRecords: 0, purgedAccessLogRows: 0 };
  if (!homeownerId) return outcome;
  try {
    // select=id keeps the DELETE's return representation to ids only - the
    // purge must never echo sensitive values into logs or alerts.
    outcome.purgedRecords = await deleteReturningIds(
      `home_records?homeowner_id=eq.${encodeURIComponent(homeownerId)}&select=id`,
    );
    outcome.purgedAccessLogRows = await deleteReturningIds(
      `home_record_access_log?homeowner_id=eq.${encodeURIComponent(homeownerId)}&select=id`,
    );
    if (outcome.purgedRecords > 0 || outcome.purgedAccessLogRows > 0) {
      console.log(
        `home-care retention purge (${trigger}): homeowner ${homeownerId} - ` +
          `${outcome.purgedRecords} record(s), ${outcome.purgedAccessLogRows} access-log row(s) deleted`,
      );
    }
    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`home-care retention purge FAILED (${trigger}) for homeowner ${homeownerId}:`, message);
    // The deletion promise is broken until someone reruns this - alert loudly.
    await alertPurgeFailure({
      source: trigger,
      message:
        `Retention purge failed for homeowner ${homeownerId} - saved home details may still exist ` +
        `after they left the program. Re-run the purge or delete home_records/home_record_access_log ` +
        `rows for this homeowner manually. Error: ${message.slice(0, 300)}`,
    });
    return { ...outcome, ok: false };
  }
}

/**
 * Same purge, addressed by email (the preference pipeline only knows the
 * email). Resolves every matching homeowner id first; a lookup failure is
 * handled with the same loud-but-never-throwing posture.
 */
export async function purgeHomeRecordsByEmail(email: string, trigger: string): Promise<PurgeOutcome> {
  const outcome: PurgeOutcome = { ok: true, purgedRecords: 0, purgedAccessLogRows: 0 };
  const normalized = email.trim().toLowerCase();
  if (!normalized) return outcome;
  let ids: string[] = [];
  try {
    const rows = await supabaseRest<{ id: string }[]>(
      'GET',
      `homeowners?email=eq.${encodeURIComponent(normalized)}&select=id`,
    );
    ids = (rows ?? []).map((r) => r.id);
  } catch (err) {
    if (isMissingTableError(err)) return outcome;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`home-care retention purge FAILED (${trigger}) resolving ${normalized}:`, message);
    await alertPurgeFailure({
      source: trigger,
      message:
        `Retention purge could not resolve homeowner for an unsubscribed email - saved home details ` +
        `may still exist. Purge manually for this address. Error: ${message.slice(0, 300)}`,
      lead: { email: normalized },
    });
    return { ...outcome, ok: false };
  }
  for (const id of ids) {
    const one = await purgeHomeRecords(id, trigger);
    outcome.ok = outcome.ok && one.ok;
    outcome.purgedRecords += one.purgedRecords;
    outcome.purgedAccessLogRows += one.purgedAccessLogRows;
  }
  return outcome;
}
