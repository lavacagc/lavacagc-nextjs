/**
 * POST /api/admin/proposals/[id] - lifecycle actions on one proposal:
 *   { action: 'send' }     -> deliver the email (when client_email exists) and
 *                             mark sent. Sending is also the un-revoke path.
 *                             Refused with 409 while CLIENT_PAGE_LIVE is false,
 *                             because the link it delivers has nowhere to land.
 *   { action: 'revoke' }   -> the D3 kill switch; the client link goes to the
 *                             generic dead end while status is 'revoked'.
 *   { action: 'restore' }  -> revoked back to draft. Revoking was always meant
 *                             to be reversible, and re-sending cannot do it
 *                             while there is no client page to send to, so this
 *                             is the door that does not depend on Slice 3.
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
  restoreProposal, revokeProposal, touchProposal, type ProposalRow,
} from '@/lib/proposals/store';
import { CLIENT_PAGE_LIVE, CLIENT_PAGE_NOT_LIVE_MESSAGE } from '@/lib/proposals/clientPage';
import { DRAFT_LINK_LIFETIME_MS } from '@/lib/proposals/publicView';
import { buildProposalDeliveryEmail, PROPOSAL_FROM } from '@/lib/proposals/deliveryEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';

/** The draft window in the unit an admin reads, from the one constant that owns it. */
const DRAFT_WINDOW_HOURS = Math.round(DRAFT_LINK_LIFETIME_MS / (60 * 60 * 1000));

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({ action: z.literal('revoke') }),
  z.object({ action: z.literal('restore') }),
  // Move a DRAFT's link window forward without mailing anybody. Copy link
  // sends this before it copies, so what an admin pastes into a text message
  // resolves for the full window rather than however much of it was left.
  z.object({ action: z.literal('refresh') }),
  // The same bound the create path and the CSV parser hold: re-import is a
  // replacement, not a second door with a wider frame.
  z.object({ action: z.literal('reimport'), lines: ProposalLinesSchema }),
]);

/**
 * The real UUID shape, not "36 characters of hex and dashes".
 *
 * The loose form let ids Postgres cannot cast - `------...`, 36 bare hex digits -
 * through to the database, where PostgREST's `invalid input syntax for type
 * uuid` throws into the catch below and answers 500 'Could not complete that
 * action': an outage message, and a logged error, for what is only a malformed
 * id. 400 catches it here without a round trip, so the 500 keeps meaning what it
 * now says.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });

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
      case 'restore': {
        // The way back from the kill switch that does not need a client page to
        // exist. Re-import stays refused while a proposal is revoked (a dead
        // link must not be repointed) - this is what makes it a draft again so
        // it can be corrected and sent when Slice 3 lands.
        await restoreProposal(id);
        return NextResponse.json({ ok: true, status: 'draft' });
      }
      case 'refresh': {
        // Copy link's companion, and the remedy for a draft whose window has
        // run out. Before this existed, an admin hand-delivering a link (a text
        // message, a WhatsApp, reading it down the phone) had no way to make a
        // stale draft resolve again except Send, which mails the client, or
        // Re-import, which needs a CSV they may not have to hand.
        //
        // Draft only, and refused rather than ignored on anything else: a sent
        // proposal's link has no expiry under D3 so there is no window to move,
        // and a revoked one must not be quietly revived by a button whose whole
        // promise is that it changes nothing a client can see. Both would
        // otherwise "succeed" while doing nothing the admin asked for.
        if (proposal.status !== 'draft') {
          return NextResponse.json({
            error: proposal.status === 'revoked'
              ? 'This proposal is revoked - restore it to draft before refreshing its link.'
              : 'A sent proposal\'s link does not expire, so there is nothing to refresh.',
          }, { status: 409 });
        }
        // Best effort, and reported honestly. The link may already be dead, and
        // an admin told "refreshed" over a failed write would paste it anyway.
        const moved = await touchProposal(id, 'draft');
        if (!moved) {
          return NextResponse.json({
            error: `Could not refresh this link - it may still be expired. Try again before sharing it.`,
          }, { status: 502 });
        }
        return NextResponse.json({ ok: true, window_hours: DRAFT_WINDOW_HOURS });
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
        // FIRST, before anything is delivered: move the row's updated_at, which
        // is what the client link's draft window is measured from. A draft
        // built earlier in the week is already past that window when Send is
        // pressed, and the write that would have moved it - markSent - is
        // exactly the write whose failure below leaves the proposal reading
        // 'draft' behind a link the client is now holding. Doing it here means
        // a delivered link is live for the full window whatever fails after it.
        //
        // Best effort, like the sentBy lookup: an admin who asked to send a
        // proposal must not be refused because the lifetime of the link could
        // not be improved. It reports whether it landed, because the failure
        // branch below can only describe the client's access honestly if it
        // knows.
        const windowRefreshed = await touchProposal(id, proposal.status);
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
          // What the CLIENT sees while it is unrepaired, chosen from what was
          // actually established rather than from the status alone. The refresh
          // above is a PATCH on this same row seconds earlier, so the outage
          // that brought execution here is the one most likely to have taken it
          // too - and a sentence promising a day of slack that does not exist is
          // worse on this screen than admitting the uncertainty, because this is
          // where an admin decides whether to pick the phone up.
          const clientImpact = (() => {
            if (proposal.status === 'sent') {
              // D3: a sent link has no expiry. What is stale is the record.
              return `Their link keeps working - a sent proposal's link does not expire - so what needs `
                + `repairing is the record, not their access.`;
            }
            if (proposal.status === 'revoked') {
              return `Their link does NOT open while it reads that way - repair it now.`;
            }
            if (windowRefreshed) {
              return `Their link opens for ${DRAFT_WINDOW_HOURS} hours from this send; repair the status `
                + `before that runs out.`;
            }
            return `The write that keeps a draft's link alive did not land either, so they may be holding `
              + `a link that does not open right now - pressing Send again repairs both the status and `
              + `their access.`;
          })();
          return NextResponse.json({
            error: `The email WAS delivered, but the status could not be updated - this proposal still reads `
              + `"${proposal.status}". ${clientImpact} Press Send again to repair it; the client may `
              + `receive a second copy.`,
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
