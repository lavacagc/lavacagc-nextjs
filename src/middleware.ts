import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ACCESS_COOKIE_NAME, verifyAccess } from '@/lib/listings/accessCookie';

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

// Routes that require Supabase admin session authentication
const ADMIN_AUTH_ROUTES = [
  '/api/leads/list',
  '/api/leads/conversations',
  '/api/admin/',
  '/api/banners/admin',
  '/api/feedback/',
  '/api/notify/',
  '/api/follow-up',
  '/vaca-mgmt',
];

// Routes that require CRON_SECRET Bearer token
const CRON_AUTH_ROUTES = [
  '/api/cron/',
];

// Routes that are always public (no auth needed)
const PUBLIC_ROUTES = [
  '/api/leads/webhook',
  '/api/leads/submit',
  '/api/banners',          // Public banner retrieval (GET without /admin)
  '/api/referrals',
  '/api/chat',
  '/api/documents/',
  '/api/buy-and-remodel/', // Newsletter signup / email-verify / unsubscribe (self-guarded)
];

function isPublicRoute(pathname: string): boolean {
  // Exact match for /api/banners (not /api/banners/admin)
  if (pathname === '/api/banners') return true;
  return PUBLIC_ROUTES.some(route => {
    if (route === '/api/banners') return false; // Already handled above
    return pathname.startsWith(route);
  });
}

function requiresAdminAuth(pathname: string): boolean {
  if (isPublicRoute(pathname)) return false;
  return ADMIN_AUTH_ROUTES.some(route => pathname.startsWith(route));
}

function requiresCronAuth(pathname: string): boolean {
  return CRON_AUTH_ROUTES.some(route => pathname.startsWith(route));
}

// "Buy + Remodel" email gate: the gallery (/buy-and-remodel) is a public teaser,
// but each home's DETAIL page (/buy-and-remodel/<slug>) requires a verified-email
// access cookie. The unlock/signup page is itself under the prefix and must never
// be gated (else an infinite redirect loop). The slug `unlock` is reserved.
function requiresEmailGate(pathname: string): boolean {
  if (!pathname.startsWith('/buy-and-remodel/')) return false;
  if (pathname.startsWith('/buy-and-remodel/unlock')) return false;
  return true;
}

// Authoritative, per-navigation check that the subscriber behind a valid access
// cookie is still 'active'. This is what makes unsubscribe revoke access
// immediately — a signed cookie alone would stay valid until expiry. One indexed
// PostgREST lookup via the service key. Fails CLOSED (any error → not allowed),
// so a backend hiccup never leaks gated content.
async function subscriberIsActive(subscriberId: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) return false;
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/newsletter_subscribers?id=eq.${encodeURIComponent(subscriberId)}&status=eq.active&select=id`,
      {
        headers: {
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return false;
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function verifySupabaseSession(request: NextRequest): Promise<boolean> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
            // Middleware can't set cookies during auth check
          },
        },
      }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return false;

    return true;
  } catch {
    return false;
  }
}

function verifyCronSecret(request: NextRequest): { ok: boolean; misconfigured: boolean } {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return { ok: false, misconfigured: true };
  }
  const authHeader = request.headers.get('authorization');
  return { ok: authHeader === `Bearer ${cronSecret}`, misconfigured: false };
}

// Shared-secret auth for internal server-to-server calls to /api/notify/*.
// /api/leads/submit needs to fire lead + error notifications without a
// user session; this header lets it bypass admin auth without exposing the
// notify endpoints to the public internet.
function verifyInternalSecret(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_WEBHOOK_SECRET;
  if (!expected) return false;
  const provided = request.headers.get('x-internal-secret');
  return provided === expected;
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const ua = request.headers.get('user-agent') || '';
  const pathname = request.nextUrl.pathname;

  // 301 redirect non-www to www (permanent — tells Google to consolidate)
  if (host === 'lavacagc.com') {
    const destination = `https://www.lavacagc.com${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(destination, { status: 301 });
  }

  // Block known bad bots (unless they're spoofing a good bot UA)
  if (ua && isBadBot(ua) && !isGoodBot(ua)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // --- Cron route auth (Bearer token) ---
  if (requiresCronAuth(pathname)) {
    const { ok, misconfigured } = verifyCronSecret(request);
    if (misconfigured) {
      return NextResponse.json(
        { error: 'Server misconfiguration: CRON_SECRET not set' },
        { status: 500 }
      );
    }
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // --- Admin route auth (Supabase session) ---
  if (requiresAdminAuth(pathname)) {
    // Server-to-server internal calls to /api/notify/* can authenticate
    // with INTERNAL_WEBHOOK_SECRET instead of a user session.
    if (pathname.startsWith('/api/notify/') && verifyInternalSecret(request)) {
      return NextResponse.next();
    }
    const authenticated = await verifySupabaseSession(request);
    if (!authenticated) {
      // For API routes, return JSON 401
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // For /vaca-mgmt pages, return 401 before serving any JS
      return new NextResponse('Unauthorized', {
        status: 401,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  }

  // --- "Buy + Remodel" email gate (verified-email access cookie) ---
  if (requiresEmailGate(pathname)) {
    const cookie = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
    const verified = await verifyAccess(cookie);
    const allowed = verified ? await subscriberIsActive(verified.subscriberId) : false;
    if (!allowed) {
      // Logged-in admins can preview gated listings without subscribing. Only
      // checked on the redirect path so the common visitor never pays for it.
      const isAdmin = await verifySupabaseSession(request);
      if (!isAdmin) {
        const url = request.nextUrl.clone();
        url.pathname = '/buy-and-remodel/unlock';
        url.search = `?next=${encodeURIComponent(pathname)}`;
        return NextResponse.redirect(url);
      }
    }
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
