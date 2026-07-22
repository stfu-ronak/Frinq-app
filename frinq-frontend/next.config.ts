import type { NextConfig } from "next";

// Static export (Capacitor-embeddable): no server-only features. Security
// headers previously set via headers() (unsupported under output: "export"
// — see node_modules/next/dist/docs/01-app/02-guides/static-exports.md)
// move to the hosting/native layer instead (DigitalOcean static site config
// or the native shell), not tracked further in this config.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
