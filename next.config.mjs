/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone',
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            // CSP: 'unsafe-inline' required for Next.js, 'unsafe-eval' for web3 libs
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
          },
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
    domains: ["ik.imagekit.io"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.r2.cloudflarestorage.com",
        pathname: "**",
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
