import type { NextConfig } from "next";

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isDev = process.env.NODE_ENV !== "production";

// 'unsafe-inline' for script/style: Next.js hydration + Recharts/Tailwind need it
// without a nonce pipeline. 'unsafe-eval' only for the dev HMR runtime.
// 'wasm-unsafe-eval' lets the Tesseract.js OCR core (WebAssembly, served from
// /public/tesseract — same origin, no CDN) instantiate under a strict CSP.
// worker-src blob: for the PDF.js/Tesseract workers; img-src data: for locally generated QR codes.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin}`.trim(),
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Share URLs carry the secret in the fragment; fragments are never sent in
  // Referer, but no-referrer also keeps /share/<id> itself out of third-party logs.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Provider portal + share APIs serve per-request, sensitive state. Never cache.
      { source: "/share/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
