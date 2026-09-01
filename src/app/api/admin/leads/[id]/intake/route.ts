import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cleanEnv } from '@/lib/envClean';
import { supabaseRest } from '@/lib/notify/supabase-rest';

/**
 * GET /api/admin/leads/[id]/intake
 *
 * Everything a lead told us in the intake chat, for the panel inside the lead
 * card. Until now this data had no reader at all: the answers, the sentences
 * leads typed themselves and their photos were all captured correctly and then
 * only reachable by querying the database by hand.
 *
 * Admin-gated by middleware (/api/admin/ requires a Supabase session), and
 * server-side because it reads with the secret key and mints signed photo URLs.
 *
 * Photo links are SIGNED and short-lived rather than the stored public ones.
 * The bucket is world-readable today and a pending change makes it private
 * (chaos finding CM-10); signing works in both states, so this panel keeps
 * working across that change instead of breaking the day it ships. It also
 * means a link copied out of the admin stops working shortly after, which is
 * the right default for photographs of the inside of somebody's house.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f-]{36}$/i;
/** Long enough to browse the panel, short enough that a copied link goes stale. */
const SIGNED_TTL_SECONDS = 30 * 60;
/** A session caps at 12 uploads; this is the bound on what we will ever render. */
const MAX_PHOTOS = 12;

interface SessionRow {
  id: string;
  current_step: string | null;
  answers: Record<string, unknown> | null;
  created_at: string;
}
interface EventRow { kind: string; step: string | null; body: string | null; created_at: string }
interface PhotoRow { storage_path: string | null; public_url: string | null; created_at: string }

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });

  try {
    const sessions = await supabaseRest<SessionRow[]>(
      'GET',
      `lead_intake_sessions?select=id,current_step,answers,created_at&lead_id=eq.${id}&order=created_at.desc&limit=1`,
    );
    const session = sessions?.[0];
    // No session is the ordinary case, not an error - most leads never enter
    // the chat. The panel renders nothing for these.
    if (!session) return NextResponse.json({ hasIntake: false });

    const [events, photoRows] = await Promise.all([
      supabaseRest<EventRow[]>(
        'GET',
        `lead_intake_events?select=kind,step,body,created_at&session_id=eq.${session.id}&order=created_at.asc&limit=50`,
      ),
      supabaseRest<PhotoRow[]>(
        'GET',
        `lead_intake_photos?select=storage_path,public_url,created_at&session_id=eq.${session.id}&order=created_at.asc&limit=${MAX_PHOTOS}`,
      ),
    ]);

    const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const secretKey = cleanEnv(process.env.SUPABASE_SECRET_KEY);
    const storage = supabaseUrl && secretKey
      ? createClient(supabaseUrl, secretKey, { auth: { persistSession: false } }).storage.from('intake-photos')
      : null;

    const photos = await Promise.all(((photoRows ?? []).map(async (p) => {
      if (storage && p.storage_path) {
        try {
          const { data } = await storage.createSignedUrl(p.storage_path, SIGNED_TTL_SECONDS);
          if (data?.signedUrl) return { url: data.signedUrl, uploadedAt: p.created_at };
        } catch {
          // fall through to the stored URL rather than hiding the photo
        }
      }
      return { url: p.public_url, uploadedAt: p.created_at };
    })));

    return NextResponse.json({
      hasIntake: true,
      startedAt: session.created_at,
      complete: session.current_step === 'done',
      answers: session.answers ?? {},
      // What they typed in their own words - routinely the most useful thing
      // in the record, and the part no structured field captures.
      inTheirWords: (events ?? [])
        .filter((e) => e.kind === 'off_script' && e.body)
        .map((e) => ({ step: e.step, body: e.body as string, at: e.created_at })),
      photos: photos.filter((p) => p.url),
    });
  } catch (err) {
    console.error('lead intake read failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not load the intake for this lead' }, { status: 500 });
  }
}
