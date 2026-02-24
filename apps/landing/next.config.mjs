/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
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
  },
};

export default nextConfig;
