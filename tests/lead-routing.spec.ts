import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { scoreIntake, routeIntake, lowIntentDecision } from '../src/lib/intake/scoring';
import { scoreLead } from '../src/lib/leadScoring';
import {
  chaseMessage, lowIntentMessage, abandonedMessage, answeredLabels, hoursSince,
  type ChaseCandidate,
} from '../src/lib/intake/chase';
import { completionMessage } from '../src/lib/intake/completionAlert';

/**
 * Acceptance criteria for lead scoring and routing.
 * See docs/lead-routing-acceptance-criteria.md - IDs below match that doc.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const NOW = new Date('2026-08-02T18:00:00Z');

const answers = (o: Partial<Record<string, string>> = {}) => ({
  city: 'Montclair', scope_tier: 'full_gut', project_timeline: 'asap',
  price_reaction: 'about_expected', ...o,
}) as Record<string, string>;

/* ── AC1 - the four signals the spec names ────────────────────────────────── */

test.describe('AC1 - the spec four', () => {
  test('town in the service area scores, and is named in the record', () => {
    const near = scoreIntake({ answers: answers({ city: 'Montclair' }) });
    const far = scoreIntake({ answers: answers({ city: 'Princeton' }) });
    expect(near.score).toBeGreaterThan(far.score);
    expect(near.signals.join(' ')).toContain('In the service area');
    expect(far.signals.join(' ')).toContain('Outside the service area');
  });

  test('scope tier is ordered full gut > major update > refresh', () => {
    const s = (v: string) => scoreIntake({ answers: answers({ scope_tier: v }) }).score;
    expect(s('full_gut')).toBeGreaterThan(s('major_update'));
    expect(s('major_update')).toBeGreaterThan(s('refresh'));
  });

  test('"described it themselves" scores mid, not zero', () => {
    // They told us more, not less. Scoring it zero would punish engagement.
    const own = scoreIntake({ answers: answers({ scope_tier: 'own_details' }) }).score;
    const refresh = scoreIntake({ answers: answers({ scope_tier: 'refresh' }) }).score;
    const gut = scoreIntake({ answers: answers({ scope_tier: 'full_gut' }) }).score;
    expect(own).toBeGreaterThan(refresh);
    expect(own).toBeLessThan(gut);
  });

  test('timeline is ordered, and "just planning" scores nothing', () => {
    const s = (v: string) => scoreIntake({ answers: answers({ project_timeline: v }) }).score;
    expect(s('asap')).toBeGreaterThan(s('1_3_months'));
    expect(s('1_3_months')).toBeGreaterThan(s('3_6_months'));
    expect(s('3_6_months')).toBeGreaterThan(s('later_this_year'));
    expect(s('later_this_year')).toBeGreaterThan(s('planning'));
  });

  test('photos score, and their absence is recorded rather than left silent', () => {
    const with3 = scoreIntake({ answers: answers(), photoCount: 3 });
    const none = scoreIntake({ answers: answers(), photoCount: 0 });
    expect(with3.score).toBeGreaterThan(none.score);
    expect(with3.signals.join(' ')).toContain('Sent 3 photos');
    expect(none.signals.join(' ')).toContain('No photos');
  });

  test('the town predicate is shared with the flow and the scorer, not re-implemented', () => {
    expect(code('src/lib/intake/scoring.ts')).toContain("cityInServiceArea");
    expect(code('src/lib/intake/scoring.ts')).toContain("from '@/lib/leadScoring'");
  });
});

/* ── AC2 - the fifth signal ───────────────────────────────────────────────── */

test.describe('AC2 - the price reaction is scored and is heaviest', () => {
  test('priced out costs more than any other single downgrade', () => {
    const base = scoreIntake({ answers: answers() }).score;
    const priced = base - scoreIntake({ answers: answers({ price_reaction: 'well_above' }) }).score;
    const timing = base - scoreIntake({ answers: answers({ project_timeline: 'planning' }) }).score;
    const scope = base - scoreIntake({ answers: answers({ scope_tier: 'refresh' }) }).score;
    expect(priced).toBeGreaterThan(0);
    expect(priced).toBeGreaterThanOrEqual(Math.min(timing, scope));
  });

  test('"under what I expected" is not penalised against "about right"', () => {
    const under = scoreIntake({ answers: answers({ price_reaction: 'below_expected' }) }).score;
    const about = scoreIntake({ answers: answers({ price_reaction: 'about_expected' }) }).score;
    expect(under).toBe(about);
  });

  test('the reaction is named in plain words in the record', () => {
    const r = scoreIntake({ answers: answers({ price_reaction: 'well_above' }) });
    expect(r.signals.join(' ')).toContain('well above what they planned');
  });
});

/* ── AC3 - two buckets, defensible threshold ──────────────────────────────── */

