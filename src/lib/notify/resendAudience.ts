import { Resend } from 'resend';
import { cleanEnv } from '@/lib/envClean';
import {
  getSuppressedEmails,
  normalizeEmail,
  type SuppressionKey,
} from '@/lib/preferences/preferences';

/**
 * Resend audience ↔ preference-center two-way sync (Phase 2).
 *
 * Resend broadcasts send to an AUDIENCE, outside the sendTrackedEmail wrapper,
 * so the preference center's opt-outs can't gate them at send time. Resend does
 * natively skip contacts flagged `unsubscribed`, so we mirror our opt-out state
 * onto that flag.
 *
 * SUPPRESS-ONLY by design (CAN-SPAM safety): this periodic sync only ever ADDS
 * suppression (DB opt-out → unsubscribed:true). It NEVER clears `unsubscribed`,
 * because a Resend-side / Gmail native unsubscribe on a broadcast may not be
 * mirrored back into our DB reliably (the contact webhook is best-effort). A
 * blanket "re-subscribe anyone our DB thinks is subscribed" pass could therefore
 * resurrect a legitimate opt-out and resume emailing them — the exact leak this
 * change set exists to close. Re-subscription is only ever done through an
 * EXPLICIT affirmative opt-in (the double-opt-in verify flow → addOrUpdateResendContact
 * with unsubscribed:false), never inferred from an absence of DB suppression.
 *
 * All Resend calls are best-effort / fail-open: a Resend hiccup returns an
 * `error` result but never throws, so a cron tick or admin click can't 500 and
 * a user flow (contact creation) is never blocked.
 */

/** Env var holding the Resend audience id used by broadcasts (cron + contact upsert). */
export const RESEND_AUDIENCE_ENV = 'RESEND_AUDIENCE_ID';

export interface AudienceSyncResult {
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  error?: string;
  /** Marketing stream this sync mirrored (its opt-outs drive `unsubscribed`). */
  stream?: SuppressionKey;
  /** Total audience contacts examined across all pages. */
  checked: number;
  /** Contacts newly flagged unsubscribed:true (were subscribed, now opted out). */
  suppressed: number;
  /** Always 0 — this sync is suppress-only; re-subscription is explicit-opt-in only (see header). */
  resubscribed: number;
  /**
   * Always false — this sync now paginates through the entire audience, so
   * there is never a leftover page for the caller to chase. Retained for the
   * admin UI which reads it.
   */
  hasMore: boolean;

  // --- Legacy aliases (admin UI in vaca-mgmt/preferences reads these) ---
  /** Alias of `checked`. */
  audienceContacts: number;
  /** Alias of `suppressed`. */
  newlyUnsubscribed: number;
  /** Contacts already flagged unsubscribed that should stay suppressed. */
  alreadyUnsubscribed: number;
  /** Size of the DB opt-out set for this stream. */
  suppressedInDb: number;
}

function emptyResult(
  stream: SuppressionKey,
  status: AudienceSyncResult['status'],
  extra?: Partial<AudienceSyncResult>,
): AudienceSyncResult {
  return {
    status,
    stream,
    checked: 0,
    suppressed: 0,
    resubscribed: 0,
    hasMore: false,
    audienceContacts: 0,
    newlyUnsubscribed: 0,
    alreadyUnsubscribed: 0,
    suppressedInDb: 0,
    ...extra,
  };
}

// Defensive page cap: even if Resend ignores the `after` cursor for a legacy
// audience list, we never loop forever. 100/page × 200 pages = 20k contacts.
const PAGE_SIZE = 100;
const MAX_PAGES = 200;
// Pace actual contact updates (not reads) so a large batch of new suppressions
// can't trip Resend's rate limit — mirrors the ~1s pacing the send crons use,
// but shorter since these are cheap idempotent contact updates, not emails.
const UPDATE_DELAY_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mirror every opt-out / re-opt-in for `stream` onto the given Resend audience.
 *
 * Paginates through ALL contacts. Best-effort per contact (one failed update
 * does not abort the run). Returns a summary; `status:'error'` only when the
 * run could not start (no key / no id) or the very first list call failed.
 *
 * @param audienceId Resend audience id.
 * @param stream Marketing stream whose opt-outs drive the `unsubscribed` flag.
 *   Defaults to 'announcements' (the broadcast stream) for backward compat with
 *   the admin sync button, which calls this with only an audience id.
 */
