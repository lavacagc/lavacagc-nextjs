import { test, expect } from '@playwright/test';
import { addressKey, deriveSlug } from '../src/lib/listings/columns';

/**
 * Duplicate-address detection. Both the admin import preview and the server
 * import route reject a row whose normalized address already exists (under a
 * different slug) or repeats an address earlier in the same upload. The whole
 * decision hinges on addressKey(), so we test its equivalences directly — these
 * run in CI (pure function, no backend).
 */
test.describe('listings duplicate-address key', () => {
  test('normalizes case, punctuation, and whitespace to one key', () => {
    const a = addressKey({ address_line1: '12 Maple Ave.', city: 'Ridgewood', state: 'NJ', zip: '07450' });
    const b = addressKey({ address_line1: '12   maple ave', city: 'RIDGEWOOD', state: 'nj', zip: '07450' });
    expect(a).toBe(b);
    expect(a).not.toBe('');
  });

  test('catches the real gap: same address, different external_id => same key', () => {
    // deriveSlug prefers external_id, so these get DIFFERENT slugs and the slug
    // upsert would let both through — but addressKey collapses them.
    const row1 = { external_id: 'HC-001', mls_number: null, address_line1: '5 Oak Court', city: 'Livingston', state: 'NJ', zip: '07039' };
    const row2 = { external_id: 'HC-999', mls_number: null, address_line1: '5 Oak Court', city: 'Livingston', state: 'NJ', zip: '07039' };
    expect(deriveSlug(row1)).not.toBe(deriveSlug(row2)); // slugs differ...
    expect(addressKey(row1)).toBe(addressKey(row2)); // ...but the address key catches it
  });

  test('distinct units at the same building are NOT duplicates', () => {
    const unit2 = addressKey({ address_line1: '88 Park St', address_line2: 'Apt 2', city: 'Montclair', state: 'NJ', zip: '07042' });
    const unit3 = addressKey({ address_line1: '88 Park St', address_line2: 'Apt 3', city: 'Montclair', state: 'NJ', zip: '07042' });
    expect(unit2).not.toBe(unit3);
  });

  test('different streets produce different keys', () => {
    const a = addressKey({ address_line1: '12 Maple Ave', city: 'Ridgewood', state: 'NJ', zip: '07450' });
    const b = addressKey({ address_line1: '14 Maple Ave', city: 'Ridgewood', state: 'NJ', zip: '07450' });
    expect(a).not.toBe(b);
  });

  test('empty street line yields an empty key (nothing to dedupe on)', () => {
    expect(addressKey({ address_line1: '', city: 'Ridgewood', state: 'NJ' })).toBe('');
    expect(addressKey({ address_line1: null })).toBe('');
  });
});
