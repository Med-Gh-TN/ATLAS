// Comprehensive, production-ready Edge Middleware for Route Protection.
// Enforces US-04 security boundaries before page hydration.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // DEFENSIVE ARCHITECTURE: Define Strict Route Boundaries
  const isAuthRoute = pathname.startsWith('/auth') || pathname.startsWith('/activate');
  const isAdminRoute = pathname.startsWith('/admin');
  const isProtectedRoute = pathname.startsWith('/search') || pathname.startsWith('/upload') || pathname.startsWith('/document');

  // 1. Extract and Validate Tokens from Cookies
  const accessCookie = request.cookies.get('access_token');
  const refreshCookie = request.cookies.get('refresh_token');
  
  let isValidSession = false;
  let userRole = null;
  let hasStaleCookie = false;

  const validateToken = (cookie: { value: string } | undefined) => {
    if (!cookie || !cookie.value) return false;
    try {
      const payloadBase64 = cookie.value.split('.')[1];
      if (!payloadBase64) return false;
      
      // Decode the Base64 URL payload natively at the Edge
      const decodedPayload = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Check if token is structurally valid and unexpired
      if (!decodedPayload.exp || decodedPayload.exp > currentTime) {
        if (decodedPayload.role) userRole = decodedPayload.role;
        return true;
      }
    } catch (error) {
      console.error("[Security] Middleware JWT Decode Error:", error);
    }
    return false;
  };

  // Check if at least one token is valid and unexpired
  if (validateToken(accessCookie) || validateToken(refreshCookie)) {
    isValidSession = true;
  } else if (accessCookie || refreshCookie) {
    hasStaleCookie = true; // Tokens exist but are completely expired or malformed
  }

  // 2. Redirect Authenticated Users Away from Auth Pages
  if (isAuthRoute && isValidSession) {
    return NextResponse.redirect(new URL('/search', request.url));
  }

  // 3. Protect Application Routes from Unauthenticated Users
  if ((isProtectedRoute || isAdminRoute) && !isValidSession) {
    const url = new URL('/auth/login', request.url);
    url.searchParams.set('callbackUrl', pathname);
    
    const response = NextResponse.redirect(url);
    
    // Defensive Architecture: Clean up ghost sessions on redirect
    if (hasStaleCookie) {
      response.cookies.delete('access_token');
      response.cookies.delete('refresh_token');
    }
    return response;
  }

  // 4. Role-Based Access Control (Admin & Teacher Routes)
  if (isAdminRoute && isValidSession) {
    if (userRole !== 'ADMIN' && userRole !== 'TEACHER') {
      return NextResponse.redirect(new URL('/search', request.url));
    }
  }

  // 5. Allow Request and Purge Stale Cookies for Public/Auth Routes
  const response = NextResponse.next();
  if (hasStaleCookie && !isValidSession) {
    response.cookies.delete('access_token');
    response.cookies.delete('refresh_token');
  }

  return response;
}

// Configure the strict paths that trigger this middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (Next.js backend proxy routes, if any)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sw.js & manifest.json (PWA configuration)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json).*)',
  ],
};