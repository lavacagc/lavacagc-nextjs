import { Resend } from 'resend';
import { cleanEnv } from '@/lib/envClean';
import { getSuppressedEmails, normalizeEmail } from '@/lib/preferences/preferences';

/**
 * Broadcast suppression (Phase 3, option B).
 *
 * Resend broadcasts send to an AUDIENCE, outside the sendTrackedEmail wrapper,
 * so the preference center's `announcements` opt-out can't gate them there.
 * Resend does natively skip contacts flagged `unsubscribed`, so the fix is to
 * mirror our opt-outs onto that flag: run this before a broadcast (or on a
 * schedule) and every contact who turned off "News & offers" is marked
 * unsubscribed in the audience, so the broadcast passes them by.
 *
 * Idempotent — contacts already unsubscribed are left alone.
 */

export interface AudienceSyncResult {
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  audienceContacts?: number;
  suppressedInDb?: number;
  newlyUnsubscribed?: number;
  alreadyUnsubscribed?: number;
  hasMore?: boolean;
  error?: string;
}

export async function syncAudienceSuppression(audienceId: string): Promise<AudienceSyncResult> {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) return { status: 'skipped', reason: 'no_api_key' };
  if (!audienceId) return { status: 'error', error: 'audienceId required' };

  try {
    const resend = new Resend(apiKey);
    const suppressed = new Set(
      (await getSuppressedEmails('announcements')).map((e) => normalizeEmail(e)),
    );

    const list = await resend.contacts.list({ audienceId });
    if (list.error) return { status: 'error', error: list.error.message };
    const contacts = list.data?.data ?? [];

    let newly = 0;
    let already = 0;
    for (const c of contacts) {
      if (!c.email || !suppressed.has(normalizeEmail(c.email))) continue;
      if (c.unsubscribed) {
        already += 1;
        continue;
      }
      await resend.contacts.update({ audienceId, id: c.id, unsubscribed: true });
      newly += 1;
    }

    return {
      status: 'ok',
      audienceContacts: contacts.length,
      suppressedInDb: suppressed.size,
      newlyUnsubscribed: newly,
      alreadyUnsubscribed: already,
      // Resend paginates; for our audience sizes one page is expected. Surface
      // the flag so the caller (and admin UI) can tell if a follow-up is needed.
      hasMore: !!list.data?.has_more,
    };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
