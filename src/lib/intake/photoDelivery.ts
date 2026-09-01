import { createClient } from '@supabase/supabase-js';
import { cleanEnv } from '@/lib/envClean';
import { supabaseRest } from '@/lib/notify/supabase-rest';

/**
 * Deliver a lead's intake photos to the owner's Telegram.
 *
 * The completion alert has always SAID how many photos a lead attached
 * ("Photos 2 attached") without ever attaching them, so the only way to see
 * them was a database query. This sends the actual images.
 *
 * SIGNED, NOT PUBLIC. The stored `public_url` on each row points into a bucket
 * that is world-readable today, and there is a pending change that makes it
 * private (chaos finding CM-10). Building against those stored URLs would work
 * now and break silently the day that ships. So a fresh signed URL is minted
 * from `storage_path` at send time, which works in BOTH states - signing an
 * object in a public bucket is valid - and the stored URL is only a fallback
 * for a row that predates `storage_path`.
 *
 * The link only has to survive Telegram fetching it, which happens within
 * seconds, so the expiry is deliberately short. Once Telegram has the file it
 * hosts its own copy, and the message keeps working long after the link dies.
 */

/** Telegram accepts at most 10 media items in one group. */
const MAX_PER_GROUP = 10;
/** Long enough for Telegram to fetch, short enough that a leaked link is inert. */
const SIGNED_TTL_SECONDS = 10 * 60;

interface PhotoRow {
  storage_path: string | null;
  public_url: string | null;
}

export interface PhotoDeliveryResult {
  status: 'sent' | 'skipped' | 'failed';
  count: number;
  reason?: string;
}

/** Rows for a session, oldest first, bounded - a session caps at 12 uploads. */
async function readPhotoRows(sessionId: string): Promise<PhotoRow[]> {
  return (await supabaseRest<PhotoRow[]>(
    'GET',
    `lead_intake_photos?select=storage_path,public_url&session_id=eq.${sessionId}&order=created_at.asc&limit=${MAX_PER_GROUP}`,
  )) ?? [];
}

/** A URL Telegram can fetch, preferring a freshly signed one. */
async function urlFor(row: PhotoRow): Promise<string | null> {
  const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const secretKey = cleanEnv(process.env.SUPABASE_SECRET_KEY);
  if (row.storage_path && supabaseUrl && secretKey) {
    try {
      const supabase = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
      const { data } = await supabase.storage
        .from('intake-photos')
        .createSignedUrl(row.storage_path, SIGNED_TTL_SECONDS);
      if (data?.signedUrl) return data.signedUrl;
    } catch {
      // Fall through to the stored URL rather than dropping the photo.
    }
  }
  return row.public_url;
}

/**
 * Send every photo on a session as one Telegram album.
 *
 * Returns rather than throws: photos are a bonus on top of an alert that has
 * already been delivered, and a failure here must never turn a captured lead
 * into an error. The caller logs the result.
 */
export async function sendIntakePhotos(
  sessionId: string,
  caption: string,
): Promise<PhotoDeliveryResult> {
  const botToken = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);
  if (!botToken || !chatId) return { status: 'skipped', count: 0, reason: 'not_configured' };

  let rows: PhotoRow[];
  try {
    rows = await readPhotoRows(sessionId);
  } catch (err) {
    return { status: 'failed', count: 0, reason: err instanceof Error ? err.message : String(err) };
  }
  if (rows.length === 0) return { status: 'skipped', count: 0, reason: 'no_photos' };

  const urls = (await Promise.all(rows.map(urlFor))).filter((u): u is string => Boolean(u));
  if (urls.length === 0) return { status: 'skipped', count: 0, reason: 'no_reachable_urls' };

  // The caption rides on the FIRST item only - Telegram shows one caption per
  // album, and repeating it on every photo renders it once anyway while making
  // the payload larger.
  const media = urls.map((url, i) => ({
    type: 'photo' as const,
    media: url,
    ...(i === 0 ? { caption, parse_mode: 'HTML' as const } : {}),
  }));

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMediaGroup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, media }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { status: 'failed', count: 0, reason: `HTTP ${res.status} ${body.slice(0, 160)}` };
    }
    return { status: 'sent', count: urls.length };
  } catch (err) {
    return { status: 'failed', count: 0, reason: err instanceof Error ? err.message : String(err) };
  }
}
