/**
 * POST /api/admin/proposals/[id] - lifecycle actions on one proposal:
 *   { action: 'send' }     -> deliver the email (when client_email exists) and
 *                             mark sent. Sending is also the un-revoke path.
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
import { sendTrackedEmail } from '@/lib/notify/sendEmail';
import { cleanEnv } from '@/lib/envClean';
import {
  ProposalLineInputSchema, bundleSumError, markSent, replaceLines, revokeProposal,
  type ProposalRow,
} from '@/lib/proposals/store';
import { buildProposalDeliveryEmail, PROPOSAL_FROM } from '@/lib/proposals/deliveryEmail';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SITE_URL = cleanEnv(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.lavacagc.com';

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({ action: z.literal('revoke') }),
  z.object({ action: z.literal('reimport'), lines: z.array(ProposalLineInputSchema).min(1) }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const rows = await supabaseRest<ProposalRow[]>('GET', `proposals?select=*&id=eq.${id}&limit=1`).catch(() => null);
  const proposal = rows?.[0];
  if (!proposal) return NextResponse.json({ error: 'No such proposal' }, { status: 404 });

  try {
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
        const url = `${SITE_URL}/proposal/${proposal.token}`;
        // Email is optional (copy-link covers a client with no address), but
        // 'send' without one is a no-op worth saying out loud.
        if (!proposal.client_email) {
          return NextResponse.json({ error: 'No client email on this proposal - use Copy link instead.' }, { status: 400 });
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
          campaign: { proposal_id: proposal.id },
        });
        if (res.status !== 'sent') {
          return NextResponse.json({ error: `Email did not send (${res.status}${res.error ? `: ${res.error}` : ''})` }, { status: 502 });
        }
        await markSent(id);
        return NextResponse.json({ ok: true, status: 'sent' });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`proposal ${parsed.data.action} failed:`, message);
    // A refused state transition is the caller's conflict, not our outage.
    const conflict = message.includes('revoked - re-send');
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 500 });
  }
}
