import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { sanitizeLeadForInsert } from '../../../src/lib/leadSanitize';

/**
 * Wave 2 - the server used to trust things only the browser had checked.
 *
 * CM-02 (S2) a raw POST could set its own `score`/`tier`/`scoring_reasons`;
 *            `.passthrough()` carried them in, the sanitizer accepted them as
 *            writable columns, and `if (!finalLeadData.score)` then skipped
 *            scoring entirely - so the owner was paged "New HOT Lead, 100/100"
 *            on the sender's say-so.
 * CM-09 (S2) `email` was 320 free characters with no format check, while all
 *            six forms enforce one. Garbage stored fine and then silently
 *            suppressed the acknowledgement, because the follow-up sender
 *            regex-checks the address and refuses.
 * CM-13 (S3) `Number.isFinite(9e99)` is true, so an absurd `square_footage`
 *            reached an int4 column, PostgREST rejected the whole insert and
 *            the enquiry was LOST with a 500.
 *
 * CM-13 is exercised directly against the sanitizer, which is the chokepoint
 * every lead write goes through - a far sharper test than driving HTTP, and it
 * needs no database.
 *
 * @isolation CM-02 CM-09 CM-13
 */

test.describe('@isolation CM-13 the sanitizer never lets a number destroy a lead', () => {
  test('an out-of-range integer is dropped and the lead survives', () => {
    const { lead, adjustments } = sanitizeLeadForInsert({
      first_name: 'Real', last_name: 'Customer',
      email: 'real@example.com', phone: '2015550100',
      inquiry_type: 'estimate',
      square_footage: 9e99,
    });
    expect(lead.square_footage, 'the poison value must not reach the insert').toBeUndefined();
    expect(lead.first_name, 'and the lead itself must survive intact').toBe('Real');
    expect(lead.email).toBe('real@example.com');
    expect(adjustments.join(' '), 'the drop is reported, never silent').toContain('square_footage');
  });

  test('int4 boundaries: the largest legal value is kept, one past it is dropped', () => {
    const keep = sanitizeLeadForInsert({ square_footage: 2147483647 });
    expect(keep.lead.square_footage).toBe(2147483647);

    const drop = sanitizeLeadForInsert({ square_footage: 2147483648 });
    expect(drop.lead.square_footage).toBeUndefined();
    expect(drop.adjustments.join(' ')).toContain('out-of-range');
  });

  test('ordinary values are untouched - the positive half', () => {
    const { lead, adjustments } = sanitizeLeadForInsert({
      first_name: 'Real', last_name: 'Customer', email: 'a@b.co', phone: '2015550100',
      square_footage: '1850', visit_count: 3,
    });
    expect(lead.square_footage).toBe(1850);
    expect(lead.visit_count).toBe(3);
    expect(adjustments.filter((a) => /square_footage|visit_count/.test(a))).toHaveLength(0);
  });

  test('every integer column is covered, not just the one that was found', () => {
    // Systemic: the finding was reported against square_footage, but the same
    // trap existed on every INTEGER_COLUMN.
    for (const col of ['square_footage', 'score', 'visit_count', 'price_anchor_shown']) {
      const { lead } = sanitizeLeadForInsert({ [col]: 9e99 });
      expect(lead[col], `${col} must also be clamped`).toBeUndefined();
    }
  });
});

test.describe('@isolation CM-02 lead scoring is server-owned', () => {
  test('the route strips client-supplied score, tier and scoring_reasons', () => {
    const src = readFileSync('src/app/api/leads/submit/route.ts', 'utf8');
    expect(src, 'the server-owned list must exist').toContain('SERVER_OWNED_FIELDS');
    expect(src).toContain("['score', 'tier', 'scoring_reasons']");
    expect(src, 'and they must be deleted before anything reads them')
      .toMatch(/delete \(leadFields as Record<string, unknown>\)\[key\]/);
  });

  test('scoring is no longer conditional on the absence of a client score', () => {
    // Comments are stripped first, and that is a deliberate revision rather
    // than a convenience: the first version of this criterion searched the raw
    // file and failed on the comment that EXPLAINS the old guard. A criterion
    // that cannot tell code from prose would have to be satisfied by deleting
    // the explanation, which is the wrong incentive.
    const raw = readFileSync('src/app/api/leads/submit/route.ts', 'utf8');
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
      .replace(/^\s*\/\/.*$/gm, '');      // line comments

    expect(code, 'the short-circuit that let a supplied score skip scoring must be gone')
      .not.toContain('if (!finalLeadData.score)');
    expect(code, 'and scoreLead must still run').toContain('scoreLead(scoringInput)');
  });

  test('the sanitizer would still accept them, so stripping upstream is what protects us', () => {
    // Documents WHY the fix lives in the route: the sanitizer is deliberately
    // permissive about these columns because the intake flow writes them by a
    // different path. If that ever changes, this test should be revisited
    // rather than deleted.
    const { lead } = sanitizeLeadForInsert({ score: 100, tier: 'hot' });
    expect(lead.score, 'sanitizer still accepts it by design').toBe(100);
    expect(lead.tier).toBe('hot');
  });
});

test.describe('@isolation CM-09 the server validates email like the browser does', () => {
  test('an unparseable address is dropped rather than stored', () => {
    const src = readFileSync('src/app/api/leads/submit/route.ts', 'utf8');
    expect(src).toContain('LEAD_EMAIL_RE');
    expect(src, 'a bad address is dropped, not fatal - a phone may still make the lead actionable')
      .toMatch(/delete \(leadFields as Record<string, unknown>\)\.email/);
  });

  test('the server pattern matches the one the follow-up sender uses', () => {
    // The whole point: the address that passes validation must be an address
    // the acknowledgement can actually be sent to. These two drifting apart is
    // what made the failure silent.
    const route = readFileSync('src/app/api/leads/submit/route.ts', 'utf8');
    const sender = readFileSync('src/lib/notify/leadFollowUp.ts', 'utf8');
    const pattern = /\/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\//;
    expect(route, 'route uses the shared shape').toMatch(pattern);
    expect(sender, 'sender uses the same shape').toMatch(pattern);
  });
});
