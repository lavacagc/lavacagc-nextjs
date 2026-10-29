/**
 * POST /api/experiments/notify { text } - the weekly agent posts its summary
 * to the operations Telegram chat (skill step "post the summary"). Plain
 * text, escaped here, at most 3,500 characters.
 * Answers { telegram: 'sent' | 'not_configured' | 'failed', text }.
 * Auth: ingest token or admin session, rate limited (src/lib/experiments/auth.server.ts).
 */
import { NextRequest, NextResponse } from 'next/server';
import { validationResponse } from '@/lib/projects/http';
import { escapeTelegram, sendTelegramMessage } from '@/lib/notify/telegramMessage';
import { authorizeExperiments, readOptionalJson } from '@/lib/experiments/auth.server';
import { notifySchema } from '@/lib/experiments/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const caller = await authorizeExperiments(request);
  if (caller.ok === false) return caller.response;
  const body = await readOptionalJson(request, 8 * 1024);
  if (body.ok === false) return body.response;
  const parsed = notifySchema.safeParse(body.value);
  if (!parsed.success) return validationResponse(parsed.error);
  const text = `<b>Experiments weekly</b> (${escapeTelegram(caller.by)})\n${escapeTelegram(parsed.data.text)}`;
  const telegram = await sendTelegramMessage(text);
  return NextResponse.json({ telegram, text });
}
