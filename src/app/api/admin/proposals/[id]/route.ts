/**
 * POST /api/admin/proposals/[id] - lifecycle actions on one proposal:
 *   { action: 'send' }     -> deliver the email (when client_email exists) and
 *                             mark sent. Sending is also the un-revoke path.
 *                             Refused with 409 while CLIENT_PAGE_LIVE is false,
 *                             because the link it delivers has nowhere to land.
 *   { action: 'revoke' }   -> the D3 kill switch; the client link goes to the
 *                             generic dead end while status is 'revoked'.
 *   { action: 'reimport', lines: [...] } -> replace the line set with a newly
 *                             imported composition (same link, corrected
 *                             numbers). Old submissions stay readable through
 *                             their own snapshots.
 *
 * One route, explicit action verbs: the lifecycle is a single state machine
 * and its transitions belong together, mirrored on the roster's buttons.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseRest } from '@/lib/notify/supabase-rest';
import { createClient } from '@/lib/supabase/server';
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { cleanEnv } from '@/lib/envClean';
import {
  ProposalLinesSchema, ProposalConflictError, bundleSumError, markSent, replaceLines,
  revokeProposal, type ProposalRow,
} from '@/lib/proposals/store';
import { CLIENT_PAGE_LIVE, CLIENT_PAGE_NOT_LIVE_MESSAGE } from '@/lib/proposals/clientPage';
import { buildProposalDeliveryEmail, PROPOSAL_FROM } from '@/lib/proposals/deliveryEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({ action: z.literal('revoke') }),
  // The same bound the create path and the CSV parser hold: re-import is a
  // replacement, not a second door with a wider frame.
  z.object({ action: z.literal('reimport'), lines: ProposalLinesSchema }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // The reimport branch validates a whole line array here, so a bare
    // 'Invalid action' named neither the rule that failed nor the line that
    // broke it. The first issue's path does both, and the flattened detail
    // travels alongside it exactly as the sibling create route sends it.
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? issue.path.join('.') : null;
    return NextResponse.json({
      error: where ? `Invalid action: ${where} - ${issue.message}` : 'Invalid action',
      details: parsed.error.flatten(),
    }, { status: 400 });
  }

  try {
    // Inside the try, deliberately. supabaseRest throws on every non-2xx, and
    // catching that into `null` reported an outage - Supabase unreachable, a
    // missing SUPABASE_SECRET_KEY, a PostgREST 5xx - as 'No such proposal', on
    // the D3 kill switch, to an admin looking at the row on their roster. That
    // reads as data loss and leaves no log line to correct it. An outage falls
    // through to the catch below (logged, generic 500); 404 now means only what
    // it says, an empty result for an id that is not there.
    const rows = await supabaseRest<ProposalRow[]>('GET', `proposals?select=*&id=eq.${id}&limit=1`);
    const proposal = rows?.[0];
    if (!proposal) return NextResponse.json({ error: 'No such proposal' }, { status: 404 });

    switch (parsed.data.action) {
      case 'revoke': {
        await revokeProposal(id);
        return NextResponse.json({ ok: true, status: 'revoked' });
      }
      case 'reimport': {
        const sumError = bundleSumError(parsed.data.lines);
        if (sumError) return NextResponse.json({ error: sumError }, { status: 400 });
        await replaceLines(id, parsed.data.lines);
        return NextResponse.json({ ok: true });
      }
      case 'send': {
        // The email's whole payload is a link to /proposal/[token], which does
        // not exist until Slice 3. Refuse here rather than trusting the UI:
        // a mis-click must not be able to put a 404 in a client's inbox.
        if (!CLIENT_PAGE_LIVE) {
          return NextResponse.json({ error: CLIENT_PAGE_NOT_LIVE_MESSAGE }, { status: 409 });
        }
        const url = `${SITE_URL}/proposal/${proposal.token}`;
        // Email is optional (copy-link covers a client with no address), but
        // 'send' without one is a no-op worth saying out loud.
        if (!proposal.client_email) {
          return NextResponse.json({ error: 'No client email on this proposal - use Copy link instead.' }, { status: 400 });
        }
        // Middleware already confirmed the admin session; this is purely the
        // audit row's sent_by, per the sibling admin send routes.
        let sentBy: string | null = null;
        try {
          const supabase = await createClient();
          const { data: { user } } = await supabase.auth.getUser();
          sentBy = user?.email ?? null;
        } catch {
          // Non-fatal - the audit row just gets a null sent_by.
        }
        const { subject, html, text } = buildProposalDeliveryEmail({
          clientName: proposal.client_name,
          proposalTitle: proposal.title,
          proposalUrl: url,
          bookingUrl: cleanEnv(process.env.NEXT_PUBLIC_BOOKING_URL) || null,
        });
        const res = await sendTrackedEmail({
          from: PROPOSAL_FROM,
          to: proposal.client_email,
          subject,
          html,
          text,
          category: 'proposal_delivery',
          toName: proposal.client_name,
          leadId: proposal.lead_id,
          sentBy,
          campaign: { proposal_id: proposal.id },
        });
        if (res.status !== 'sent') {
          // Both fields, like the sibling send routes: a hard failure fills
          // `error`, but the likeliest outcome here - RESEND_API_KEY missing -
          // is a skip that fills only `reason`, and an admin told just
          // "(skipped)" has been told nothing.
          const detail = res.error || res.reason;
          return NextResponse.json({ error: `Email did not send (${res.status}${detail ? `: ${detail}` : ''})` }, { status: 502 });
        }
        // The email is out; the status write is what makes the record agree
        // with the client's inbox. Send stays FIRST (a failed send must never
        // leave a proposal reading 'sent'), which means this step can fail on
        // its own - and it must not report as an ordinary failed action, or the
        // admin retries believing nothing was delivered. Retrying IS the repair,
        // the owner accepts the duplicate email it may cost, and a proposal
        // still reading 'revoked' behind a link a client is holding is the one
        // outcome that is not acceptable.
        try {
          await markSent(id);
        } catch (err) {
          console.error(
            `proposal ${id} was delivered (email ${res.emailId ?? 'unknown'}) but its status could not be updated:`,
            err instanceof Error ? err.message : String(err),
          );
          return NextResponse.json({
            error: `The email WAS delivered, but the status could not be updated - this proposal still reads `
              + `"${proposal.status}". Press Send again to repair it; the client may receive a second copy.`,
            delivered: true,
          }, { status: 500 });
        }
        return NextResponse.json({ ok: true, status: 'sent' });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`proposal ${parsed.data.action} failed:`, message);
    // A refused state transition is the caller's conflict, not our outage, and
    // its message is written for the admin - so it is the one that travels.
    if (err instanceof ProposalConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    // Everything else is an outage. supabaseRest embeds the whole PostgREST
    // body in its message - table, column and constraint names - so what goes
    // back is generic and the detail stays in the server log.
    return NextResponse.json({ error: 'Could not complete that action' }, { status: 500 });
  }
}
