/**
 * POST /api/experiments/veto { token } - the one button on the veto page.
 *
 * Public by design (the Telegram link has to work from a phone lock screen):
 * the signed token is the credential (src/lib/experiments/vetoToken.ts,
 * timingSafeEqual, 7 days, only for the proposal it was sent for). POST only:
 * link previews and scanners GET every URL in a message, and a GET that vetoed
 * would cancel promotions nobody looked at (crew-confirm precedent).
 * Rate limited per IP, failing closed. Sends a Telegram confirmation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { readCappedJson } from '@/lib/cta/http';
import { vetoExperiment } from '@/lib/experiments/decide.server';
import { lookupVeto } from '@/lib/experiments/vetoLookup.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({ token: z.string().min(20).max(300) }).strict();

export async function POST(request: NextRequest) {
  const rl = await checkRateLimit(`exp-veto:${getClientIp(request)}`, 20, 10 * 60 * 1000, { failClosed: true });
  if (!rl.allowed) return NextResponse.json({ error: 'Too many attempts. Give it a moment and tap again.' }, { status: 429 });

  const body = await readCappedJson(request, 1024);
  if ('error' in body) return NextResponse.json({ error: body.error }, { status: body.status });
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: 'This link is not valid.' }, { status: 400 });

  try {
    const now = new Date();
    const found = await lookupVeto(parsed.data.token, now);
    if (found.ok === false) {
      const error = found.reason === 'not_pending' ? 'There is no promotion waiting on this link any more.' : 'This link is not valid or has expired.';
      return NextResponse.json({ error }, { status: 410 });
    }
    const result = await vetoExperiment(found.row, 'Telegram veto link', now);
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: 410 });
    return NextResponse.json({ vetoed: true, experiment: result.row.key, kept: result.row.control_key, telegram: result.telegram });
  } catch (err) {
    console.error('experiment veto failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
