// Comprehensive, production-ready Edge Middleware for Route Protection.
// Enforces US-04 security boundaries before page hydration.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // DEFENSIVE ARCHITECTURE: The "Escape Hatch" to break Middleware vs Interceptor loops.
  // If the client explicitly declares the session dead (via query param), purge cookies immediately.
  if (request.nextUrl.searchParams.get('session_expired') === 'true') {
    const response = NextResponse.next();
    response.cookies.delete('access_token');
    response.cookies.delete('refresh_token');
    return response;
  }

  // DEFENSIVE ARCHITECTURE: Define Strict Route Boundaries
  const isAuthRoute = pathname === '/' || pathname.startsWith('/auth') || pathname.startsWith('/activate');
  const isAdminRoute = pathname.startsWith('/admin');
  const isProtectedRoute = pathname.startsWith('/search') || pathname.startsWith('/upload') || pathname.startsWith('/document') || pathname.startsWith('/dashboard');

  // 1. Extract and Validate Tokens from Cookies
  const accessCookie = request.cookies.get('access_token');
  const refreshCookie = request.cookies.get('refresh_token');
  
  let isValidSession = false;
  let userRole: string | null = null;
  let hasStaleCookie = false;

  const validateToken = (cookie: { value: string } | undefined) => {
    if (!cookie || !cookie.value) return false;
    try {
      const payloadBase64 = cookie.value.split('.')[1];
      if (!payloadBase64) return false;
      
      // Safely add padding to base64 string to prevent atob DOMException crashes
      const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
      
      // Decode the Base64 URL payload natively at the Edge
      const decodedPayload = JSON.parse(atob(base64 + pad));
      const currentTime = Math.floor(Date.now() / 1000);
      
      // Check if token is structurally valid and unexpired
      if (!decodedPayload.exp || decodedPayload.exp > currentTime) {
        if (decodedPayload.role) userRole = decodedPayload.role.toUpperCase();
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

  // 2. Dynamic Role-Based Redirect for Authenticated Users away from Auth Pages
  if (isAuthRoute && isValidSession) {
    if (userRole === 'ADMIN') {
      return NextResponse.redirect(new URL('/admin', request.url));
    } else {
      // ARCHITECTURAL FIX: Both STUDENTS and TEACHERS go to /dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
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

  // 4. Role-Based Access Control (Admin Routes)
  if (isAdminRoute && isValidSession) {
    if (userRole !== 'ADMIN') {
      // ARCHITECTURAL FIX: If a non-admin tries to access admin routes, bounce them to the dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url));
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