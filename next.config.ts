import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep turbopack rooted on this project when parent folders also have lockfiles
  turbopack: {
    root: process.cwd(),
  },
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "kintara.wiki",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://kintara.wiki https://*.kintara.wiki",
              "font-src 'self' data:",
              "connect-src 'self' https://api.dexscreener.com https://api.coingecko.com https://kintara.wiki https://kintaramarket.xyz https://www.kintrade.xyz https://kintara.com https://fanout.kintara.gg",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
