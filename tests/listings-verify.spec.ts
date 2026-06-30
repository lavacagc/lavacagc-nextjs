import { test, expect } from '@playwright/test';
import { validateHeaders, TEMPLATE_HEADERS } from '../src/lib/listings/columns';
import { checkImageUrl } from '../src/lib/listings/imageCheck';

/**
 * Upload file-verifier: header/column validation + image-link checking.
 * The pure pieces (header report, non-network image rejections) run in CI.
 */
test.describe('listings file verifier — headers', () => {
  test('the template headers pass with nothing missing or unknown', () => {
    const r = validateHeaders([...TEMPLATE_HEADERS]);
    expect(r.missingRequired).toEqual([]);
    expect(r.unknown).toEqual([]);
    expect(r.looksLikeListings).toBe(true);
  });

  test('flags every missing required column (case/spacing-insensitive match)', () => {
    // Only some columns present, with odd casing/spacing — Address & City & the
    // budgets & Photo URLs are required.
    const r = validateHeaders(['  address ', 'CITY', 'List   Price']);
    expect(r.looksLikeListings).toBe(true);
    expect(r.missingRequired).toContain('Est Remodel Budget Low');
    expect(r.missingRequired).toContain('Est Remodel Budget High');
    expect(r.missingRequired).toContain('Photo URLs');
    // present ones are NOT reported missing
    expect(r.missingRequired).not.toContain('Address');
    expect(r.missingRequired).not.toContain('City');
  });

  test('lists unrecognized columns and detects a non-listings sheet', () => {
    const r = validateHeaders(['Frobnicate', 'Widgets']);
    expect(r.looksLikeListings).toBe(false);
    expect(r.unknown).toEqual(['Frobnicate', 'Widgets']);
  });
});

test.describe('listings file verifier — image links', () => {
  test('rejects non-https and empty URLs without a network call', async () => {
    expect((await checkImageUrl('http://insecure.example/x.jpg')).ok).toBe(false);
    expect((await checkImageUrl('not a url')).ok).toBe(false);
    expect((await checkImageUrl('')).reason).toBeTruthy();
    const res = await checkImageUrl('ftp://x');
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/https/);
  });
});
