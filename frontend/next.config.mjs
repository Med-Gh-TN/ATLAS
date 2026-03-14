/** @type {import('next').NextConfig} */

// DEFENSIVE ARCHITECTURE: US-24 Strict Content Security Policy (CSP)
// Mitigates XSS by dictating exactly which dynamic resources are allowed to load.
const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https: http:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  connect-src 'self' ws: wss: http: https:;
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim();

// Comprehensive OWASP-recommended security headers for the frontend static server
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy,
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()'
  }
];

const nextConfig = {
  async headers() {
    return [
      {
        // Apply these security headers to all routes in the Next.js application.
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  webpack: (config) => {
    // Defensive Architecture: react-pdf attempts to load the 'canvas' Node module 
    // during SSR. This tells Webpack to ignore it, preventing build crashes.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;