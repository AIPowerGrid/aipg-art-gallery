/** @type {import('next').NextConfig} */
const nextConfig = {
    // output: 'standalone',
  allowedDevOrigins: ['192.168.66.52'],
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
      'porto': false,
      'porto/internal': false,
      '@safe-global/safe-apps-sdk': false,
      '@safe-global/safe-apps-provider': false,
    };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};

export default nextConfig;