export async function syncAudienceSuppression(
  audienceId: string,
  stream: SuppressionKey = 'announcements',
): Promise<AudienceSyncResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) return emptyResult(stream, 'skipped', { reason: 'no_api_key' });
  if (!audienceId) return emptyResult(stream, 'error', { error: 'audienceId required' });

  try {
    const resend = new Resend(apiKey);
    const suppressed = new Set(
      (await getSuppressedEmails(stream)).map((e) => normalizeEmail(e)),
    );

    let checked = 0;
    let suppressedCount = 0;
    const resubscribed = 0; // suppress-only sync — never re-subscribes (see header)
    let already = 0;

    let after: string | undefined;
    let firstError: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const opts: { audienceId: string; limit: number; after?: string } = {
        audienceId,
        limit: PAGE_SIZE,
      };
      if (after) opts.after = after;

      const list = await resend.contacts.list(opts);
      if (list.error) {
        // First-page failure is fatal (nothing synced); a mid-run failure is
        // logged and we return what we managed so far.
        if (page === 0) return emptyResult(stream, 'error', { error: list.error.message });
        firstError = list.error.message;
        break;
      }

      const contacts = list.data?.data ?? [];
      if (contacts.length === 0) break;

      for (const c of contacts) {
        if (!c.email) continue;
        checked += 1;
        const isSuppressed = suppressed.has(normalizeEmail(c.email));
        try {
          if (isSuppressed && !c.unsubscribed) {
            await resend.contacts.update({ audienceId, id: c.id, unsubscribed: true });
            suppressedCount += 1;
            await sleep(UPDATE_DELAY_MS); // only paces real updates, not reads
          } else if (isSuppressed && c.unsubscribed) {
            already += 1;
          }
          // Deliberately NO re-subscribe branch: never clear `unsubscribed` from a
          // periodic sweep (see file header). A contact NOT in our opt-out set is
          // left exactly as Resend has them — if Resend has them unsubscribed, we
          // respect that; only an explicit opt-in re-subscribes them.
        } catch (e) {
          console.error(
            'resend contact update failed (non-fatal):',
            e instanceof Error ? e.message : e,
          );
        }
      }

      // Advance the cursor. Guard against an API that ignores `after` (would
      // otherwise re-serve page 0 forever) by breaking when the cursor stalls.
      if (!list.data?.has_more) break;
      const lastId = contacts[contacts.length - 1]?.id;
      if (!lastId || lastId === after) break;
      after = lastId;
    }

    return {
      status: 'ok',
      stream,
      reason: firstError ? 'partial' : undefined,
      error: firstError,
      checked,
      suppressed: suppressedCount,
      resubscribed,
      hasMore: false,
      audienceContacts: checked,
      newlyUnsubscribed: suppressedCount,
      alreadyUnsubscribed: already,
      suppressedInDb: suppressed.size,
    };
  } catch (err) {
    return emptyResult(stream, 'error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Add (or update) a contact in the broadcast audience. Called when a new
 * subscriber becomes active so a fresh opt-in shows up as a Resend contact
 * (otherwise broadcasts would never reach them).
 *
 * Best-effort and non-throwing: reads the audience id from env; if key/id are
 * missing or the API errors, it logs and returns without raising — a caller can
 * fire-and-forget it in a subscribe flow without risking the response.
 *
 * SUPPRESS-ONLY (CAN-SPAM invariant, matches syncAudienceSuppression): this
 * helper NEVER writes `unsubscribed:false`. `opts.unsubscribed:true` suppresses;
 * anything else leaves the flag alone. A brand-new contact is created without
 * the flag (Resend defaults it to subscribed, correct for a fresh opt-in), and
 * an EXISTING contact's flag is never cleared — because a Resend/Gmail-native
 * unsubscribe may not have been mirrored into our DB, so we must not resurrect
 * it. Re-subscription only ever happens by an explicit action in Resend itself.
 *
 * Strategy: try `create`; on conflict (contact exists) fall back to `update` by
 * email — only ever adding suppression, never removing it.
 */
export async function addOrUpdateResendContact(
  rawEmail: string,
  opts: { firstName?: string | null; unsubscribed?: boolean } = {},
): Promise<void> {
  try {
    const apiKey = cleanEnv(process.env.RESEND_API_KEY);
    const audienceId = cleanEnv(process.env[RESEND_AUDIENCE_ENV]);
    if (!apiKey || !audienceId) return; // Not configured — silently skip.

    const email = normalizeEmail(rawEmail);
    if (!email || !email.includes('@')) return;

    const resend = new Resend(apiKey);
    const firstName = opts.firstName ?? undefined;
    // Suppress-only: only ever set unsubscribed:true, never false.
    const suppress = opts.unsubscribed === true;

    const created = await resend.contacts.create({
      audienceId,
      email,
      ...(firstName ? { firstName } : {}),
      ...(suppress ? { unsubscribed: true } : {}),
    });

    // Already exists (or any create error) → update by email as a fallback.
    // Only push a suppression; never clear an existing unsubscribed flag.
    if (created.error) {
      await resend.contacts.update({
        audienceId,
        email,
        ...(firstName ? { firstName } : {}),
        ...(suppress ? { unsubscribed: true } : {}),
      });
    }
  } catch (e) {
    console.error(
      'addOrUpdateResendContact failed (non-fatal):',
      e instanceof Error ? e.message : e,
    );
  }
}
