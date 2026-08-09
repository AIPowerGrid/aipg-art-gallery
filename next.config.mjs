/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone',
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async rewrites() {
    // Mirror the production nginx contract: the browser talks to a single origin
    // and /api is proxied to the Go backend. This runs only when Next handles the
    // request directly (dev, or `next start` without nginx). Next's own /api route
    // handlers (og, download) are matched by the filesystem first, so only
    // unmatched /api/* is forwarded here.
    const backend = process.env.GALLERY_API_ORIGIN ?? "http://localhost:4000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Content-Security-Policy is set per-request in middleware.ts so it can
          // carry a unique nonce and drop 'unsafe-inline' from script-src.
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
  images: {
    // Pin to specific hosts. A wildcard like **.r2.cloudflarestorage.com would
    // turn the Next image optimizer into an open proxy for ANY R2 bucket.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ik.imagekit.io",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.aipg.art",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "media.aipg.art",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "a9b7416008b496f49b0f021099cc4128.r2.cloudflarestorage.com",
        pathname: "/**",
      },
    ],
  },
  webpack: (config) => {
    // Fix for wagmi connector module resolution issues
    config.resolve.fallback = {
      ...config.resolve.fallback,
      porto: false,
      "porto/internal": false,
      "@safe-global/safe-apps-sdk": false,
      "@safe-global/safe-apps-provider": false,
      "@react-native-async-storage/async-storage": false,
    };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