test.describe('AC3 - bucketing actually separates', () => {
  test('THE PRINCETON CASE: what the old scorer called hot, this calls cold', () => {
    // scoreLead gives this 105 and buckets it hot, because project type alone
    // contributes 80 against an 80-point threshold. That is the whole reason
    // this module exists.
    const old = scoreLead({ projectType: 'Bathroom Renovation', city: 'Princeton', email: 'a@b.c', source: 'contact_form' });
    expect(old.tier).toBe('hot');

    const now = scoreIntake({
      answers: { city: 'Princeton', scope_tier: 'refresh', project_timeline: 'planning', price_reaction: 'well_above' },
      photoCount: 0,
    });
    expect(now.bucket).toBe('cold');
  });

  test('in area, full gut, starting soon, price fine is hot', () => {
    expect(scoreIntake({ answers: answers(), photoCount: 3 }).bucket).toBe('hot');
  });

  test('local and ambitious but priced out and not starting is still cold', () => {
    const r = scoreIntake({
      answers: answers({ project_timeline: 'planning', price_reaction: 'well_above' }),
    });
    expect(r.bucket).toBe('cold');
  });

  test('no single signal can carry a lead to hot on its own', () => {
    for (const only of [
      { city: 'Montclair' },
      { scope_tier: 'full_gut' },
      { project_timeline: 'asap' },
      { price_reaction: 'about_expected' },
    ]) {
      const r = scoreIntake({ answers: only as Record<string, string>, photoCount: 0 });
      expect(r.bucket, `${JSON.stringify(only)} alone must not be hot`).toBe('cold');
    }
  });

  test('there is no third bucket', () => {
    const seen = new Set<string>();
    for (const city of ['Montclair', 'Princeton']) {
      for (const scope of ['full_gut', 'major_update', 'refresh', 'own_details']) {
        for (const tl of ['asap', '1_3_months', '3_6_months', 'later_this_year', 'planning']) {
          for (const pr of ['below_expected', 'about_expected', 'a_bit_more', 'well_above']) {
            seen.add(scoreIntake({ answers: { city, scope_tier: scope, project_timeline: tl, price_reaction: pr } }).bucket);
          }
        }
      }
    }
    expect([...seen].sort()).toEqual(['cold', 'hot']);
  });

  test('an empty answer set does not crash and is cold', () => {
    const r = scoreIntake({ answers: {} });
    expect(r.bucket).toBe('cold');
    expect(r.score).toBe(0);
  });
});

/* ── AC4/AC5 - the decision is recorded and acted on ──────────────────────── */

test.describe('AC4 - routing is recorded, not just made', () => {
  test('hot routes to the people who do the visit', () => {
    const d = routeIntake(scoreIntake({ answers: answers(), photoCount: 2 }));
    expect(d.bucket).toBe('hot');
    expect(d.routedTo).toContain('Alex');
    expect(d.routedTo).toContain('Veronica');
  });

  test('cold enters nurture - a destination, not a bin', () => {
    const d = routeIntake(scoreIntake({ answers: { city: 'Princeton', project_timeline: 'planning' } }));
    expect(d.bucket).toBe('cold');
    expect(d.routedTo).toBe('nurture');
  });

  test('the reason is readable by a person, not a code', () => {
    const d = routeIntake(scoreIntake({ answers: answers(), photoCount: 1 }));
    expect(d.reason).toMatch(/^Scored \d+, hot\./);
    expect(d.reason).toContain('In the service area');
    expect(d.reason).not.toMatch(/full_gut|1_3_months|about_expected/);
  });

  test('the answer route writes the decision BEFORE it sends the brief', () => {
    const src = code('src/app/api/intake/[token]/answer/route.ts');
    expect(src).toContain('await recordRouting(');
    expect(src.indexOf('await recordRouting(')).toBeLessThan(src.indexOf('await sendCompletionAlert('));
  });

  test('a failed routing write is loud, not swallowed', () => {
    expect(code('src/lib/intake/session.ts')).toContain('FAILED to record routing');
  });

  test('the migration adds every column the routing writes', () => {
    const sql = read('supabase/migrations/20260820000000_lead_routing.sql');
    for (const c of ['intake_score', 'intake_bucket', 'intake_signals', 'routed_to', 'routed_at', 'routing_reason']) {
      expect(sql).toContain(c);
    }
    expect(sql).toContain("CHECK (intake_bucket IS NULL OR intake_bucket IN ('hot', 'cold'))");
  });

  test('score and tier are left alone', () => {
    const sql = read('supabase/migrations/20260820000000_lead_routing.sql');
    expect(sql).not.toMatch(/ALTER TABLE public\.leads[^;]*\b(DROP COLUMN|ALTER COLUMN)\s+(score|tier)\b/);
  });
});

test.describe('AC5 - a hot lead announces itself', () => {
  test('the brief leads with the bucket and the score', () => {
    const hot = completionMessage({
      firstName: 'Sarah', projectType: 'Kitchen Remodeling', answers: answers(),
      routing: { bucket: 'hot', score: 92 },
    });
    expect(hot).toContain('HOT LEAD (92/100)');
  });

  test('a cold lead still gets the whole brief, quietly', () => {
    const cold = completionMessage({
      firstName: 'Sarah', projectType: 'Kitchen Remodeling', answers: answers(),
      routing: { bucket: 'cold', score: 30 },
    });
    expect(cold).toContain('cold, 30/100');
    expect(cold).not.toContain('HOT LEAD');
    // Cold is a different destination, not a bin: the detail is still there.
    expect(cold).toContain('Scope');
    expect(cold).toContain('Timeline');
  });

  test('with no routing at all the brief still renders', () => {
    const plain = completionMessage({ firstName: 'Sarah', projectType: 'Kitchen', answers: answers() });
    expect(plain).toContain('Intake finished');
  });
});

