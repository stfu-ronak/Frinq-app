import type { NextConfig } from "next";

// Admin is server-deployed (no output: "export") specifically so this
// headers() function can run — static export can't set response headers,
// and this app needs them more than the consumer app ever did (internal
// tool holding submission PII + destructive controls).
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              `connect-src 'self' ${apiUrl}`,
              "img-src 'self' data: blob:",
              "media-src 'self' blob:",
              "font-src 'self'",
              // 'unsafe-inline' is required here: Next's App Router bootstraps
              // hydration via inline <script>/style attributes with no nonce
              // support outside a custom proxy/middleware setup (see Next's
              // own CSP docs, "Without Nonces"). A strict script-src 'self'
              // alone would block hydration entirely — the whole app would
              // render but never become interactive.
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
