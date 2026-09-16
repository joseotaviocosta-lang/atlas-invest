import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { REFRESH_COOKIE_NAME } from './lib/auth-cookie';

// Routes that require authentication
const PROTECTED_PREFIXES = [
  '/today',
  '/portfolio',
  '/market',
  '/tax',
  '/ai',
  '/profile',
  '/onboarding',
];

// Routes for public authentication only
const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ignore API routes, Next.js internal routes, and static files
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const hasRefreshCookie = request.cookies.has(REFRESH_COOKIE_NAME);

  // Handle Root URL "/"
  if (pathname === '/') {
    if (hasRefreshCookie) {
      return NextResponse.redirect(new URL('/today', request.url));
    } else {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Protect private application routes
  // Security Hardening: Only an authentic refresh token cookie authorizes access.
  // atlas_logged_in is strictly a client-side visual hint and cannot bypass server route protection.
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasRefreshCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from public auth pages
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isAuthRoute && hasRefreshCookie) {
    return NextResponse.redirect(new URL('/today', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
