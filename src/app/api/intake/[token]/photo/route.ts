/**
 * WEB-014. Photos of the space, attached to the lead.
 *
 * Server-side upload rather than the browser-direct pattern the warranty form
 * uses, because the intake bucket must not be writable by anyone holding the
 * publishable key. The token is the authorisation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { lookupByToken, recordPhoto, markOpened, countPhotos } from '@/lib/intake/session';
import { isTerminal } from '@/lib/intake/flow';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET = 'intake-photos';
/**
 * How long a freshly-signed photo URL stays valid. Long enough for the owner
 * to open the alert and look at the photos in the same sitting; short enough
 * that a URL leaking later (into analytics, a Referer header, a forwarded
 * email) is worth nothing (CM-10).
 */
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_FILES = 6;
/**
 * A ceiling on the whole session, not just one request.
 *
 * MAX_FILES bounds a single upload and the rate limit bounds how often, but
 * without this a token holder can keep uploading 6 at a time forever into a
 * public-read bucket. Twice the per-request limit is generous for a lead
 * photographing one room and still finite.
 */
const MAX_PER_SESSION = 12;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const rl = await checkRateLimit(`intake-photo:${getClientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many uploads. Give it a moment.' }, { status: 429 });
  }

  const found = await lookupByToken(token);
  if (found.state === 'unreadable') {
    return NextResponse.json(
      { error: "We couldn't reach our system just then. Your photos weren't uploaded - try again in a moment." },
      { status: 503 },
    );
  }
  if (found.state === 'missing') {
    return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
  }
  const session = found.session;

  // Same rule the answer route applies: a finished or declined conversation
  // takes nothing further. Alex has already been sent the brief.
  if (isTerminal(session.current_step)) {
    return NextResponse.json(
      { error: 'This conversation has already finished. Bring the photos to the call.' },
      { status: 409 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Malformed upload' }, { status: 400 });
  }

  const files = form.getAll('photos').filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: 'No photos supplied' }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `You can add up to ${MAX_FILES} photos at a time.` }, { status: 400 });
  }

  const already = await countPhotos(session.id);
  if (already + files.length > MAX_PER_SESSION) {
    return NextResponse.json(
      {
        error: `That's more than the ${MAX_PER_SESSION} photos we can take here. Show Alex the rest on the call.`,
      },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    console.error('[intake] photo upload attempted with no Supabase credentials');
    return NextResponse.json(
      { error: "We couldn't save those photos. You can bring them up on the call instead." },
      { status: 503 },
    );
  }
  const supabase = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });

  const uploaded: string[] = [];
  const failed: string[] = [];

  for (const file of files) {
    if (!ALLOWED.includes(file.type)) {
      failed.push(file.name);
      continue;
    }
    if (file.size > MAX_BYTES) {
      failed.push(file.name);
      continue;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const path = `${session.id}/${Date.now()}-${safeName}`;

    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);

      // CM-10: this used to call getPublicUrl, which mints a permanent
      // unauthenticated URL for a photo of the inside of a customer's home.
      // A signed URL expires, and - unlike the public one - it keeps working
      // after the bucket is made private by the accompanying migration
      // (20260809000000_chaos_hardening.sql), which is why the two must ship
      // together.
      //
      // storagePath is the durable reference; the signed URL is a temporary
      // view of it. Anything that needs to display a photo later should sign
      // the path again rather than storing a URL that outlives its own expiry.
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      await recordPhoto({
        sessionId: session.id,
        leadId: session.lead_id,
        storagePath: path,
        publicUrl: signed?.signedUrl ?? null,
      });
      uploaded.push(signed?.signedUrl ?? path);
    } catch (err) {
      console.error(`[intake] photo upload failed for ${file.name}:`, err);
      failed.push(file.name);
    }
  }

  await markOpened(session);

  // Partial success is reported as partial. Saying "3 photos added" when one
  // silently failed is the exact pattern this codebase keeps having to fix.
  if (uploaded.length === 0) {
    return NextResponse.json(
      { error: "None of those uploaded. You can show Alex on the call instead.", uploaded: 0, failed: failed.length },
      { status: 502 },
    );
  }

  return NextResponse.json({ uploaded: uploaded.length, failed: failed.length });
}
