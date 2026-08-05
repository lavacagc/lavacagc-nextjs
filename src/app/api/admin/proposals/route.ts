/**
 * GET  /api/admin/proposals - the roster (proposal + line/submission counts).
 * POST /api/admin/proposals - create a proposal from the import preview's
 *                             final composition (lines + bundles), draft status.
 *
 * Admin auth is enforced by middleware on /api/admin/* (any admin session -
 * proposals are ordinary admin scope, unlike the Home Records allowlist).
 * Everything money-shaped is validated here AND by the schema's own CHECKs,
 * so a malformed write dies with a readable message first and a named
 * constraint second.
 */
import { NextRequest, NextResponse } from 'next/server';
import { CreateProposalSchema, bundleSumError, createProposal, listProposals } from '@/lib/proposals/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // counts_available travels with the rows: the roster degrades to "counts
    // unknown" rather than to an outage, so the lifecycle buttons stay reachable
    // when only the aggregate is down.
    const { proposals, counts_available } = await listProposals();
    return NextResponse.json({ proposals, counts_available });
  } catch (err) {
    console.error('proposal roster read failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not load proposals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = CreateProposalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid proposal', details: parsed.error.flatten() }, { status: 400 });
  }
  const sumError = bundleSumError(parsed.data.lines);
  if (sumError) return NextResponse.json({ error: sumError }, { status: 400 });
  try {
    const proposal = await createProposal(parsed.data);
    return NextResponse.json({ ok: true, id: proposal.id, token: proposal.token });
  } catch (err) {
    console.error('proposal create failed:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Could not create the proposal' }, { status: 500 });
  }
}
