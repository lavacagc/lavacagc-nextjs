/**
 * Home Care "My Home Systems" retention purge (Slice 8).
 *
 * The consent text and privacy policy v2.4 promise that saved home details are
 * "deleted when you leave the program". Unsubscribing does NOT delete the
 * homeowners row (it only sets status='unsubscribed'), so the schema's
 * ON DELETE CASCADE never fires on an ordinary leave - this module is the
 * explicit enforcement. It deletes the homeowner's home_records rows. Photos
 * join in Slice 7 when that table exists.
 *
 * The home_record_access_log rows are deliberately KEPT on an ordinary leave -
 * the owner's explicit 2026-07-16 decision (reversing the initial purge-it
 * call): the audit trail of who viewed a record is accountability data about
 * STAFF, stores fact categories only (never values), and losing it on
 * unsubscribe would let a badly-timed exit erase evidence of staff access. The
 * promise "deleted when you leave" covers the home DETAILS, which do go. On a
 * true homeowners-row deletion (e.g. a CCPA delete request) the log still goes
 * with it via ON DELETE CASCADE - the stronger case keeps the stronger wipe.
 *
 * Call site - the single path where a homeowner DELIBERATELY leaves the
 * program: syncLegacyStatus in src/lib/preferences/preferences.ts. Every leave
 * funnels through applyUpdate -> syncLegacyStatus: the token-bearing preference
 * center, admin Subscriptions, and the legacy /api/home-care/unsubscribe footer
 * link, whose GET mutates nothing and instead redirects to the preference
 * center's confirm prompt (a link scanner presents a genuine token with no
 * human behind it, so a token alone must not start an irreversible delete).
 * A manual homeowners-row deletion still purges via the FK cascade.
 *
 * INTENT GATE (owner decision 2026-07-16): syncLegacyStatus purges only when
 * the acting party is a human choosing to leave AND their identity is proven -
 * actor 'self' (the homeowner, established by a capability token only their
 * inbox holds) or 'admin' (an authenticated staff member acting for them).
 * It deliberately does NOT purge for:
 *   - 'webhook' / 'system': Resend's auto-suppression turns every marketing
 *     stream off on a hard bounce, a spam complaint about an unrelated
 *     newsletter, or an admin tidying up a Resend contact. None of those is the
 *     homeowner leaving.
 *   - 'self_unverified': the public, tokenless /api/preferences/
 *     unsubscribe-by-email route, where the address is merely CLAIMED. Honoring
 *     an unproven claim is right for suppression (idempotent, reversible,
 *     required by CAN-SPAM without a token) but not for an irreversible delete:
 *     otherwise an anonymous POST of a victim's address would destroy their
 *     records.
 *   - 'self_oneclick': the RFC 8058 List-Unsubscribe=One-Click POST from a mail
 *     client's native Unsubscribe button. The token proves identity, but the
 *     marketing link turns off ALL streams (the click may have meant only a
 *     newsletter or listings list) and the button lives inside the mail client,
 *     so the deletion warning can never be shown first. It suppresses the mail
 *     but must not delete - the purge stays on the preference-center confirm.
 * Each of these would otherwise irreversibly destroy the shut-off maps and
 * appliance details the homeowner saved. They all still suppress the mail (the
 * homeowners status flip is unconditional) - they just don't delete the data.
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
import { supabaseRest, isMissingTableError } from '@/lib/notify/supabase-rest';

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
 * Delete every saved home detail for one homeowner. The staff access log is
 * deliberately NOT touched (see the module comment). Never throws; a real
 * failure alerts internally and returns ok: false.
 */
export async function purgeHomeRecords(homeownerId: string, trigger: string): Promise<PurgeOutcome> {
  const outcome: PurgeOutcome = { ok: true, purgedRecords: 0 };
  if (!homeownerId) return outcome;
  try {
    // select=id keeps the DELETE's return representation to ids only - the
    // purge must never echo sensitive values into logs or alerts.
    outcome.purgedRecords = await deleteReturningIds(
      `home_records?homeowner_id=eq.${encodeURIComponent(homeownerId)}&select=id`,
    );
    if (outcome.purgedRecords > 0) {
      console.log(
        `home-care retention purge (${trigger}): homeowner ${homeownerId} - ` +
          `${outcome.purgedRecords} record(s) deleted`,
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
        `after they left the program. Re-run the purge or delete home_records rows for this ` +
        `homeowner manually. Error: ${message.slice(0, 300)}`,
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
  const outcome: PurgeOutcome = { ok: true, purgedRecords: 0 };
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
  }
  return outcome;
}
