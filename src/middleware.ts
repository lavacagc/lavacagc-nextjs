import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  classifyGeo, isGeoTier, GEO_TIER_COOKIE, GEO_TIER_HEADER, GEO_OVERRIDE_COOKIE, type GeoTier,
} from '@/lib/geo/tier';
import { mintVisitorCookieEdge, VISITOR_COOKIE_EDGE } from '@/lib/cta/visitor.edge';
import { CTA_ASSIGN_COOKIE as CTA_ASSIGN_COOKIE_NAME, CTA_COOKIE_MAX_AGE as CTA_COOKIE_MAX_AGE_S } from '@/lib/cta/types';
import { isCrawlerUserAgent, isGoodBot } from '@/lib/botFilter';
import { drawSeed, isServerExperimentPage, PREVIEW_HEADER, PREVIEW_PARAM, PREVIEW_RE, seedFromCookie } from '@/lib/experiments/seed';

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

/**
 * Pages reached by a signed one-tap link that the owner may open from any
 * client (Telegram's in-app browser, a desktop app, a script). The token is
 * the whole credential and is checked before anything is read, so the
 * user-agent filter adds nothing there and could only stand between the owner
 * and an undo (Phase 2 SEC2: the unpublish link is excluded from the bot
 * filter). Exact prefixes; nothing else on the site is exempt.
 */
const BOT_FILTER_EXEMPT_PREFIXES = [
  '/articles/unpublish/', '/api/articles/unpublish/',
  // Slice H: the experiment veto link and its one button, same reasoning.
  '/experiments/veto/', '/api/experiments/veto',
];

function isBotFilterExempt(pathname: string): boolean {
  return BOT_FILTER_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
}

function isBadBot(ua: string): boolean {
  return BAD_BOT_PATTERNS.some(p => p.test(ua));
}

// Routes that require Supabase admin session authentication
const ADMIN_AUTH_ROUTES = [
  '/api/leads/list',
  // CM-01: this queues an email sequence to whatever address it is given, and
  // was public - one anonymous POST mailed any recipient from the verified
  // sending domain. It is an INTERNAL entrypoint (its own docblock says so, and
  // every first-party caller imports createLeadFollowUpSequence directly), so
  // it now authenticates exactly like /api/notify/*: an admin session, or the
  // internal shared secret. Exact path, not a '/api/leads/' prefix, because
  // /api/leads/submit must stay public.
  '/api/leads/webhook',
  '/api/admin/',
  '/api/banners/admin',
  '/api/feedback/',
  '/api/notify/',
  '/api/follow-up',
  '/vaca-mgmt',
];

/**
 * Routes an internal server-to-server caller may reach with
 * INTERNAL_WEBHOOK_SECRET instead of a user session. Everything here can send
 * mail or messages, so the secret is the only alternative to a session - never
 * "no credential at all".
 */
const INTERNAL_SECRET_ROUTES = ['/api/notify/', '/api/leads/webhook'];

// Routes that require CRON_SECRET Bearer token
const CRON_AUTH_ROUTES = [
  '/api/cron/',
];

