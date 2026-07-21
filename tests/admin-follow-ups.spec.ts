import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import http from 'http';
import path from 'path';
import { mkdirSync } from 'fs';

/**
 * Admin Follow-Ups page reads the drip queue through the SERVER route.
 *
 * The bug: `follow_up_queue` RLS grants SELECT to the `anon` role but not the
 * logged-in `authenticated` role the admin browser uses, so a direct browser
 * read returned 0 rows and the "Active drips" dashboard showed all zeros even
 * though pending drips existed. The fix routes admin access through
 * /api/admin/follow-ups (service key, bypasses RLS), so the page now populates
 * and the per-person "Stop drip" control persists through the same API.
 *
 * This spec renders the real page the same way the other /vaca-mgmt admin tests
 * do: NEXT_PUBLIC_SUPABASE_URL is baked to a local GoTrue stub (127.0.0.1:9099)
 * and a fabricated session cookie makes middleware's getUser() succeed. The
 * /api/admin/follow-ups JSON is mocked at the browser network layer with a
 * prod-shaped queue (5 people, 7 pending emails, 1 review sequence) so we can
 * screenshot the dashboard populated instead of zeroed, and prove "Stop drip"
 * POSTs the correct sequence-scoped action.
 */

const EVIDENCE_DIR =
  process.env.EVIDENCE_DIR || 'test-results/admin-follow-ups-evidence';
mkdirSync(EVIDENCE_DIR, { recursive: true });
const shot = (name: string) => path.join(EVIDENCE_DIR, name);

interface QueueRow {
  id: string;
  lead_email: string;
  lead_name: string | null;
  follow_up_type: string;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
  email_subject: string;
  email_body: string;
  created_at: string;
}

/** A realistic queue: 5 distinct people, 7 pending emails, exactly 1 review
 *  sequence — plus already-sent rows the anon role could see but that must NOT
 *  count as active drips. buildActiveDrips filters these to the pending ones. */
function prodShapedQueue(): QueueRow[] {
  const now = Date.now();
  const hrs = (h: number) => new Date(now + h * 3_600_000).toISOString();
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
  const base = {
    sent_at: null,
    email_subject: 'Your Lavaca remodel',
    email_body: 'Body',
    created_at: daysAgo(3),
  };
  const pending = (
    id: string,
    email: string,
    name: string,
    type: string,
    inHrs: number,
  ): QueueRow => ({
    id,
    lead_email: email,
    lead_name: name,
    follow_up_type: type,
    scheduled_at: hrs(inHrs),
    status: 'pending',
    ...base,
  });
  const sent = (id: string, email: string, name: string, type: string): QueueRow => ({
    id,
    lead_email: email,
    lead_name: name,
    follow_up_type: type,
    scheduled_at: daysAgo(1),
    status: 'sent',
    ...base,
    sent_at: daysAgo(1),
  });

  return [
    // Sarah — lead nurture, 2 pending
    pending('1', 'sarah.chen@example.com', 'Sarah Chen', '24h', 5),
    pending('2', 'sarah.chen@example.com', 'Sarah Chen', '48h', 30),
    // Mike — lead nurture, 1 pending
    pending('3', 'mike.rivera@example.com', 'Mike Rivera', '7d', 100),
    // Priya — lead nurture, 2 pending
    pending('4', 'priya.patel@example.com', 'Priya Patel', 'instant_ack', 1),
    pending('5', 'priya.patel@example.com', 'Priya Patel', '24h', 26),
    // Tom — lead nurture, 1 pending
    pending('6', 'tom.becker@example.com', 'Tom Becker', '48h', 40),
    // Janet — review request, 1 pending (the single review sequence)
    pending('7', 'janet.wu@example.com', 'Janet Wu', 'feedback_day3', 60),
    // Already-sent rows: visible in the raw queue but never an active drip.
    sent('8', 'sarah.chen@example.com', 'Sarah Chen', 'instant_ack'),
    sent('9', 'archived@example.com', 'Old Lead', '7d'),
    sent('10', 'archived2@example.com', 'Older Lead', '48h'),
  ];
}

