import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Security headers added here: HSTS, X-Frame-Options (clickjacking),
  // X-Content-Type-Options (MIME sniffing), Referrer-Policy (limit
  // sensitive URL leak via Referer), Permissions-Policy (lock APIs to
  // mic-only since the quiz uses voice recording).
  //
  // Deliberately NOT setting CSP yet — Next 16 + GA + Clarity need a
  // tuned CSP and a misconfigured one breaks production silently. Will
  // add in a follow-up after staging verification.
  //
  // Cache-Control intentionally NOT set globally: the previous version
  // set `no-store` here, which made Chrome on Android refuse OS-level
  // screenshots ("Couldn't take screenshot due to app restrictions").
  // `export const dynamic = "force-dynamic"` on splash, vibe-box and
  // admin pages is enough to prevent the year-long CDN cache bug.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
