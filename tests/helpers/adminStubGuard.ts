/**
 * Guard for admin browser suites that authenticate via the local GoTrue stub.
 *
 * release-notes and preferences-ui-fixes reach /vaca-mgmt pages by running a
 * GoTrue stand-in on 127.0.0.1:9099 and planting a fabricated session cookie -
 * which only works when the app server was STARTED with
 * NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9099, so middleware's getUser()
 * hits the stub. Against a server wired to the real Supabase, middleware
 * correctly 401s the fabricated token and every admin test fails - an
 * environment mismatch, not a product bug, and historically a flake (it
 * passed or failed depending on which previously-started server was still
 * alive via reuseExistingServer).
 *
 * probeStubWired() settles it deterministically: one request to an
 * admin-gated page with the fabricated cookie. 200 = the server trusts the
 * stub (run the suite); anything else = skip with a message that says exactly
 * how to run these tests.
 */

export const GOTRUE_STUB_PORT = 9099;

export const STUB_SKIP_REASON =
  'App server is not wired to the 127.0.0.1:9099 GoTrue stub, so middleware rejects the fabricated ' +
  'admin session. To run the admin browser flows, start the server with ' +
  'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9099 npm run start (build first), then re-run this spec.';

/** The fabricated Supabase session cookie value middleware will try to verify. */
export function fabricatedAdminCookie(): { name: string; value: string } {
  const session = {
    access_token: 'stub-access-token',
    refresh_token: 'stub-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated' },
  };
  return {
    // supabase-js default storage key for http://127.0.0.1:9099
    name: 'sb-127-auth-token',
    value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
  };
}

/**
 * True when the running app server verifies the fabricated cookie against the
 * local stub (i.e. an admin page answers 200 instead of middleware's 401).
 * The caller must have the stub listening on GOTRUE_STUB_PORT first.
 */
export async function probeStubWired(baseURL: string): Promise<boolean> {
  const cookie = fabricatedAdminCookie();
  try {
    const res = await fetch(`${baseURL}/vaca-mgmt/releases`, {
      headers: { cookie: `${cookie.name}=${cookie.value}` },
      redirect: 'manual',
    });
    return res.status === 200;
  } catch {
    return false;
  }
}
