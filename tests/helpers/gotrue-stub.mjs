/**
 * A GoTrue stand-in for the specs that render an admin page.
 *
 * Everything under /vaca-mgmt is gated by middleware's
 * `supabase.auth.getUser()`, which is a SERVER call - `page.route` cannot reach
 * it - so those specs need something answering on the port
 * NEXT_PUBLIC_SUPABASE_URL was baked to at build time (127.0.0.1:9099, see the
 * Build step in .github/workflows/playwright.yml). The fabricated session cookie
 * each spec sets is only half of it; this is the other half.
 *
 * Started ONCE for the whole run, from playwright.config.ts. Three specs used to
 * start it themselves in `beforeAll` on this same fixed port, and Playwright
 * runs spec files in parallel workers - so whoever lost the race either failed
 * to bind outright or had the port closed underneath it by another file's
 * `afterAll`, which read as an admin page that would not load.
 *
 * Deliberately dumb: any authenticated answer unlocks the page, and no spec
 * asserts anything about the user it returns.
 */
import http from 'http';

const PORT = Number(process.env.GOTRUE_STUB_PORT || 9099);

const USER = {
  id: '00000000-0000-0000-0000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@lavacagc.com',
  created_at: '2026-01-01T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
};

http
  .createServer((req, res) => {
    if (req.url?.startsWith('/auth/v1/user')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(USER));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{}');
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`GoTrue stub listening on http://127.0.0.1:${PORT}`);
  });
