/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  logging: {
    fetches: {
      fullUrl: false,
    },
    incomingRequests: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.memron.ai' },
      { protocol: 'https', hostname: 'img.clerk.com' },
      { protocol: 'https', hostname: 'img.clerkusercontent.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  // Exclude Node.js-only packages from Edge/Middleware bundling
  serverExternalPackages: ['pg', 'firebase', 'firebase-admin'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', 'gsap'],
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'localhost:3001',
        '*.app.github.dev',
        '*.github.dev',
        '*.githubpreview.dev',
        '*.vercel.app',
        'memron.ai',
        '*.memron.ai',
      ],
    },
  },
  // Security headers — applied to all routes on Vercel + self-host
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://*.clerk.accounts.dev",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: blob: https://img.clerk.com https://img.clerkusercontent.com https://*.memron.ai",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.dev https://api.clerk.com wss://*.clerk.accounts.dev https://*.memron.ai https://api.github.com",
              "frame-src 'self' https://challenges.cloudflare.com https://*.clerk.accounts.dev https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
