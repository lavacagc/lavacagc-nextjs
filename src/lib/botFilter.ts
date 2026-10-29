/**
 * The bot filter's allow-list and the crawler test, shared by middleware (edge)
 * and the experiments assignment (server components, pure).
 *
 * Edge-safe and import-free on purpose: middleware bundles it.
 */

// Good bots we explicitly allow (search engines, social previews, ad verification)
export const GOOD_BOT_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,               // Yahoo
  /duckduckbot/i,
  /facebookexternalhit/i, // Facebook link preview / ad verification
  /facebookcatalog/i,     // Facebook product catalog
  /instagram/i,           // Instagram preview
  /linkedinbot/i,
  /twitterbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /pinterest/i,
  /applebot/i,
  /google-inspectiontool/i,
  /google-extended/i,
  /mediapartners-google/i, // AdSense
  /adsbot-google/i,        // Google Ads verification
  /apis-google/i,
];

export function isGoodBot(ua: string): boolean {
  return GOOD_BOT_PATTERNS.some((p) => p.test(ua));
}

/**
 * True for anything that is not a person in a browser: no user agent, an
 * allow-listed crawler, or the generic bot words. Middleware uses it to skip
 * minting visitor ids; experiments use it to always serve the control, so a
 * crawler indexes the page's default copy and is never counted.
 */
export function isCrawlerUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return isGoodBot(ua) || /bot|crawl|spider|slurp|fetch|preview/i.test(ua);
}
