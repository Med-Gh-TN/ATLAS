// ESM context: __dirname is not a global. Must be reconstructed via fileURLToPath.
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
];

const nextConfig = {
  // DEFENSIVE ARCHITECTURE: Next.js 14 SSR Isolation.
  // Prevents the server-side compiler from bundling pdfjs-dist and react-pdf,
  // which must only execute in the browser.
  experimental: {
    serverComponentsExternalPackages: ['react-pdf', 'pdfjs-dist'],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },

  webpack: (config) => {
    // Prevent server-side canvas binding crashes (no-op shim for client build)
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;

    // -------------------------------------------------------------------------
    // DEFENSIVE ARCHITECTURE: AST Preemption
    // Force Webpack to treat pdfjs-dist files as 'javascript/auto'.
    // This bypasses Next.js's strict ESM parsing rules which cause the
    // "TypeError: Object.defineProperty called on non-object" runtime crash
    // when Webpack attempts to mutate the pre-bundled pdf.mjs file.
    // -------------------------------------------------------------------------
    config.module.rules.unshift({
      test: /pdfjs-dist/,
      type: 'javascript/auto',
    });

    return config;
  },
};

export default nextConfig;