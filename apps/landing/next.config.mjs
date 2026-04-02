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
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
              "img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://firebasestorage.googleapis.com https://*.memron.ai https://www.gstatic.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.memron.ai https://api.github.com",
              "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://memron-2db.firebaseapp.com https://challenges.cloudflare.com https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com",
              "worker-src 'self' blob:",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
