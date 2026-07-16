import { NextRequest, NextResponse } from 'next/server';
import { findHomeownerByUnsubscribeToken } from '@/lib/homecare/homeowners';
import { getOrCreateByEmail } from '@/lib/preferences/preferences';

/**
 * Legacy one-click Home Care unsubscribe link (still live in the footer of
 * every Home Care email).
 *
 *   GET ?token=… → mutates NOTHING. Resolves the unsubscribe token read-only
 *        and redirects to the preference center with a confirm prompt for the
 *        Home Care stream; the actual leave (status flip + retention purge)
 *        happens on the confirmed POST, which carries the tokened identity AND
 *        a human's intent. Same rule and same destination as
 *        /api/preferences/unsubscribe.
 *
 * A GET that acted on the token would unsubscribe people who never clicked:
 * mail-client prefetchers and corporate link scanners (SafeLinks, Mimecast,
 * Proofpoint URL Defense) fetch every footer URL with browser-like user agents,
 * so the bot filter does not stop them. A genuine token with zero human intent
 * used to cost a recoverable status flip; since the Slice 8 retention purge it
 * would irreversibly delete the homeowner's saved home details, so the leave
 * cannot start here.
 *
 * The hc_access / hc_known cookies are deliberately left alone: nothing has
 * happened yet, and clearing them would sign a homeowner out of their portal
 * for merely opening the link. Once they do leave, the cookie grants nothing -
 * every consumer re-checks that the homeowner is still active.
 *
 * Public route (declared in middleware PUBLIC_ROUTES); auth is the token.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get('token');
  const invalid = () => NextResponse.redirect(new URL('/preferences?invalid=1', origin));

  if (!token) return invalid();
  try {
    const ho = await findHomeownerByUnsubscribeToken(token);
    if (!ho) return invalid();
    // Every email carrying this link builds its "manage preferences" URL with
    // preferencesUrlFor, so the row already exists; the create is an idempotent
    // fallback (all streams on = the identity-model default), never a
    // consequential mutation.
    const pref = await getOrCreateByEmail(ho.email);
    const dest = `/preferences?token=${encodeURIComponent(pref.preference_token)}&confirm=home_care`;
    return NextResponse.redirect(new URL(dest, origin));
  } catch (error) {
    console.error('Home Care unsubscribe link error:', error);
    return invalid();
  }
}
