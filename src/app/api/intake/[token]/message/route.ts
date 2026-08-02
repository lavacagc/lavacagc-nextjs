/**
 * WEB-017. A lead typed something that is not an answer.
 *
 * This route is the reason the flow can be trusted: it stores the question,
 * routes it to Alex and Veronica, and replies with fixed words. It never
 * generates a reply, and it never claims a question reached a human when it did
 * not - the reply text branches on what actually happened.
 */
import { NextRequest, NextResponse } from 'next/server';
import { buildStep, normalizeIntakeText, type FlowContext } from '@/lib/intake/flow';
import { lookupByToken, recordOffScript, markRouted, markOpened } from '@/lib/intake/session';
import { routeOffScript, offScriptReply, reachedAHuman } from '@/lib/intake/offScript';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Tighter than the answer route: this one emails two people per call. */
const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

interface LeadContact {
  first_name: string | null;
  email: string | null;
  phone: string | null;
  project_type: string | null;
}

async function leadContact(leadId: string | null): Promise<LeadContact | null> {
  if (!leadId) return null;
  try {
    const rows = await supabaseRest<LeadContact[]>(
      'GET',
      `leads?id=eq.${leadId}&select=first_name,email,phone,project_type&limit=1`,
    );
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    console.error('[intake] could not read lead contact for off-script routing:', err);
    return null;
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const rl = await checkRateLimit(`intake-msg:${getClientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many messages. Give it a moment.' }, { status: 429 });
  }

  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? normalizeIntakeText(body.message).slice(0, 2000) : '';
  if (!message) return NextResponse.json({ error: 'Empty message' }, { status: 400 });

  const found = await lookupByToken(token);
  if (found.state === 'unreadable') {
    return NextResponse.json(
      { error: "We couldn't reach our system just then. Please ask that on the call, or ring (201) 212-4917." },
      { status: 503 },
    );
  }
  if (found.state === 'missing') {
    return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
  }

  const session = found.session;
  await markOpened(session);

  // Store first, route second. A routing failure with a stored row is
  // recoverable - lead_intake_events has a partial index on routed_at IS NULL
  // precisely so those can be found later.
  const eventId = await recordOffScript({
    sessionId: session.id,
    step: session.current_step,
    body: message,
  });

  const contact = await leadContact(session.lead_id);
  const outcome = await routeOffScript({
    firstName: contact?.first_name ?? session.first_name,
    email: contact?.email ?? null,
    phone: contact?.phone ?? null,
    projectType: contact?.project_type ?? session.project_type,
    question: message,
    intakeUrl: null,
  });

  const reached = reachedAHuman(outcome);
  if (reached && eventId) await markRouted(eventId);

  // Re-ask whatever they were on, so the thread picks up where it left off.
  const flowCtx: FlowContext = {
    firstName: session.first_name ?? '',
    projectType: session.project_type,
    town: session.answers.city ?? null,
    scope: session.answers.scope_tier ?? null,
    contactTime: session.answers.contact_time_preference ?? null,
  };
  const step = buildStep(session.current_step, flowCtx);

  return NextResponse.json({
    reply: offScriptReply(reached),
    step,
    routed: reached,
  });
}
