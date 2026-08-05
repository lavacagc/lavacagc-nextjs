/**
 * POST /api/proposal/<token>/submit - the client's answer.
 *
 * Public, and self-guarded: the token is the whole authorisation, exactly as it
 * is for the page that posts here. Registered in the middleware's PUBLIC_ROUTES
 * alongside the other tokenized APIs so it can never be swept into the admin
 * gate by a later prefix rule.
 *
 * The refusals are kept apart on purpose, because they mean different things to
 * the person reading them:
 *   404 - unknown or revoked link. Generic, and identical for both: an answer
 *         that told them apart would let anyone test whether a token is live.
 *   400 - the payload broke a rule the client's own page cannot break (a locked
 *         line dropped, an id from somewhere else). Their page renders locked
 *         lines with no control, so this did not come from it.
 *   429 - too many attempts from one address.
 *   503 - OUR side failed. Never reported as a bad link.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, clientInetOrNull } from '@/lib/rateLimit';
import { ProposalSubmitSchema, submitProposal } from '@/lib/proposals/submit';
import { alertOwnerOfSubmission } from '@/lib/proposals/ownerAlert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * A client revising their mind is normal and allowed (owner decision D4), so
 * this is deliberately generous - it is a brake on a script, not on a customer.
 * Every attempt is charged, unlike the page view: a POST is a write.
 */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** The one sentence an unknown, revoked or mistyped link ever gets. */
const DEAD_END = 'This proposal link is no longer valid.';

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const rate = await checkRateLimit(
    `proposal-submit:${getClientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts just now. Give it a minute and try again.' },
      { status: 429, headers: rate.retryAfter ? { 'Retry-After': String(rate.retryAfter) } : undefined },
    );
  }

  const parsed = ProposalSubmitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'We could not read that selection.' }, { status: 400 });
  }

  const outcome = await submitProposal({
    token,
    input: parsed.data,
    ipAddress: clientInetOrNull(request),
    userAgent: request.headers.get('user-agent'),
  });

  switch (outcome.status) {
    case 'missing':
      return NextResponse.json({ error: DEAD_END }, { status: 404 });
    case 'refused':
      return NextResponse.json({ error: outcome.message }, { status: 400 });
    case 'unreadable':
      return NextResponse.json({
        error: 'Something went wrong at our end, not yours. Try again in a minute, or call us on (201) 212-4917.',
      }, { status: 503 });
    case 'ok': {
      // The submission is ALREADY stored. Alerting is what happens next, not a
      // condition of it: a client who has agreed has agreed, and an alert that
      // failed is our problem to notice in the log - never an error on their
      // screen that invites them to send the same agreement twice.
      const alert = await alertOwnerOfSubmission(outcome.record);
      if (alert.email !== 'sent' || alert.telegram !== 'sent') {
        console.error(
          `PROPOSAL SUBMISSION STORED BUT NOT FULLY ALERTED: proposal ${outcome.record.proposalId}, `
          + `${outcome.record.clientName}, total ${outcome.record.totalCents} cents. `
          + `email=${alert.email} telegram=${alert.telegram}`,
        );
      }
      return NextResponse.json({ ok: true, total_cents: outcome.record.totalCents });
    }
  }
}
