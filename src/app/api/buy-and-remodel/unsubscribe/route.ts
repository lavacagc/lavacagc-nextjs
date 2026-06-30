import { NextRequest, NextResponse } from 'next/server';
import { findByUnsubscribeToken, updateSubscriber } from '@/lib/listings/subscribers';
import {
  ACCESS_COOKIE_NAME,
  accessCookieOptions,
  KNOWN_COOKIE_NAME,
  knownCookieOptions,
} from '@/lib/listings/accessCookie';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function page(origin: string, title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${title} · La Vaca General Contractors</title>
  <style>
    body{margin:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#222}
    .wrap{max-width:520px;margin:0 auto;padding:48px 20px;text-align:center}
    .card{background:#fff;border:1px solid #ddd;border-radius:16px;padding:40px 28px}
    h1{font-size:24px;margin:0 0 12px;letter-spacing:-0.02em}
    p{font-size:16px;line-height:26px;color:#444;margin:0 0 8px}
    a.btn{display:inline-block;margin-top:20px;background:#ea580c;color:#fff;text-decoration:none;font-weight:600;padding:13px 26px;border-radius:8px}
    .muted{color:#717171;font-size:13px;margin-top:20px}
  </style>
</head>
<body>
  <div class="wrap"><div class="card">
    <h1>${title}</h1>
    ${body}
    <a class="btn" href="${origin}/buy-and-remodel/unlock">Re-subscribe to access listings</a>
    <p class="muted">La Vaca General Contractors · Northern New Jersey</p>
  </div></div>
</body>
</html>`;
}

function html(origin: string, title: string, body: string, clearCookie: boolean): NextResponse {
  const res = new NextResponse(page(origin, title, body), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  if (clearCookie) {
    res.cookies.set(ACCESS_COOKIE_NAME, '', accessCookieOptions(0));
    res.cookies.set(KNOWN_COOKIE_NAME, '', knownCookieOptions(0));
  }
  return res;
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return html(origin, 'Invalid link', '<p>This unsubscribe link is invalid.</p>', false);
  }

  try {
    const sub = await findByUnsubscribeToken(token);
    if (!sub) {
      return html(origin, 'Already unsubscribed', "<p>We couldn't find an active subscription for this link. You're all set.</p>", true);
    }

    if (sub.status !== 'unsubscribed') {
      await updateSubscriber(sub.id, {
        status: 'unsubscribed',
        unsubscribed_at: new Date().toISOString(),
        verify_token: null,
        verify_token_expires_at: null,
      });
    }

    return html(
      origin,
      "You're unsubscribed",
      "<p>You've been removed from the La Vaca Buy + Remodel newsletter and your listing access has been revoked.</p><p>You can re-subscribe any time to regain access.</p>",
      true,
    );
  } catch (error) {
    console.error('Buy+Remodel unsubscribe error:', error);
    return html(origin, 'Something went wrong', '<p>We had trouble processing your request. Please try again later.</p>', false);
  }
}
