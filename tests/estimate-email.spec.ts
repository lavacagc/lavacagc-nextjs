import { test, expect, request } from '@playwright/test';
import {
  estimateEmailHtml,
  estimateEmailText,
  type EstimateEmailPayload,
} from '../src/lib/emailTemplates';
import { estimateEmailSchema } from '../src/app/api/admin/estimate-email/_schema';

/**
 * Tests for the customer-facing estimate email feature.
 *
 * Three layers:
 *   1. Template tests — pure functions, no network. Verify content
 *      requirements (logo, warranties, comparison, disclaimer, etc.).
 *   2. API tests — confirm /api/admin/* enforces auth and that the
 *      validation schema rejects bad input.
 *   3. Middleware tests — confirm the INTERNAL_WEBHOOK_SECRET carve-out
 *      does NOT apply to admin routes.
 *
 * The admin UI E2E is intentionally not covered here because it requires
 * a real Supabase session. Manual smoke testing covers that.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL || process.env.TEST_URL || 'http://localhost:3000';

const basePayload: EstimateEmailPayload = {
  recipientName: 'Sarah Mitchell',
  projectType: 'Bathroom Renovation',
  estimateUrl: 'https://app.qbo.intuit.com/app/estimates/123',
  portalUrl: 'https://portal.lavacagc.com/sarah',
  updateCadence: 'weekly',
  personalNote: 'Was great meeting you and Mike on Tuesday — thank you for letting us into your home.',
};

// ============================================================
// 1. TEMPLATE / CONTENT TESTS
// ============================================================
test.describe('estimateEmailHtml — content requirements', () => {
  test('includes La Vaca logo URL', () => {
    const html = estimateEmailHtml(basePayload);
    expect(html).toContain('https://www.lavacagc.com/logo.png');
  });

  test('greets the recipient by first name', () => {
    const html = estimateEmailHtml(basePayload);
    // greeting block must exist and contain "Hi Sarah"
    expect(html).toContain('data-testid="greeting"');
    const greetingStart = html.indexOf('data-testid="greeting"');
    const greetingSlice = html.slice(greetingStart, greetingStart + 500);
    expect(greetingSlice).toContain('Hi Sarah');
  });

  test('falls back to "there" when name is empty', () => {
    const html = estimateEmailHtml({ ...basePayload, recipientName: '' });
    expect(html).toContain('Hi there');
  });

  test('renders the personal note when provided', () => {
    const html = estimateEmailHtml(basePayload);
    expect(html).toContain('data-testid="personal-note"');
    expect(html).toContain('Was great meeting you');
  });

  test('omits the personal-note block when blank', () => {
    const html = estimateEmailHtml({ ...basePayload, personalNote: undefined });
    expect(html).not.toContain('data-testid="personal-note"');
  });

  test('escapes HTML in user-provided fields', () => {
    const html = estimateEmailHtml({
      ...basePayload,
      // Use a single name for first-name extraction, then test note escaping
      recipientName: 'EveScripty',
      personalNote: 'Hi & welcome <b>',
    });
    // Personal note must be escaped — no raw < or & in user content
    expect(html).not.toContain('<b>');
    expect(html).toContain('Hi &amp; welcome &lt;b&gt;');
  });

  test('escapes HTML in recipient name', () => {
    const html = estimateEmailHtml({
      ...basePayload,
      recipientName: '<script>alert(1)</script> Mitchell',
    });
    expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
    // First-name extraction picks "<script>alert(1)</script>" and escapes it
    expect(html).toContain('&lt;script&gt;');
  });

  test('renders the QBO estimate CTA with the supplied URL', () => {
    const html = estimateEmailHtml(basePayload);
    expect(html).toContain('data-testid="estimate-cta"');
    expect(html).toContain('https://app.qbo.intuit.com/app/estimates/123');
  });

  test('includes QBO acceptance instructions', () => {
    const html = estimateEmailHtml(basePayload);
    expect(html).toContain('data-testid="qbo-steps"');
    // 4 numbered step rows rendered as a table of iconBullet rows
    // (step-1.png ... step-4.png). End at the closing </table>
    // that wraps the steps.
    const start = html.indexOf('data-testid="qbo-steps"');
    const end = html.indexOf('</table>', start);
    const block = html.slice(start, end);
    expect(block).toContain('step-1');
    expect(block).toContain('step-2');
    expect(block).toContain('step-3');
    expect(block).toContain('step-4');
    // Mentions the View estimate prompt + Accept + QuickBooks
    expect(block).toMatch(/View estimate/);
    expect(block).toMatch(/[Aa]ccept/);
    expect(block).toMatch(/QuickBooks/);
  });

  test('mentions all three warranties (lifetime*, 5-year structural, 1-year workmanship)', () => {
    const html = estimateEmailHtml(basePayload);
    expect(html).toMatch(/[Ll]ifetime/);
    expect(html).toMatch(/5-?year.*[Ss]tructural/);
    expect(html).toMatch(/1-?year.*[Ww]orkmanship/);
  });

  test('shows lifetime warranty with asterisk reference', () => {
    const html = estimateEmailHtml({ ...basePayload, projectType: 'Bathroom Renovation' });
    expect(html).toContain('data-testid="warranty-lifetime"');
    // Asterisk is rendered as a <sup>*</sup> immediately after "Lifetime warranty"
    const idx = html.indexOf('Lifetime warranty');
    expect(idx).toBeGreaterThanOrEqual(0);
    const after = html.slice(idx, idx + 200);
    expect(after).toContain('*');
  });

  test('always shows the Schluter footnote in the disclaimer', () => {
    const kitchenHtml = estimateEmailHtml({ ...basePayload, projectType: 'Kitchen Remodeling' });
    const bathroomHtml = estimateEmailHtml(basePayload);
    expect(kitchenHtml).toMatch(/[Ss]chluter/);
    expect(bathroomHtml).toMatch(/[Ss]chluter/);
  });

  test('links to credentials anchor on the about page', () => {
    const html = estimateEmailHtml(basePayload);
    expect(html).toContain('data-testid="credentials-link-row"');
    expect(html).toContain('/about#credentials');
  });

  test('includes the scope/disclaimer footer text', () => {
    const html = estimateEmailHtml(basePayload);
    expect(html).toContain('data-testid="disclaimer"');
    // Scope-only language about what's included/not included
    expect(html.toLowerCase()).toMatch(/scope/);
    expect(html.toLowerCase()).toMatch(/not included|not on the estimate|not on this estimate/);
  });

  test('shows the personalized portal URL when supplied', () => {
    const html = estimateEmailHtml(basePayload);
    expect(html).toContain('https://portal.lavacagc.com/sarah');
  });

  test('omits the portal block when not supplied', () => {
    const html = estimateEmailHtml({ ...basePayload, portalUrl: undefined });
    expect(html).not.toContain('portal.lavacagc.com');
  });

  test('respects updateCadence wording (daily vs weekly)', () => {
    const daily = estimateEmailHtml({ ...basePayload, updateCadence: 'daily' });
    const weekly = estimateEmailHtml({ ...basePayload, updateCadence: 'weekly' });
    expect(daily.toLowerCase()).toContain('daily');
    expect(weekly.toLowerCase()).toContain('weekly');
  });

  test('lists the NJ HIC license number and the business address', () => {
    const html = estimateEmailHtml(basePayload);
    expect(html).toContain('13VH13373800');
    expect(html).toContain('51 Crestmont');
  });
});

// ============================================================
// PLAINTEXT FALLBACK
// ============================================================
test.describe('estimateEmailText — plaintext fallback', () => {
  test('produces plaintext containing key facts', () => {
    const text = estimateEmailText(basePayload);
    expect(text.length).toBeGreaterThan(200);
    expect(text).toContain('Sarah');
    expect(text).toContain('https://app.qbo.intuit.com/app/estimates/123');
    expect(text).toMatch(/13VH13373800/);
    expect(text.toLowerCase()).toContain('warranty');
  });

  test('does not contain raw HTML tags', () => {
    const text = estimateEmailText(basePayload);
    expect(text).not.toMatch(/<[a-z][^>]*>/i);
  });
});

// ============================================================
// SCHEMA VALIDATION TESTS
// ============================================================
test.describe('estimateEmailSchema — cross-field validation', () => {
  const valid = {
    recipientName: 'Sarah Mitchell',
    recipientEmail: 'sarah@example.com',
    projectType: 'Bathroom Renovation',
    estimateUrl: 'https://app.qbo.intuit.com/app/estimates/123',
  };

  test('accepts a complete real-send payload', () => {
    const r = estimateEmailSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  test('rejects real send (isTest=false) with missing recipientEmail', () => {
    const r = estimateEmailSchema.safeParse({ ...valid, recipientEmail: undefined });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('recipientEmail'))).toBe(true);
    }
  });

  test('accepts test send (isTest=true) with empty recipientEmail', () => {
    const r = estimateEmailSchema.safeParse({
      ...valid,
      recipientEmail: '',
      isTest: true,
    });
    expect(r.success).toBe(true);
  });

  test('accepts test send (isTest=true) with missing recipientEmail', () => {
    const r = estimateEmailSchema.safeParse({
      recipientName: 'Sarah Mitchell',
      projectType: 'Bathroom Renovation',
      estimateUrl: 'https://app.qbo.intuit.com/app/estimates/123',
      isTest: true,
    });
    expect(r.success).toBe(true);
  });

  test('rejects http:// estimate URL (https-only enforced)', () => {
    const r = estimateEmailSchema.safeParse({
      ...valid,
      estimateUrl: 'http://app.qbo.intuit.com/app/estimates/123',
    });
    expect(r.success).toBe(false);
  });

  test('parses comma-separated CCs into a clean array', () => {
    const r = estimateEmailSchema.safeParse({
      ...valid,
      ccEmails: 'one@example.com, two@example.com ,, ',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.ccEmails).toEqual(['one@example.com', 'two@example.com']);
    }
  });

  test('rejects an invalid email in the CC list', () => {
    const r = estimateEmailSchema.safeParse({ ...valid, ccEmails: 'good@example.com, not-an-email' });
    expect(r.success).toBe(false);
  });
});

// ============================================================
// 2. API ROUTE TESTS
// ============================================================
test.describe('API: /api/admin/estimate-email/* — auth + validation', () => {
  test('preview rejects unauthenticated requests', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${BASE}/api/admin/estimate-email/preview`, {
      data: basePayload,
      headers: { 'Content-Type': 'application/json' },
    });
    // Middleware redirects to /login (302) or returns 401
    expect([301, 302, 303, 307, 401, 403]).toContain(res.status());
  });

  test('send rejects unauthenticated requests', async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${BASE}/api/admin/estimate-email/send`, {
      data: { ...basePayload, recipientEmail: 'test@example.com' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([301, 302, 303, 307, 401, 403]).toContain(res.status());
  });

  test('leads search rejects unauthenticated requests', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${BASE}/api/admin/estimate-email/leads?q=foo`);
    expect([301, 302, 303, 307, 401, 403]).toContain(res.status());
  });

  test('log endpoint rejects unauthenticated requests', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${BASE}/api/admin/estimate-email/log`);
    expect([301, 302, 303, 307, 401, 403]).toContain(res.status());
  });

  test('INTERNAL_WEBHOOK_SECRET does NOT bypass admin auth', async () => {
    // The internal-secret carve-out in middleware is for /api/notify/*
    // only. Sending the header to an admin route must NOT bypass auth.
    const ctx = await request.newContext();
    const res = await ctx.post(`${BASE}/api/admin/estimate-email/send`, {
      data: { ...basePayload, recipientEmail: 'test@example.com' },
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_WEBHOOK_SECRET || 'guess',
      },
    });
    expect([301, 302, 303, 307, 401, 403]).toContain(res.status());
  });
});