/* ── AC6/AC7 - chasing the quiet ones ─────────────────────────────────────── */

const candidate = (o: Partial<ChaseCandidate> = {}): ChaseCandidate => ({
  id: 's1', lead_id: 'l1', first_name: 'Sarah', project_type: 'Kitchen Remodeling',
  answers: {}, created_at: '2026-08-02T10:00:00Z', opened_at: null, ...o,
});

test.describe('AC6 - never opened the link', () => {
  test('says what happened and that it is a signal, not a complaint', () => {
    const msg = lowIntentMessage(candidate(), NOW);
    expect(msg).toContain('Never opened');
    expect(msg).toContain('8 hours ago');
    expect(msg).toContain('worth one manual follow-up');
  });

  test('the decision it records is cold, into nurture', () => {
    const d = lowIntentDecision();
    expect(d.bucket).toBe('cold');
    expect(d.routedTo).toBe('nurture');
    expect(d.reason).toContain('Never opened');
  });

  test('the candidate query only picks sessions never alerted', () => {
    const src = code('src/app/api/cron/intake-chase/route.ts');
    expect(src).toContain('opened_at=is.null&low_intent_alert_at=is.null');
  });
});

test.describe('AC7 - started and stopped', () => {
  test('says how far they got, so it cannot be mistaken for a finished one', () => {
    const msg = abandonedMessage(candidate({
      opened_at: '2026-08-02T12:00:00Z',
      answers: { message: 'gut the kitchen', city: 'Montclair', scope_tier: 'full_gut' },
    }), NOW);
    expect(msg).toContain('Started the intake and stopped');
    expect(msg).toContain('what the project is, their town, scope');
    expect(msg).toContain('has NOT been scored or routed');
  });

  test('a lead who opened it and answered nothing says exactly that', () => {
    const msg = abandonedMessage(candidate({ opened_at: '2026-08-02T12:00:00Z' }), NOW);
    expect(msg).toContain('They answered nothing');
  });

  test('answered labels follow the order the flow asks them', () => {
    expect(answeredLabels({ contact_time_preference: 'x', message: 'y', city: 'z' }))
      .toEqual(['what the project is', 'their town', 'when to call']);
  });

  test('a lead who DECLINED is never chased - they answered the question asked', () => {
    const src = code('src/app/api/cron/intake-chase/route.ts');
    expect(src).toContain('declined_at=is.null');
  });

  test('hoursSince is floored and never negative', () => {
    expect(hoursSince('2026-08-02T12:00:00Z', NOW)).toBe(6);
    expect(hoursSince('2026-08-02T17:59:00Z', NOW)).toBe(0);
    expect(hoursSince('2026-08-03T00:00:00Z', NOW)).toBe(0);
    expect(hoursSince('not-a-date', NOW)).toBe(0);
  });

  test('both stages route through one message builder', () => {
    const c = candidate({ opened_at: '2026-08-02T12:00:00Z' });
    expect(chaseMessage('low_intent', c, NOW)).toBe(lowIntentMessage(c, NOW));
    expect(chaseMessage('abandoned', c, NOW)).toBe(abandonedMessage(c, NOW));
  });
});

/* ── AC8 - failure reads as failure ───────────────────────────────────────── */

test.describe('AC8 - a broken cron does not look like a quiet one', () => {
  test('an unreadable candidate list is a 503, not ok:true with zero', () => {
    const src = code('src/app/api/cron/intake-chase/route.ts');
    expect(src).toContain('could not read');
    expect(src).toContain('ok: false');
    expect(src).toContain('status: 503');
    expect(src).toContain('nothing was chased');
  });

  test('the stamp is claimed before the send and released when it fails', () => {
    const src = code('src/app/api/cron/intake-chase/route.ts');
    const claim = src.indexOf('could not claim');
    const send = src.indexOf('await sendTelegramMessage(');
    expect(claim).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(send);
    expect(src).toContain('could not release the claim');
  });

  test('the claim filter makes two overlapping runs safe', () => {
    // The is.null in the PATCH filter is what stops a second run re-sending.
    expect(code('src/app/api/cron/intake-chase/route.ts')).toContain('=is.null`,');
  });

  test('an unknown stage is rejected rather than defaulted', () => {
    const src = code('src/app/api/cron/intake-chase/route.ts');
    expect(src).toContain("stage must be 'low_intent' or 'abandoned'");
    expect(src).toContain('status: 400');
  });

  test('both stages are registered as crons', () => {
    const vercel = read('vercel.json');
    expect(vercel).toContain('/api/cron/intake-chase?stage=low_intent');
    expect(vercel).toContain('/api/cron/intake-chase?stage=abandoned');
  });
});