// Routes that are always public (no auth needed)
const PUBLIC_ROUTES = [
  '/api/webhooks/resend',   // Resend delivery events - auth is the Svix signature
  '/api/preferences',       // Self-service preference center - auth is the token
  '/api/leads/submit',
  '/api/banners',          // Public banner retrieval (GET without /admin)
  '/api/referrals',
  '/api/intake/',       // Tokenized lead intake - auth is the per-session token, self-guarded
  '/api/documents/',
  '/api/buy-and-remodel/', // Unsubscribe only (product retired; links in sent emails must keep working)
  '/api/newsletter/',      // Monthly-newsletter signup (rate-limited, self-guarded)
  '/api/consent/',         // TCPA consent logging (rate-limited, self-guarded)
  '/api/crew/',            // Crew visit confirm - auth is the per-assignment token
  '/api/proposal/',        // Client proposal submit - auth is the per-proposal token, self-guarded
  // Home Services build (docs/home-services/acceptance-criteria.md, SEC). Each
  // of these is self-guarded: honeypot + timing + rate limit + reCAPTCHA on the
  // request routes, a per-recipient token on the offer routes, a rate limit on
  // the CTA event sink, and a constant-time bearer token on the ingest route.
  '/api/home-services/',
  '/api/offers/',
  '/api/cta/',
  '/api/projects/ingest',
  // Phase 2 article routes for Claude Code (docs/articles-ingest.md). Self-
  // guarded like the project ingest: the same constant-time bearer token (404
  // for everyone when it is unset) and a 30-a-minute per-IP rate limit.
  '/api/articles/',
  // Phase 2 slice H (experiments). Self-guarded: the agent routes by the
  // ingest token (404 without it) with their own rate limit, the event sink
  // by a per-IP rate limit and the signed visitor cookie, the veto by its
  // signed token and a rate limit. src/lib/experiments/auth.server.ts.
  '/api/experiments/',
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

/**
 * Where the visitor is, for the round-10 geo gates - classified once here and
 * used twice: the `geo_tier` cookie lets static pages swap form vs notice in
 * the browser, and the stripped-then-set request header is what API routes
 * trust server-side.
 *
 * The local-testing override (`?geo=us` on any URL, or `?geo=off` to clear)
 * is NON-PRODUCTION only and sticky via its own cookie, so the owner can walk
 * a whole flow as a Texan without re-appending the param on every click.
 */
function resolveGeoTier(request: NextRequest): {
  tier: GeoTier;
  /** undefined = leave the override cookie alone; null = clear it. */
  overrideCookie?: string | null;
} {
  const real = classifyGeo(request.headers);
  if (process.env.NODE_ENV === 'production') return { tier: real };

  const param = request.nextUrl.searchParams.get('geo');
  if (param === 'off' || param === 'clear') return { tier: real, overrideCookie: null };
  if (isGeoTier(param)) return { tier: param, overrideCookie: param };
  const sticky = request.cookies.get(GEO_OVERRIDE_COOKIE)?.value;
  if (isGeoTier(sticky)) return { tier: sticky };
  return { tier: real };
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

  // 301 redirect non-www to www (permanent - tells Google to consolidate)
  if (host === 'lavacagc.com') {
    const destination = `https://www.lavacagc.com${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(destination, { status: 301 });
  }

  // The production deployment is also reachable at its *.vercel.app alias,
  // which bypasses Cloudflare. Off Cloudflare, cf-connecting-ip is whatever the
  // caller sends, so every per-IP rate limit on the site could be rotated past
  // one request at a time (security review S-02, 2026-10-29). Sending that
  // host to the canonical one closes the path without touching the header
  // trust order that real customers depend on. Preview deployments keep their
  // vercel.app hosts (VERCEL_ENV is 'preview' there) and sit behind Vercel's
  // own deployment protection.
  if (process.env.VERCEL_ENV === 'production' && host.endsWith('.vercel.app')) {
    const destination = `https://www.lavacagc.com${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(destination, { status: 301 });
  }

  // Block known bad bots (unless they're spoofing a good bot UA)
  if (ua && isBadBot(ua) && !isGoodBot(ua) && !isBotFilterExempt(pathname)) {
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
    if (INTERNAL_SECRET_ROUTES.some((r) => pathname.startsWith(r)) && verifyInternalSecret(request)) {
      return NextResponse.next();
    }
    const authenticated = await verifySupabaseSession(request);
    if (!authenticated) {
      // For API routes, return JSON 401
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      // A PAGE request gets sent to the sign-in screen rather than a dead end.
      //
      // This used to answer a bare 401 with a twelve-byte 'Unauthorized' body.
      // The security intent was right - serve no admin JS to someone who is not
      // signed in - but there was no way FORWARD from it: any device without a
      // session cookie (a phone, a different laptop) hit plain text with no
      // login form and no link, which browsers render as an unreachable page.
      // The sign-in screen existed at /auth the whole time; nothing pointed at
      // it.
      //
      // The redirect keeps the property that mattered: still no admin code is
      // served here. `next` carries the page they actually wanted so signing in
      // returns them to it instead of dumping them on the dashboard root. It is
      // validated as a same-origin path on the way back out (see /auth), so it
      // cannot be used to bounce anyone to another site.
      const signIn = new URL('/auth', request.url);
      signIn.searchParams.set('next', pathname + request.nextUrl.search);
      return NextResponse.redirect(signIn);
    }
  }

  // --- Geo tier (round 10, Phase A: signage + telemetry, no refusals) ---
  // The incoming header is ALWAYS stripped before ours is set: x-geo-tier is
  // only ever the middleware's own reading, never a client's claim.
  const { tier, overrideCookie } = resolveGeoTier(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(GEO_TIER_HEADER);
  requestHeaders.set(GEO_TIER_HEADER, tier);

  // --- Experiments (Phase 2 slice H) ---
  // The preview header is only ever ours: stripped, then set for a signed-in
  // admin who asked with ?exp=<key>:<variant> (withExperiment shows that
  // variant and records nothing).
  requestHeaders.delete(PREVIEW_HEADER);
  const isBot = isCrawlerUserAgent(ua);
  const preview = request.nextUrl.searchParams.get(PREVIEW_PARAM);
  if (preview && PREVIEW_RE.test(preview) && !pathname.startsWith('/api/') && (await verifySupabaseSession(request))) {
    requestHeaders.set(PREVIEW_HEADER, preview);
  }
  // Pages that apply experiments on the server need the visitor's assignment
  // seed (`R` in cta_v) before they render. On a human's first visit it is
  // drawn here, set on the response, and added to this request's own cookie
  // header so the render already uses it. The homepage keeps drawing its seed
  // in the pre-paint script, which reads an `R` set here as its own.
  let mintedSeed: string | null = null;
  if (isServerExperimentPage(pathname) && !isBot && !seedFromCookie(request.cookies.get(CTA_ASSIGN_COOKIE_NAME)?.value)) {
    mintedSeed = drawSeed();
    const others = (request.headers.get('cookie') ?? '')
      .split(/;\s*/)
      .filter((c) => c && !c.startsWith(`${CTA_ASSIGN_COOKIE_NAME}=`));
    requestHeaders.set('cookie', [...others, `${CTA_ASSIGN_COOKIE_NAME}=R%3D${mintedSeed}`].join('; '));
  }

  // For good bots and suspected bots: set a header so client-side code can skip analytics
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Readable by the browser on purpose - static pages stay static and swap
  // form vs notice client-side off this cookie. Short-lived so a traveler's
  // tier follows them rather than their first visit.
  if (request.cookies.get(GEO_TIER_COOKIE)?.value !== tier) {
    response.cookies.set(GEO_TIER_COOKIE, tier, { path: '/', sameSite: 'lax', maxAge: 3600 });
  }
  if (overrideCookie === null) {
    response.cookies.delete(GEO_OVERRIDE_COOKIE);
  } else if (overrideCookie !== undefined && request.cookies.get(GEO_OVERRIDE_COOKIE)?.value !== overrideCookie) {
    response.cookies.set(GEO_OVERRIDE_COOKIE, overrideCookie, { path: '/', sameSite: 'lax' });
  }

  // The counting id (cta_vid) is issued with the first response of a page
  // that renders an experiment - the homepage hero and the server-rendered
  // experiment pages - so the view and click beacons never depend on each
  // other's Set-Cookie (see src/lib/cta/visitor.edge.ts). Only humans are
  // counted, and a visitor who already has one keeps it.
  const secure = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  if ((pathname === '/' || isServerExperimentPage(pathname)) && !isBot && !request.cookies.get(VISITOR_COOKIE_EDGE.name)) {
    const minted = await mintVisitorCookieEdge();
    if (minted) response.cookies.set(VISITOR_COOKIE_EDGE.name, minted, VISITOR_COOKIE_EDGE.options(secure));
  }
  if (mintedSeed) {
    // Same name, format and lifetime the pre-paint script writes (URI-encoded
    // by the cookie serializer into R%3D<seed>); readable by that script.
    response.cookies.set(CTA_ASSIGN_COOKIE_NAME, `R=${mintedSeed}`, { path: '/', sameSite: 'lax', secure, maxAge: CTA_COOKIE_MAX_AGE_S });
  }

  // Detect if this looks like a bot (no UA, or matches known bot patterns)
  if (isBot) {
    response.headers.set('x-is-bot', '1');
  }

  return response;
}

export const config = {
  // Pages and API routes only. Static assets, the image optimizer, fonts and
  // favicons never needed the bot filter, the geo cookie or the admin check,
  // and they were most of half a million invocations a month
  // (docs/cost-review.md).
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|images/|fonts/|logo\\.|robots\\.txt|sitemap\\.xml).*)'],
};
