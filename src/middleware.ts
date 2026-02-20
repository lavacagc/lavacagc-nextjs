import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  // Redirect non-www to www
  if (host === 'lavacagc.com') {
    const url = request.nextUrl.clone();
    url.host = 'www.lavacagc.com';
    return NextResponse.redirect(url, 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*',
};
