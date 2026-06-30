import { test, expect } from '@playwright/test';
import {
  buildSubscriberActivityRow,
  listingSlugFromPath,
} from '../src/lib/listings/subscriberActivity';

/**
 * Subscriber behavior tracking.
 *
 * The row/slug shaping is pure and runs in CI with no backend. The end-to-end
 * beacon (cookie → subscriber → DB row) needs a live backend + a verified
 * subscriber, so it's verified manually against the dev server during dev.
 */

test.describe('subscriberActivity (pure shaping)', () => {
  test('extracts the listing slug only from real Buy + Remodel detail paths', () => {
    expect(listingSlugFromPath('/buy-and-remodel/123-main-st-clifton-nj')).toBe('123-main-st-clifton-nj');
    expect(listingSlugFromPath('/buy-and-remodel/123-main-st?ref=x')).toBe('123-main-st');
    expect(listingSlugFromPath('/buy-and-remodel')).toBeNull(); // index, no slug
    expect(listingSlugFromPath('/buy-and-remodel/unlock')).toBeNull(); // reserved
    expect(listingSlugFromPath('/projects/kitchen')).toBeNull(); // other section
  });

  test('builds a normalized activity row and sets listing_slug for detail pages', () => {
    const row = buildSubscriberActivityRow(
      'sub-123',
      { path: '/buy-and-remodel/foo-bar', referrer: 'https://google.com', visitor_id: 'v_abc' },
      '203.0.113.7',
      'Mozilla/5.0',
    );
    expect(row).toEqual({
      subscriber_id: 'sub-123',
      path: '/buy-and-remodel/foo-bar',
      listing_slug: 'foo-bar',
      referrer: 'https://google.com',
      visitor_id: 'v_abc',
      ip_address: '203.0.113.7',
      user_agent: 'Mozilla/5.0',
    });
  });

  test('rejects non-path inputs (absolute URLs / junk) and missing path', () => {
    expect(buildSubscriberActivityRow('s', { path: 'https://evil.com/x' }, null, null)).toBeNull();
    expect(buildSubscriberActivityRow('s', { path: 'not-a-path' }, null, null)).toBeNull();
    expect(buildSubscriberActivityRow('s', {}, null, null)).toBeNull();
  });

  test('caps overly long fields and nulls missing optionals', () => {
    const longPath = '/' + 'a'.repeat(2000);
    const row = buildSubscriberActivityRow('s', { path: longPath }, 'x'.repeat(300), 'y'.repeat(5000));
    expect(row).not.toBeNull();
    expect(row!.path.length).toBe(512);
    expect(row!.ip_address!.length).toBe(100);
    expect(row!.user_agent!.length).toBe(1000);
    expect(row!.referrer).toBeNull();
    expect(row!.visitor_id).toBeNull();
    expect(row!.listing_slug).toBeNull(); // not a buy-and-remodel path
  });
});
