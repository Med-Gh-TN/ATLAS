import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
// @ts-expect-error next-pwa doesn't have official types
import withPWAInit from "next-pwa";
import createMDX from "@next/mdx";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    providerImportSource: "@mdx-js/react",
  },
});

const legacyPdfJsEntry = "pdfjs-dist/legacy/build/pdf.mjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  generateEtags: true,
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  turbopack: {
    resolveAlias: {
      "pdfjs-dist": legacyPdfJsEntry,
    },
  },
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(typeof config.resolve.alias === "object" ? config.resolve.alias : {}),
      "pdfjs-dist": legacyPdfJsEntry,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; frame-src 'self' http://localhost:9000 https://minio.atlas.tn; connect-src 'self' blob: http://localhost:8000 http://127.0.0.1:8000 http://localhost:9000 ws://localhost:8000 ws://127.0.0.1:8000 ws://localhost:3000 https://api.atlas.tn wss://api.atlas.tn",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, immutable",
          },
        ],
      },
    ];
  },
};

export default withAnalyzer(withPWA(withMDX(nextConfig)));
