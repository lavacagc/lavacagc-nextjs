/**
 * Record one answer and return the next question.
 *
 * POST only. No model call, no AI SDK import - the next question comes from
 * `buildStep`, which is pure data. That is the whole point of WEB-016: the flow
 * costs nothing to run and cannot say something nobody wrote.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  buildStep, nextStep, isTerminal, isValidAnswer, normalizeIntakeText,
  type FlowContext, type StepId,
} from '@/lib/intake/flow';
import { priceAnchorFor } from '@/lib/intake/pricing';
import { lookupByToken, recordAnswer, mirrorToLead, markOpened, countPhotos, recordRouting } from '@/lib/intake/session';
import { scoreIntake, routeIntake } from '@/lib/intake/scoring';
import { sendCompletionAlert } from '@/lib/intake/completionAlert';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

interface LeadContact {
  first_name: string | null;
  email: string | null;
  phone: string | null;
  project_type: string | null;
}

/** Best-effort. A missing phone number must not cost us the whole brief. */
async function leadContact(leadId: string | null): Promise<LeadContact | null> {
  if (!leadId) return null;
  try {
    const rows = await supabaseRest<LeadContact[]>(
      'GET',
      `leads?id=eq.${leadId}&select=first_name,email,phone,project_type&limit=1`,
    );
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    console.error('[intake] could not read lead contact for the completion brief:', err);
    return null;
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Carried forward from /api/chat, which this replaces. Removing the model
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
  // Normalised before anything else looks at it, so the value validated, the
  // value stored and the value read back in the brief are the same string.
  const answer = typeof body.answer === 'string' ? normalizeIntakeText(body.answer) : '';
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

  // The brief. Awaited, not fire-and-forget: a serverless response that returns
  // first kills the outbound fetch, which is how these go missing on Vercel.
  //
  // Only on a real completion. A lead who declined at the consent step told us
  // nothing new, and the new-lead alert already went out at submit time.
  if (terminal && !declined) {
    const answers = { ...session.answers, ...(step.field ? { [step.field]: answer } : {}) };
    const anchor = priceAnchorFor(session.project_type);
    const [contact, photoCount] = await Promise.all([
      leadContact(session.lead_id),
      countPhotos(session.id),
    ]);

    // WEB-019 and WEB-01A. Scored on what the lead actually told us, not on the
    // submit-time guess, and the decision is written down before it is acted on
    // so a lead cannot be routed with no record of where or why.
    const scored = scoreIntake({ answers, photoCount });
    const decision = routeIntake(scored);
    await recordRouting({
      leadId: session.lead_id,
      score: scored.score,
      bucket: decision.bucket,
      signals: scored.signals,
      routedTo: decision.routedTo,
      reason: decision.reason,
    });

    const outcome = await sendCompletionAlert({
      firstName: contact?.first_name ?? session.first_name,
      projectType: contact?.project_type ?? session.project_type,
      answers,
      phone: contact?.phone ?? null,
      email: contact?.email ?? null,
      photoCount,
      priceAnchor: answers.price_reaction ? anchor?.amount ?? null : null,
      routing: { bucket: decision.bucket, score: scored.score },
    });
    if (outcome !== 'sent') {
      // Loud, because the whole point of the flow is that the call is informed.
      console.error(`[intake] completion alert for session ${session.id} was ${outcome}`);
    }
  }

  const next = buildStep(target, advancedCtx);
  return NextResponse.json({ step: next, done: terminal });
}
