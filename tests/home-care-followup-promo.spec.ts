import { test, expect } from '@playwright/test';
import {
  lead24hHtml,
  lead48hHtml,
  leadInstantAckHtml,
  lead7dHtml,
  HC_PROMO_START,
  HC_PROMO_END,
} from '../src/lib/emailTemplates';

/**
 * Home Care promo embedded in lead follow-ups 2 (+24h) & 3 (+48h).
 *
 * Verifies the author intent:
 *  - email 2 (soft / value-first) and email 3 (direct / "join") carry the promo
 *  - both render the navy brand band + inline checklist card (no hosted image)
 *  - both link to /home-care with lead_followup UTM tags
 *  - emails 1 (instant ack) & 4 (+7d) are intentionally unchanged (no promo)
 *  - the send-time suppression stripper removes ONLY the promo block for
 *    existing subscribers, leaving the rest of the email intact
 *
 * Screenshots of every variant (desktop + mobile 375px, promo + suppressed)
 * are written to the evidence directory for reviewer-visible proof.
 */

const EVIDENCE_DIR =
  '/var/folders/55/gqy2vg197xj44q_bjx2q9l180000gn/T/no-mistakes-evidence/01KY0E46NK7WWS7AQ2063DFFSJ';

const UNSUB = 'https://www.lavacagc.com/unsubscribe?token=demo';

// Mirror of stripHomeCarePromo() in src/app/api/cron/send-follow-ups/route.ts —
// what the cron applies at send time for active subscribers.
function stripHomeCarePromo(html: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${esc(HC_PROMO_START)}[\\s\\S]*?${esc(HC_PROMO_END)}`, 'g');
  return html.replace(pattern, '');
}

test.describe('Home Care promo — content requirements', () => {
  test('email 2 (+24h) carries the SOFT / value-first promo', () => {
    const html = lead24hHtml('Sarah Mitchell', 'Kitchen Remodel', UNSUB);
    expect(html).toContain(HC_PROMO_START);
    expect(html).toContain(HC_PROMO_END);
    // navy brand band
    expect(html).toContain('#002855');
    // soft framing + free-checklist CTA
    expect(html).toContain('Grab your free home-care checklist');
    expect(html).toContain('Get my free checklist');
    // inline checklist card (no hosted image)
    expect(html).toContain('Your seasonal checklist');
    expect(html).toContain('Clean gutters');
    expect(html).toContain('Service the furnace before winter');
    // /home-care CTA with lead_followup UTM tags for email 2
    expect(html).toMatch(
      /\/home-care\?utm_source=lead_followup&utm_medium=email&utm_campaign=home_care_promo&utm_content=email2_24h/,
    );
  });

  test('email 3 (+48h) carries the DIRECT "join" promo', () => {
    const html = lead48hHtml('Sarah Mitchell', 'Kitchen Remodel', UNSUB);
    expect(html).toContain(HC_PROMO_START);
    expect(html).toContain(HC_PROMO_END);
    expect(html).toContain('#002855');
    // direct framing + join CTA
    expect(html).toContain("Join La Vaca Home Care");
    expect(html).toContain('Start my free Home Care');
    expect(html).toContain('Your seasonal checklist');
    // /home-care CTA with lead_followup UTM tags for email 3
    expect(html).toMatch(
      /\/home-care\?utm_source=lead_followup&utm_medium=email&utm_campaign=home_care_promo&utm_content=email3_48h/,
    );
  });

  test('emails 1 (instant ack) & 4 (+7d) are intentionally unchanged', () => {
    const ack = leadInstantAckHtml('Sarah Mitchell', 'Kitchen Remodel', UNSUB);
    const d7 = lead7dHtml('Sarah Mitchell', UNSUB);
    expect(ack).not.toContain(HC_PROMO_START);
    expect(ack).not.toContain('home_care_promo');
    expect(d7).not.toContain(HC_PROMO_START);
    expect(d7).not.toContain('home_care_promo');
  });

  test('send-time suppression strips ONLY the promo, keeps the rest', () => {
    const full = lead24hHtml('Sarah Mitchell', 'Kitchen Remodel', UNSUB);
    const stripped = stripHomeCarePromo(full);
    // promo gone
    expect(stripped).not.toContain(HC_PROMO_START);
    expect(stripped).not.toContain(HC_PROMO_END);
    expect(stripped).not.toContain('Grab your free home-care checklist');
    expect(stripped).not.toContain('home_care_promo');
    // rest of the follow-up intact
    expect(stripped).toContain('Following Up on');
    expect(stripped).toContain('Schedule Your Free Estimate');
    expect(stripped).toContain(UNSUB);
    // and nothing left dangling
    expect(stripped).not.toContain('<!--HC_PROMO');
  });
});

test.describe('Home Care promo — visual evidence', () => {
  const shots: Array<{ name: string; html: string; width: number }> = [];

  test('capture rendered variants (desktop + mobile)', async ({ browser }) => {
    const soft = lead24hHtml('Sarah Mitchell', 'Kitchen Remodel', UNSUB);
    const direct = lead48hHtml('Sarah Mitchell', 'Kitchen Remodel', UNSUB);
    const suppressed = stripHomeCarePromo(soft);

    const variants = [
      { name: 'email2-soft-24h', html: soft },
      { name: 'email3-direct-48h', html: direct },
      { name: 'email2-suppressed-subscriber', html: suppressed },
    ];

    for (const v of variants) {
      for (const width of [640, 375]) {
        const ctx = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 2,
        });
        const page = await ctx.newPage();
        await page.setContent(v.html, { waitUntil: 'networkidle' });
        const path = `${EVIDENCE_DIR}/${v.name}-${width}w.png`;
        await page.screenshot({ path, fullPage: true });
        shots.push({ name: v.name, html: v.html, width });
        await ctx.close();
      }
    }
    expect(shots.length).toBe(6);
  });
});
