/**
 * Record one answer and return the next question.
 *
 * POST only. No model call, no AI SDK import - the next question comes from
 * `buildStep`, which is pure data. That is the whole point of WEB-016: the flow
 * costs nothing to run and cannot say something nobody wrote.
 */
import { NextRequest, NextResponse } from 'next/server';
import { buildStep, nextStep, isTerminal, isValidAnswer, type FlowContext, type StepId } from '@/lib/intake/flow';
import { priceAnchorFor } from '@/lib/intake/pricing';
import { lookupByToken, recordAnswer, mirrorToLead, markOpened } from '@/lib/intake/session';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Carried forward from /api/chat, which is being deleted. Removing the model
 * removes the token spend but not the reasons to rate limit: these routes do
 * Supabase reads and writes for an unauthenticated caller.
 */
const RATE_LIMIT_MAX = 40;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

function contextOf(session: {
  first_name: string | null;
  project_type: string | null;
  answers: Record<string, string>;
}): FlowContext {
  return {
    firstName: session.first_name ?? '',
    projectType: session.project_type,
    town: session.answers.city ?? null,
    scope: session.answers.scope_tier ?? null,
    contactTime: session.answers.contact_time_preference ?? null,
  };
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const rl = await checkRateLimit(`intake:${getClientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Give it a moment.' }, { status: 429 });
  }

  let body: { answer?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }
  const answer = typeof body.answer === 'string' ? body.answer.trim() : '';
  if (!answer) return NextResponse.json({ error: 'No answer supplied' }, { status: 400 });

  const found = await lookupByToken(token);
  if (found.state === 'unreadable') {
    // Explicitly NOT 404. "We could not check your link" and "your link is not
    // valid" are different things and the lead deserves the true one.
    return NextResponse.json(
      { error: "We couldn't reach our system just then. Your answer wasn't saved - try again in a moment." },
      { status: 503 },
    );
  }
  if (found.state === 'missing') {
    return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
  }

  const session = found.session;
  if (isTerminal(session.current_step)) {
    return NextResponse.json({ error: 'This conversation has already finished.' }, { status: 409 });
  }

  const flowCtx = contextOf(session);
  const step = buildStep(session.current_step, flowCtx);

  if (!isValidAnswer(step, answer)) {
    return NextResponse.json({ error: 'That answer was not one of the options.' }, { status: 400 });
  }

  await markOpened(session);

  // The town answer decides whether the NEXT step greets them as a neighbour,
  // so it has to be in context before the next step is built.
  const advancedCtx: FlowContext = {
    ...flowCtx,
    ...(step.field === 'city' ? { town: answer } : {}),
    ...(step.field === 'scope_tier' ? { scope: answer } : {}),
    ...(step.field === 'contact_time_preference' ? { contactTime: answer } : {}),
  };

  const target: StepId = nextStep(session.current_step, answer, advancedCtx);
  const declined = target === 'declined';
  const terminal = isTerminal(target);

  try {
    await recordAnswer({
      session,
      field: step.field,
      value: answer,
      nextStep: target,
      terminal,
      declined,
    });
  } catch (err) {
    console.error('[intake] failed to record answer:', err);
    return NextResponse.json(
      { error: "That didn't save. Tap it again and it should go through." },
      { status: 503 },
    );
  }

  // Mirror onto the lead. Deliberately after the session write and deliberately
  // non-fatal: a lead row one field behind is recoverable, a conversation that
  // refuses to advance is not.
  await mirrorToLead(session.lead_id, step.field, answer);

  // Record what we actually told them about price, so a later disagreement can
  // be checked rather than argued about.
  if (target === 'price') {
    const anchor = priceAnchorFor(session.project_type);
    if (anchor) await mirrorToLead(session.lead_id, 'price_anchor_shown', anchor.amount);
  }

  const next = buildStep(target, advancedCtx);
  return NextResponse.json({ step: next, done: terminal });
}