test.describe('admin /vaca-mgmt/follow-ups', () => {
  const STUB_PORT = 9099;
  let stub: http.Server;

  test.beforeAll(async () => {
    // Minimal GoTrue stand-in: middleware's supabase.auth.getUser() hits
    // GET /auth/v1/user; any authenticated user unlocks the admin page.
    stub = http.createServer((req, res) => {
      if (req.url?.startsWith('/auth/v1/user')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: '00000000-0000-0000-0000-000000000001',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'admin@lavacagc.com',
            created_at: '2026-01-01T00:00:00Z',
            app_metadata: {},
            user_metadata: {},
          }),
        );
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        await new Promise<void>((resolve, reject) => {
          stub.once('error', reject);
          stub.listen(STUB_PORT, '127.0.0.1', () => {
            stub.removeAllListeners('error');
            resolve();
          });
        });
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || Date.now() > deadline) throw err;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  });

  test.afterAll(async () => {
    await new Promise((resolve) => stub.close(resolve));
  });

  async function signInAsAdmin(context: BrowserContext, baseURL: string) {
    const session = {
      access_token: 'stub-access-token',
      refresh_token: 'stub-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated' },
    };
    await context.addCookies([
      {
        name: 'sb-127-auth-token',
        value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
        url: baseURL,
      },
    ]);
  }

  test('populates the active-drips dashboard from the server route (not zeros)', async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);

    // The admin browser never reads follow_up_queue directly anymore — the page
    // fetches GET /api/admin/follow-ups. Serve the prod-shaped queue here.
    await page.route('**/api/admin/follow-ups', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { rows: prodShapedQueue() } });
        return;
      }
      await route.fulfill({ json: { stopped: 0 } });
    });

    await page.goto('/vaca-mgmt/follow-ups');

    await expect(page.getByText('Follow-Up Management')).toBeVisible();

    // The three stat cards must reflect the real drips, not 0/0/0.
    await expect(page.getByText('People on drips')).toBeVisible();
    await expect(page.getByText('Emails pending')).toBeVisible();
    await expect(page.getByText('Review sequences')).toBeVisible();
    // Assert the headline numbers 5 / 7 / 1 render.
    await expect(page.locator('p.text-2xl', { hasText: /^5$/ })).toBeVisible();
    await expect(page.locator('p.text-2xl', { hasText: /^7$/ })).toBeVisible();
    await expect(page.locator('p.text-2xl', { hasText: /^1$/ })).toBeVisible();

    // Each person on a drip is listed.
    for (const name of ['Sarah Chen', 'Mike Rivera', 'Priya Patel', 'Tom Becker', 'Janet Wu']) {
      await expect(page.getByText(name).first()).toBeVisible();
    }
    // The single review sequence is labelled as such.
    await expect(page.getByText('Review requests').first()).toBeVisible();
    // Already-sent / unrelated addresses are NOT surfaced as active drips.
    await expect(page.getByText('archived@example.com')).toHaveCount(0);

    await page.screenshot({ path: shot('01-active-drips-populated.png'), fullPage: true });
  });

  test('Stop drip persists through the server API with the right sequence', async ({ page, context, baseURL }) => {
    await signInAsAdmin(context, baseURL!);

    // Auto-accept the "Stop the lead nurture drip…" confirm.
    page.on('dialog', (d) => d.accept());

    let rows = prodShapedQueue();
    const posts: Array<Record<string, unknown>> = [];

    await page.route('**/api/admin/follow-ups', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        await route.fulfill({ json: { rows } });
        return;
      }
      // POST — record the action and simulate the server-side cancel.
      const body = req.postDataJSON() as Record<string, unknown>;
      posts.push(body);
      if (body.action === 'stop') {
        const email = String(body.email).toLowerCase();
        // Server maps sequence -> fixed type sets; nurture cancels the drip types.
        const nurture = new Set(['instant_ack', '24h', '48h', '7d']);
        const before = rows.length;
        rows = rows.filter(
          (r) => !(r.status === 'pending' && r.lead_email.toLowerCase() === email && nurture.has(r.follow_up_type)),
        );
        await route.fulfill({ json: { stopped: before - rows.length } });
        return;
      }
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto('/vaca-mgmt/follow-ups');
    await expect(page.getByText('Sarah Chen').first()).toBeVisible();

    // Sarah has 2 pending nurture emails; stop her drip.
    const sarahRow = page.locator('tr', { hasText: 'sarah.chen@example.com' });
    await sarahRow.getByRole('button', { name: /Stop drip/ }).click();

    // Toast confirms the persisted cancel count coming back from the API.
    await expect(page.getByText(/Cancelled 2 pending emails for Sarah Chen/)).toBeVisible();
    // After the refetch, Sarah is gone and the pending total dropped 7 -> 5.
    await expect(page.getByText('sarah.chen@example.com')).toHaveCount(0);
    await expect(page.locator('p.text-2xl', { hasText: /^5$/ })).toBeVisible();

    // The stop went through the server API, scoped to the nurture sequence.
    const stop = posts.find((p) => p.action === 'stop');
    expect(stop).toBeTruthy();
    expect(stop).toMatchObject({ action: 'stop', email: 'sarah.chen@example.com', sequence: 'nurture' });

    await page.screenshot({ path: shot('02-stop-drip-persisted.png') });
  });
});
