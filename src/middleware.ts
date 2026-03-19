import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Known bad bot user-agent patterns (scrapers, vulnerability scanners, spam crawlers)
const BAD_BOT_PATTERNS = [
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /blexbot/i,
  /sogou/i,
  /yandexbot/i,
  /baidu/i,
  /bytespider/i,
  /petalbot/i,
  /megaindex/i,
  /seokicks/i,
  /serpstatbot/i,
  /dataforseo/i,
  /zoominfobot/i,
  /censys/i,
  /masscan/i,
  /zgrab/i,
  /nuclei/i,
  /httpx/i,
  /nikto/i,
  /sqlmap/i,
  /nmap/i,
  /dirbuster/i,
  /gobuster/i,
  /wpscan/i,
  /python-requests/i,
  /go-http-client/i,
  /java\//i,
  /curl\//i,
  /wget\//i,
  /scrapy/i,
  /phantomjs/i,
  /headlesschrome/i,
];

// Good bots we explicitly allow (search engines, social previews, ad verification)
const GOOD_BOT_PATTERNS = [
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

function isGoodBot(ua: string): boolean {
  return GOOD_BOT_PATTERNS.some(p => p.test(ua));
}

function isBadBot(ua: string): boolean {
  return BAD_BOT_PATTERNS.some(p => p.test(ua));
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const ua = request.headers.get('user-agent') || '';

  // 301 redirect non-www to www (permanent — tells Google to consolidate)
  if (host === 'lavacagc.com') {
    const destination = `https://www.lavacagc.com${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(destination, { status: 301 });
  }

  // Block known bad bots (unless they're spoofing a good bot UA)
  if (ua && isBadBot(ua) && !isGoodBot(ua)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // For good bots and suspected bots: set a header so client-side code can skip analytics
  const response = NextResponse.next();
  
  // Detect if this looks like a bot (no UA, or matches known bot patterns)
  const isBot = !ua || isGoodBot(ua) || /bot|crawl|spider|slurp|fetch|preview/i.test(ua);
  if (isBot) {
    response.headers.set('x-is-bot', '1');
  }

  return response;
}

export const config = {
  matcher: '/:path*',
};
